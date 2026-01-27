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
            rol: 'admin'
        })

        await fetchGroups(user.id)
        setViewMode('main')
        setInputName('')
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



    if (loading) return <div className="h-screen flex items-center justify-center">Cargando...</div>

    return (
        <div className="min-h-screen bg-gray-50 relative p-6 font-sans">

            {/* 1. PROFILE BUTTON: Top Left (Floating) */}
            <Link
                href="/profile"
                className="absolute top-6 left-6 z-50 bg-white p-3 rounded-full shadow-lg hover:bg-gray-100 transition-transform hover:scale-105"
                title="Mi Perfil"
            >
                <div className="h-8 w-8 text-indigo-600">
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                </div>
            </Link>

            {/* MAIN CONTENT AREA */}
            <div className="h-full flex flex-col items-center justify-center min-h-[80vh]">

                {/* CASE: NO GROUPS OR EXPLICIT CREATE/JOIN MODE */}
                {(groups.length === 0 || viewMode === 'create' || viewMode === 'join') ? (
                    <div className="w-full max-w-md space-y-6 text-center animate-fade-in">
                        <h1 className="text-3xl font-bold text-gray-800 mb-8">
                            {groups.length === 0 ? 'Bienvenido' : 'Nuevo Grupo'}
                        </h1>

                        {(viewMode === 'main' || groups.length === 0 && viewMode === 'main') && (
                            <div className="space-y-4">
                                <button
                                    onClick={() => setViewMode('create')}
                                    className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold shadow-lg hover:bg-indigo-700 transition-all"
                                >
                                    Crear Grupo
                                </button>
                                <button
                                    onClick={() => { setViewMode('join'); setMsg(''); }}
                                    className="w-full py-4 bg-white text-indigo-600 border-2 border-indigo-100 rounded-xl font-bold shadow-lg hover:bg-indigo-50 transition-all"
                                >
                                    Unirse con Código
                                </button>
                            </div>
                        )}

                        {viewMode === 'create' && (
                            <div className="bg-white p-6 rounded-xl shadow-xl">
                                <h3 className="text-lg font-bold mb-4">Nombre del Grupo</h3>
                                <input
                                    className="w-full border p-3 rounded mb-4"
                                    placeholder="Ej: Los Viajeros, Familia..."
                                    value={inputName}
                                    onChange={e => setInputName(e.target.value)}
                                />
                                {msg && <p className="text-red-500 text-sm mb-2">{msg}</p>}
                                <div className="flex gap-2">
                                    <button onClick={() => setViewMode('main')} className="flex-1 py-2 text-gray-500">Cancelar</button>
                                    <button onClick={handleCreate} className="flex-1 py-2 bg-indigo-600 text-white rounded font-bold">Crear</button>
                                </div>
                            </div>
                        )}

                        {viewMode === 'join' && (
                            <div className="bg-white p-6 rounded-xl shadow-xl">
                                <h3 className="text-lg font-bold mb-4">Unirse con Código</h3>
                                <input
                                    className="w-full border p-3 rounded mb-4 text-center font-black text-xl uppercase tracking-widest"
                                    placeholder="CÓDIGO"
                                    maxLength={6}
                                    value={joinCode}
                                    onChange={e => setJoinCode(e.target.value.toUpperCase())}
                                />
                                {msg && <p className={`text-sm mb-4 font-bold ${msg.includes('enviada') ? 'text-green-600' : 'text-red-500'}`}>{msg}</p>}
                                <div className="flex gap-2">
                                    <button onClick={() => { setViewMode('main'); setMsg(''); }} className="flex-1 py-2 text-gray-500">Volver</button>
                                    <button onClick={handleJoinByCode} className="flex-1 py-2 bg-indigo-600 text-white rounded font-bold shadow-md">Solicitar</button>
                                </div>
                            </div>
                        )}

                        {groups.length > 0 && viewMode !== 'main' && (
                            <button onClick={() => setViewMode('main')} className="mt-4 text-indigo-600 font-bold">Ver mis grupos</button>
                        )}
                    </div>
                ) : (
                    /* CASE: HAS GROUPS -> LIST CARDS */
                    <div className="w-full max-w-4xl animate-fade-in">
                        <div className="flex justify-between items-end mb-8">
                            <div>
                                <h1 className="text-3xl font-black text-gray-900">Mis Grupos</h1>
                                <p className="text-gray-500">Selecciona un grupo para entrar</p>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setViewMode('join')}
                                    className="px-4 py-2 bg-white text-indigo-600 border border-indigo-100 rounded-xl font-bold shadow-sm hover:bg-indigo-50"
                                >
                                    Unirse
                                </button>
                                <button
                                    onClick={() => setViewMode('create')}
                                    className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold shadow-md hover:bg-indigo-700"
                                >
                                    + Nuevo
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {groups.map(g => (
                                <Link
                                    key={g.id_grupo}
                                    href={`/groups?id=${g.id_grupo}`}
                                    className="bg-white p-6 rounded-3xl shadow-lg border-t-4 border-indigo-500 hover:scale-[1.02] transition-all group"
                                >
                                    <div className="flex justify-between items-start mb-4">
                                        <h2 className="text-2xl font-black text-gray-800 group-hover:text-indigo-600 transition-colors">{g.nombre}</h2>
                                        <div className="bg-indigo-50 px-2 py-1 rounded-lg">
                                            <span className="text-[10px] font-black text-indigo-400 uppercase tracking-tighter">Código</span>
                                            <p className="text-xs font-bold text-indigo-600">{g.codigo_invitacion?.toUpperCase()}</p>
                                        </div>
                                    </div>
                                    <p className="text-gray-400 text-sm font-medium">Toca para entrar &rarr;</p>
                                </Link>
                            ))}
                        </div>

                        {/* Global Notifications */}
                        {pendingRequests.length > 0 && (
                            <div className="mt-12">
                                <h3 className="text-lg font-black text-gray-800 mb-4 flex items-center gap-2">
                                    <span className="relative flex h-3 w-3">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                                    </span>
                                    Avisos Pendientes
                                </h3>
                                <div className="space-y-3">
                                    {pendingRequests.map(req => (
                                        <div key={req.id} className="flex items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-gray-100 animate-slide-up">
                                            <div>
                                                <p className="text-xs font-black text-indigo-500 uppercase">{req.Grupo?.nombre}</p>
                                                <p className="text-sm font-medium text-gray-700">{req.Usuario?.email} quiere unirse</p>
                                            </div>
                                            <div className="flex gap-2">
                                                <button onClick={() => handleRejectRequest(req.id, req.id_grupo)} className="px-3 py-1 text-xs font-bold text-red-500 hover:bg-red-50 rounded-lg">Rechazar</button>
                                                <button onClick={() => handleAcceptRequest(req)} className="px-3 py-1 text-xs font-bold text-green-600 bg-indigo-50 rounded-lg">Aceptar</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

        </div>
    )
}
