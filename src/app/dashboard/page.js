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
            // Fetch ALL requests for groups I am admin of
            fetchRequests(userId)
        }
    }

    // Consolidated global listener for requests
    useEffect(() => {
        if (!user) return

        const channel = supabase
            .channel(`global-requests`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'SolicitudUnion'
            }, () => {
                // Refresh both groups (in case I was accepted) and requests (in case someone applied)
                fetchGroups(user.id)
            })
            .subscribe()

        return () => { supabase.removeChannel(channel) }
    }, [user])

    const fetchRequests = async (userId) => {
        // 1. Get IDs of groups where I am admin
        const { data: myAdminships } = await supabase
            .from('MiembroGrupo')
            .select('id_grupo')
            .eq('id_usuario', userId)
            .eq('rol', 'admin')

        if (!myAdminships || myAdminships.length === 0) {
            setPendingRequests([])
            return
        }

        const myGroupIds = myAdminships.map(m => m.id_grupo)

        // 2. Fetch all pending requests for those groups
        const { data } = await supabase
            .from('SolicitudUnion')
            .select('*, Usuario(email, id_usuario), Grupo(nombre, codigo_invitacion)')
            .in('id_grupo', myGroupIds)
            .eq('estado', 'pendiente')

        // Filter out duplicates manually if any join weirdness happens
        const unique = []
        const map = new Map()
        if (data) {
            for (const item of data) {
                if (!map.has(item.id)) {
                    map.set(item.id, true)
                    unique.push(item)
                }
            }
        }
        setPendingRequests(unique)
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
                id_grupo: targetGroup.id_grupo,
                estado: 'pendiente'
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

        // Add member to group
        await supabase.from('MiembroGrupo').insert({
            id_usuario: request.id_usuario,
            id_grupo: request.id_grupo,
            rol: 'miembro'
        })

        fetchGroups(user.id)
    }

    const handleRejectRequest = async (requestId) => {
        const { error } = await supabase
            .from('SolicitudUnion')
            .update({ estado: 'rechazada' })
            .eq('id', requestId)

        if (error) {
            alert(`Error al rechazar: ${error.message}`)
            return
        }
        fetchGroups(user.id)
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

                {/* --- SECCIÓN DE SOLICITUDES (NUEVA Y PROMINENTE) --- */}
                {pendingRequests.length > 0 && viewMode === 'main' && (
                    <div className="mb-12 animate-fade-in-down">
                        <div className="flex items-center gap-3 mb-6">
                            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-white font-black text-sm animate-pulse">
                                {pendingRequests.length}
                            </span>
                            <h2 className="text-2xl font-black uppercase tracking-tighter text-indigo-900">
                                Solicitudes de Acceso
                            </h2>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {pendingRequests.map(req => (
                                <div key={req.id} className="bg-white p-6 rounded-3xl shadow-xl border-2 border-indigo-500 relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 bg-indigo-500 text-white text-[10px] font-black uppercase px-3 py-1 rounded-bl-xl">
                                        Pendiente
                                    </div>
                                    <p className="text-xs font-black uppercase text-indigo-400 mb-1">Quiere entrar a</p>
                                    <h3 className="text-xl font-black text-gray-900 mb-4">{req.Grupo?.nombre}</h3>

                                    <div className="flex items-center gap-3 mb-6 bg-gray-50 p-3 rounded-2xl">
                                        <div className="h-10 w-10 bg-indigo-200 rounded-full flex items-center justify-center text-indigo-700 font-bold">
                                            {req.Usuario?.email?.[0].toUpperCase()}
                                        </div>
                                        <div className="overflow-hidden">
                                            <p className="text-sm font-bold text-gray-800 truncate">{req.Usuario?.email}</p>
                                            <p className="text-[10px] text-gray-400 font-bold uppercase">Usuario</p>
                                        </div>
                                    </div>

                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => handleRejectRequest(req.id)}
                                            className="flex-1 py-3 border-2 border-red-100 text-red-500 font-black uppercase rounded-xl hover:bg-red-50 hover:border-red-200 transition-all text-sm"
                                        >
                                            Rechazar
                                        </button>
                                        <button
                                            onClick={() => handleAcceptRequest(req)}
                                            className="flex-1 py-3 bg-indigo-600 text-white font-black uppercase rounded-xl shadow-lg hover:bg-indigo-700 hover:shadow-indigo-500/30 transition-all text-sm"
                                        >
                                            Aceptar
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="h-px bg-gray-200 w-full mt-12"></div>
                    </div>
                )}

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
