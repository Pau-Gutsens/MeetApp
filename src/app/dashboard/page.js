'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function Dashboard() {
    const router = useRouter()
    const [user, setUser] = useState(null)
    const [loading, setLoading] = useState(true)
    const [groups, setGroups] = useState([]) // Array of groups
    const [showCreateJoin, setShowCreateJoin] = useState(false)

    // Create/Join States
    const [viewMode, setViewMode] = useState('main') // 'main', 'create', 'join', 'requests'
    const [inputName, setInputName] = useState('')
    const [joinCode, setJoinCode] = useState('')
    const [apodo, setApodo] = useState('')
    const [pendingRequests, setPendingRequests] = useState([])
    const [msg, setMsg] = useState('')

    useEffect(() => {
        const init = async () => {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) {
                router.push('/auth')
                return
            }
            setUser(session.user)
            await fetchGroups(session.user.id)
            setLoading(false)
        }
        init()
    }, [router])

    const fetchGroups = async (userId) => {
        const { data, error } = await supabase
            .from('MiembroGrupo')
            .select('id_grupo, Grupo(*)')
            .eq('id_usuario', userId)

        if (data) {
            const groupList = data.map(m => m.Grupo).filter(g => g !== null)
            setGroups(groupList)
            // Fetch requests for all groups the user is in
            groupList.forEach(g => fetchRequests(g.id_grupo))
        }
    }

    useEffect(() => {
        if (!user) return

        // Requester side: Listen for my own request updates
        const myRequestsChannel = supabase
            .channel(`my-requests-${user.id}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'SolicitudUnion',
                filter: `id_usuario=eq.${user.id}`
            }, (payload) => {
                if (payload.new.estado === 'aceptada') {
                    fetchGroups(user.id)
                }
                // Update local msg state if needed
                setMsg(payload.new.estado === 'aceptada' ? '¡Solicitud aceptada!' : 'Solicitud rechazada.')
            })
            .subscribe()

        return () => { supabase.removeChannel(myRequestsChannel) }
    }, [user])

    useEffect(() => {
        if (groups.length === 0) return

        const channels = groups.map(g => {
            return supabase
                .channel(`requests-${g.id_grupo}`)
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'SolicitudUnion',
                    filter: `id_grupo=eq.${g.id_grupo}`
                }, () => {
                    fetchRequests(g.id_grupo)
                })
                .subscribe()
        })

        return () => { channels.forEach(ch => supabase.removeChannel(ch)) }
    }, [groups])

    const fetchRequests = async (groupId) => {
        const { data } = await supabase
            .from('SolicitudUnion')
            .select('*, Usuario(email, id_usuario), Grupo(nombre)')
            .eq('id_grupo', groupId)
            .eq('estado', 'pendiente')

        setPendingRequests(prev => {
            // Merge results and avoid duplicates
            const otherGroups = prev.filter(p => p.id_grupo !== groupId)
            return [...otherGroups, ...(data || [])]
        })
    }

    const handleCreate = async () => {
        if (!inputName.trim()) return
        const invitationCode = Math.random().toString(36).substring(2, 8).toUpperCase();

        const { data, error } = await supabase
            .from('Grupo')
            .insert({
                nombre: inputName,
                codigo_invitacion: invitationCode
            })
            .select()
            .single()

        if (error) { setMsg(error.message); return }

        // Add as admin in MiembroGrupo
        await supabase.from('MiembroGrupo').insert({
            id_usuario: user.id,
            id_grupo: data.id_grupo,
            rol: 'admin',
            apodo: apodo.trim() || null
        })

        await fetchGroups(user.id)
        setViewMode('main')
        setInputName('')
        setApodo('')
    }

    const handleJoinByCode = async () => {
        setMsg('')
        if (!joinCode.trim()) return

        // 1. Find group by code (using ilike for case-insensitive search if DB has mixed cases)
        const { data: targetGroup, error: findError } = await supabase
            .from('Grupo')
            .select('id_grupo, nombre')
            .ilike('codigo_invitacion', joinCode.trim())
            .single()

        if (findError || !targetGroup) {
            setMsg('Código no válido o grupo no encontrado.')
            return
        }

        // 2. Create request
        const { error: requestError } = await supabase
            .from('SolicitudUnion')
            .insert({
                id_usuario: user.id,
                id_grupo: targetGroup.id_grupo
            })

        if (requestError) {
            setMsg('Ya has solicitado unirte a este grupo o hubo un error.')
        } else {
            setMsg(`Solicitud enviada a ${targetGroup.nombre}. Espera a que el admin te acepte.`)
            setJoinCode('')
        }
    }

    const handleAcceptRequest = async (request) => {
        const { error } = await supabase
            .from('SolicitudUnion')
            .update({ estado: 'aceptada' })
            .eq('id', request.id)

        if (error) {
            alert(`Error al aceptar: ${error.message}`)
            return
        }
        fetchRequests(request.id_grupo)
    }

    const handleRejectRequest = async (requestId, groupId) => {
        const { error } = await supabase
            .from('SolicitudUnion')
            .update({ estado: 'rechazada' })
            .eq('id', requestId)

        if (error) {
            alert(`Error al rechazar: ${error.message}`)
            return
        }
        fetchRequests(groupId)
    }



    if (loading) return <div className="h-screen flex items-center justify-center font-black text-2xl text-indigo-600 uppercase tracking-tighter animate-pulse">Cargando...</div>

    return (
        <div className="min-h-screen bg-gray-50 relative font-sans text-gray-900">

            {/* 1. PROFILE BUTTON: Top Left */}
            <Link
                href="/profile"
                className="fixed top-6 left-6 z-50 bg-white p-3 rounded-full shadow-lg border border-indigo-50 hover:bg-indigo-50 transition-all hover:scale-110"
                title="Mi Perfil"
            >
                <div className="h-6 w-6 text-indigo-600">
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                </div>
            </Link>

            {/* MAIN CONTENT AREA */}
            <div className="max-w-full mx-auto pt-24 pb-32 px-6 lg:px-12">

                {/* CASE: NO GROUPS OR EXPLICIT CREATE/JOIN MODE */}
                {(groups.length === 0 || viewMode === 'create' || viewMode === 'join') ? (
                    <div className="space-y-6 animate-fade-in">
                        <h1 className="text-4xl font-black text-gray-900 mb-10 text-center uppercase tracking-tighter">
                            {groups.length === 0 ? 'Bienvenido' : 'Nuevo Grupo'}
                        </h1>

                        {viewMode === 'main' && groups.length === 0 && (
                            <div className="space-y-4">
                                <button
                                    onClick={() => setViewMode('create')}
                                    className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black text-xl shadow-lg hover:bg-indigo-700 transition-all uppercase"
                                >
                                    Crear Grupo
                                </button>
                                <button
                                    onClick={() => { setViewMode('join'); setMsg(''); }}
                                    className="w-full py-5 bg-white text-indigo-600 border border-indigo-100 rounded-2xl font-black text-xl shadow-md hover:bg-indigo-50 transition-all uppercase"
                                >
                                    Unirse
                                </button>
                            </div>
                        )}

                        {viewMode === 'create' && (
                            <div className="bg-white p-8 rounded-3xl shadow-xl border-t-8 border-indigo-500">
                                <h3 className="text-xl font-black mb-4 uppercase text-gray-800">Nombre del Grupo</h3>
                                <input
                                    className="w-full bg-gray-50 p-4 rounded-xl mb-4 text-lg font-bold text-black border-transparent focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                                    placeholder="Ej: Los Fotógrafos"
                                    autoFocus
                                    value={inputName}
                                    onChange={e => setInputName(e.target.value)}
                                />
                                <h3 className="text-sm font-black mb-2 uppercase text-gray-400">Tu Apodo (Opcional)</h3>
                                <input
                                    className="w-full bg-gray-50 p-3 rounded-xl mb-6 text-sm font-bold text-black border-transparent focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                                    placeholder="Cómo te verán en este grupo..."
                                    onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                                    value={apodo}
                                    onChange={e => setApodo(e.target.value)}
                                />
                                {msg && <p className="text-red-500 text-xs font-black uppercase mb-4">{msg}</p>}
                                <div className="flex gap-4">
                                    <button onClick={() => { setViewMode('main'); setApodo(''); }} className="flex-1 py-3 font-bold text-gray-500 hover:text-black transition-colors uppercase">Cerrar</button>
                                    <button onClick={handleCreate} className="flex-1 py-3 bg-indigo-600 text-white font-black rounded-xl shadow-lg hover:bg-indigo-700 transition-all uppercase">Crear</button>
                                </div>
                            </div>
                        )}

                        {viewMode === 'join' && (
                            <div className="bg-white p-8 rounded-3xl shadow-xl border-t-8 border-indigo-500">
                                <h3 className="text-xl font-black mb-4 uppercase text-gray-800">Unirse con código</h3>
                                <input
                                    className="w-full bg-gray-50 p-4 rounded-xl mb-6 text-center font-black text-3xl text-black uppercase tracking-widest border-transparent focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                                    placeholder="CÓDIGO"
                                    maxLength={6}
                                    autoFocus
                                    onKeyDown={(e) => e.key === 'Enter' && handleJoinByCode()}
                                    value={joinCode}
                                    onChange={e => setJoinCode(e.target.value.toUpperCase())}
                                />
                                {msg && <p className={`text-xs font-black uppercase mb-6 ${msg.includes('enviada') ? 'text-green-600' : 'text-red-500'}`}>{msg}</p>}
                                <div className="flex gap-4">
                                    <button onClick={() => { setViewMode('main'); setMsg(''); }} className="flex-1 py-3 font-bold text-gray-500 hover:text-black transition-colors uppercase">Volver</button>
                                    <button onClick={handleJoinByCode} className="flex-1 py-3 bg-indigo-600 text-white font-black rounded-xl shadow-lg hover:bg-indigo-700 transition-all uppercase">OK</button>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    /* CASE: LIST VIEW */
                    <div className="space-y-6 animate-fade-in">
                        <div className="mb-10">
                            <h1 className="text-4xl font-black uppercase tracking-tighter text-gray-900">Mis Grupos</h1>
                        </div>

                        <div className="space-y-4">
                            {groups.map(g => (
                                <Link
                                    key={g.id_grupo}
                                    href={`/groups?id=${g.id_grupo}`}
                                    className="block bg-white p-6 rounded-2xl shadow-md border-l-4 border-indigo-500 hover:translate-x-1 hover:shadow-lg transition-all group"
                                >
                                    <div className="flex justify-between items-center">
                                        <h2 className="text-2xl font-black uppercase tracking-tight group-hover:text-indigo-600 transition-colors">{g.nombre}</h2>
                                        <div className="bg-indigo-50 px-3 py-1 rounded-lg">
                                            <span className="text-xs font-black text-indigo-600 tracking-widest">{g.codigo_invitacion?.toUpperCase()}</span>
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>

                        {/* Notifications section */}
                        {pendingRequests.length > 0 && (
                            <div className="mt-16 bg-white p-6 rounded-3xl shadow-lg border border-indigo-50">
                                <h3 className="text-sm font-black uppercase tracking-widest text-indigo-400 mb-6 flex items-center gap-2">
                                    <span className="h-2 w-2 bg-indigo-500 rounded-full animate-ping"></span>
                                    Solicitudes Pendientes
                                </h3>
                                <div className="space-y-3">
                                    {pendingRequests.map(req => (
                                        <div key={req.id} className="flex items-center justify-between p-3 bg-indigo-50 rounded-xl">
                                            <div>
                                                <p className="text-[10px] font-black uppercase text-indigo-400">{req.Grupo?.nombre}</p>
                                                <p className="text-xs font-bold text-gray-700">{req.Usuario?.email}</p>
                                            </div>
                                            <div className="flex gap-2">
                                                <button onClick={() => handleRejectRequest(req.id, req.id_grupo)} className="px-3 py-1 text-red-600 font-black text-[10px] uppercase hover:bg-red-50 rounded-lg transition-colors">No</button>
                                                <button onClick={() => handleAcceptRequest(req)} className="px-3 py-1 bg-indigo-600 text-white rounded-lg font-black text-[10px] uppercase shadow-sm hover:bg-indigo-700 transition-all">Sí</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* FLOATING ACTION BUTTON (FAB) */}
            {viewMode === 'main' && groups.length > 0 && (
                <div className="fixed bottom-10 right-10 flex flex-col items-end gap-4 z-50">
                    {showCreateJoin && (
                        <div className="flex flex-col gap-3 animate-slide-up bg-indigo-600 p-2 rounded-2xl shadow-2xl mb-2">
                            <button
                                onClick={() => { setViewMode('join'); setMsg(''); setShowCreateJoin(false); }}
                                className="bg-white text-indigo-600 px-6 py-3 rounded-xl font-black uppercase text-sm hover:bg-indigo-50 transition-all shadow-sm"
                            >
                                Unirse
                            </button>
                            <button
                                onClick={() => { setViewMode('create'); setShowCreateJoin(false); }}
                                className="bg-white text-indigo-600 px-6 py-3 rounded-xl font-black uppercase text-sm hover:bg-indigo-50 transition-all shadow-sm"
                            >
                                Crear
                            </button>
                        </div>
                    )}
                    <button
                        onClick={() => setShowCreateJoin(!showCreateJoin)}
                        className={`h-20 w-20 bg-indigo-600 rounded-full flex items-center justify-center shadow-xl hover:bg-indigo-700 hover:scale-105 active:scale-95 transition-all group`}
                    >
                        <div className={`h-10 w-10 text-white transition-transform duration-300 ${showCreateJoin ? 'rotate-45' : ''}`}>
                            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M12 4v16m8-8H4" />
                            </svg>
                        </div>
                    </button>
                </div>
            )}

        </div>
    )
}
