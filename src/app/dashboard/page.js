'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function Dashboard() {
    const router = useRouter()
    const [user, setUser] = useState(null)
    const [loading, setLoading] = useState(true)
    const [groups, setGroups] = useState([])
    const [showCreateJoin, setShowCreateJoin] = useState(false)

    // UI States
    const [viewMode, setViewMode] = useState('main') // 'main', 'create', 'join'
    const [inputName, setInputName] = useState('')
    const [joinCode, setJoinCode] = useState('')
    const [apodo, setApodo] = useState('')

    // Requests State
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
            .select('id_grupo, rol, Grupo(*)')
            .eq('id_usuario', userId)

        if (data) {
            const groupList = data.map(m => m.Grupo).filter(g => g !== null && g !== undefined)
            setGroups(groupList)

            // Fetch requests for ALL groups
            const allGroupIds = groupList.map(g => g.id_grupo)
            if (allGroupIds.length > 0) {
                fetchRequests(allGroupIds)
            }
        }
    }

    // Subscribe to changes
    useEffect(() => {
        if (!user) return

        const channel = supabase
            .channel(`dashboard-realtime`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'SolicitudUnion' }, () => {
                // Refresh requests and groups on any request change
                fetchGroups(user.id)
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'MiembroGrupo' }, () => {
                // Refresh groups on membership change
                fetchGroups(user.id)
            })
            .subscribe()

        return () => { supabase.removeChannel(channel) }
    }, [user])

    const fetchRequests = async (groupIds) => {
        // We fetch requests for ALL groups we are in.
        // Even if we are not admin, we might want to see them (or filter them later).
        //Ideally, backend RLS should handle security.
        const { data, error } = await supabase
            .from('SolicitudUnion')
            .select(`
                *,
                Usuario (email, id_usuario),
                Grupo (nombre, codigo_invitacion, id_grupo)
            `)
            .in('id_grupo', groupIds)
            .eq('estado', 'pendiente')

        if (error) {
            console.error("Error fetching requests:", error)
        }

        // Remove duplicates manually just in case
        const unique = []
        const seen = new Set()
        if (data) {
            data.forEach(item => {
                if (!seen.has(item.id)) {
                    seen.add(item.id)
                    unique.push(item)
                }
            })
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

        // Add as admin
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

        const { data: targetGroup, error: findError } = await supabase
            .from('Grupo')
            .select('id_grupo, nombre')
            .ilike('codigo_invitacion', joinCode.trim())
            .single()

        if (findError || !targetGroup) {
            setMsg('Código no válido o grupo no encontrado.')
            return
        }

        // Clean up any existing request (Delete then Insert is cleaner for permissions)
        await supabase
            .from('SolicitudUnion')
            .delete()
            .eq('id_usuario', user.id)
            .eq('id_grupo', targetGroup.id_grupo)

        // Create new request
        const { error: requestError } = await supabase
            .from('SolicitudUnion')
            .insert({
                id_usuario: user.id,
                id_grupo: targetGroup.id_grupo,
                estado: 'pendiente'
            })

        if (requestError) {
            setMsg('Error al enviar solicitud: ' + requestError.message)
        } else {
            setMsg(`Solicitud enviada a ${targetGroup.nombre}. Espera a que el admin te acepte.`)
            setJoinCode('')
        }
    }

    const handleAcceptRequest = async (request) => {
        // 1. Update status
        const { error: updateError } = await supabase
            .from('SolicitudUnion')
            .update({ estado: 'aceptada' })
            .eq('id', request.id)

        if (updateError) {
            console.error("Error updating status:", updateError)
            return
        }

        // 2. Add to group
        const { error: insertError } = await supabase
            .from('MiembroGrupo')
            .insert({
                id_usuario: request.id_usuario,
                id_grupo: request.id_grupo,
                rol: 'miembro'
            })

        if (insertError) {
            // Error 409 or 23505 means duplicate key (already member) -> We consider it success
            if (insertError.code === '23505' || insertError.code === '409') {
                console.log("El usuario ya era miembro, continuamos.")
            } else {
                console.error("Error adding member:", insertError)
            }
        }

        // Force refresh
        await fetchGroups(user.id)
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

    const handleLeaveGroup = async (groupId, groupName) => {
        if (!window.confirm(`¿Seguro que quieres salir de "${groupName}"? Si eres el único admin, el grupo podría quedar huérfano.`)) {
            return
        }

        // 1. Delete membership
        const { error: leaveError } = await supabase
            .from('MiembroGrupo')
            .delete()
            .eq('id_grupo', groupId)
            .eq('id_usuario', user.id)

        if (leaveError) {
            alert(`Error al salir: ${leaveError.message}`)
            return
        }

        // 2. Delete existing request (so they can apply again cleanly)
        // We ignore error here because maybe the request doesn't exist (if they were added manually)
        await supabase
            .from('SolicitudUnion')
            .delete()
            .eq('id_usuario', user.id) // Corrected from eq(id_grupo, id_grupo) combined
            .eq('id_grupo', groupId)

        fetchGroups(user.id)
    }

    if (loading) return <div className="h-screen flex items-center justify-center font-black text-2xl text-indigo-600 uppercase tracking-tighter animate-pulse">Cargando...</div>

    return (
        <div className="min-h-screen bg-gray-50 relative font-sans text-gray-900 pb-32">

            {/* Header / Nav Placeholder */}
            <div className="fixed top-0 w-full bg-white/80 backdrop-blur-md z-40 border-b border-gray-100 px-6 py-4 flex justify-between items-center">
                <Link href="/profile" className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors">
                    <svg className="w-6 h-6 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                </Link>
                <h1 className="text-lg font-black uppercase tracking-widest text-indigo-900">MeetApp</h1>
            </div>

            <div className="max-w-4xl mx-auto pt-24 px-6">

                {/* --- SECCIÓN DE SOLICITUDES (NUEVA) --- */}
                {pendingRequests.length > 0 && viewMode === 'main' && (
                    <div className="mb-10 animate-slide-down">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-black uppercase tracking-tight text-gray-800 flex items-center gap-2">
                                📬 Solicitudes
                                <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full animate-pulse">{pendingRequests.length}</span>
                            </h2>
                            <button
                                onClick={() => fetchGroups(user.id)}
                                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 uppercase"
                            >
                                Actualizar
                            </button>
                        </div>

                        <div className="grid gap-4">
                            {pendingRequests.map(req => (
                                <div key={req.id} className="bg-white p-5 rounded-2xl shadow-lg border border-indigo-100 flex flex-col sm:flex-row justify-between items-center gap-4">
                                    <div className="flex items-center gap-4 w-full">
                                        <div className="h-12 w-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-xl shadow-md">
                                            {req.Usuario?.email?.[0].toUpperCase() || '?'}
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-gray-900">{req.Usuario?.email}</p>
                                            <p className="text-xs text-gray-500">quiere unirse a <span className="text-indigo-600 font-black uppercase">{req.Grupo?.nombre}</span></p>
                                        </div>
                                    </div>

                                    <div className="flex gap-2 w-full sm:w-auto">
                                        <button
                                            onClick={() => handleRejectRequest(req.id)}
                                            className="flex-1 sm:flex-none px-4 py-2 border border-red-200 text-red-500 font-bold rounded-xl text-sm hover:bg-red-50 transition-colors uppercase"
                                        >
                                            Rechazar
                                        </button>
                                        <button
                                            onClick={() => handleAcceptRequest(req)}
                                            className="flex-1 sm:flex-none px-6 py-2 bg-indigo-600 text-white font-bold rounded-xl text-sm shadow-md hover:bg-indigo-700 transition-transform hover:scale-105 uppercase"
                                        >
                                            Aceptar
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}


                {/* CONTENT HANDLING */}
                {(groups.length === 0 || viewMode === 'create' || viewMode === 'join') ? (
                    <div className="animate-fade-in">
                        {viewMode === 'main' && (
                            <div className="text-center py-20">
                                <h2 className="text-3xl font-black text-gray-300 uppercase mb-4">Nada por aquí</h2>
                                <p className="text-gray-400 mb-8">Únete a un grupo o crea uno nuevo para empezar.</p>
                                <div className="space-y-3 max-w-xs mx-auto">
                                    <button onClick={() => setViewMode('create')} className="w-full py-4 bg-indigo-600 text-white font-black rounded-2xl shadow-xl hover:scale-105 transition-transform">CREAR GRUPO</button>
                                    <button onClick={() => setViewMode('join')} className="w-full py-4 bg-white text-indigo-600 border border-indigo-100 font-black rounded-2xl shadow-sm hover:bg-indigo-50 transition-colors">UNIRSE CON CÓDIGO</button>
                                </div>
                            </div>
                        )}

                        {viewMode === 'create' && (
                            <div className="bg-white p-6 rounded-3xl shadow-2xl border-t-8 border-indigo-500 max-w-lg mx-auto">
                                <h3 className="text-xl font-black mb-6 uppercase text-gray-800">Crear nuevo grupo</h3>
                                <input
                                    className="w-full bg-gray-50 p-4 rounded-xl mb-4 font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                                    placeholder="Nombre del Grupo"
                                    autoFocus
                                    value={inputName}
                                    onChange={e => setInputName(e.target.value)}
                                />
                                <input
                                    className="w-full bg-gray-50 p-4 rounded-xl mb-6 font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                                    placeholder="Tu apodo (Opcional)"
                                    onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                                    value={apodo}
                                    onChange={e => setApodo(e.target.value)}
                                />
                                {msg && <p className="text-red-500 text-xs font-bold mb-4">{msg}</p>}
                                <div className="flex gap-4">
                                    <button onClick={() => { setViewMode('main'); setMsg('') }} className="flex-1 py-3 text-gray-400 font-bold hover:text-gray-600">CANCELAR</button>
                                    <button onClick={handleCreate} className="flex-1 py-3 bg-indigo-600 text-white font-black rounded-xl hover:bg-indigo-700 shadow-lg">CREAR</button>
                                </div>
                            </div>
                        )}

                        {viewMode === 'join' && (
                            <div className="bg-white p-6 rounded-3xl shadow-2xl border-t-8 border-indigo-500 max-w-lg mx-auto">
                                <h3 className="text-xl font-black mb-6 uppercase text-gray-800">Unirse a un grupo</h3>
                                <input
                                    className="w-full bg-gray-50 p-4 rounded-xl mb-6 text-center text-2xl font-black uppercase tracking-widest text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                                    placeholder="AABB12"
                                    maxLength={6}
                                    autoFocus
                                    onKeyDown={(e) => e.key === 'Enter' && handleJoinByCode()}
                                    value={joinCode}
                                    onChange={e => setJoinCode(e.target.value.toUpperCase())}
                                />
                                {msg && <p className={`text-xs font-bold mb-4 ${msg.includes('enviada') ? 'text-green-600' : 'text-red-500'}`}>{msg}</p>}
                                <div className="flex gap-4">
                                    <button onClick={() => { setViewMode('main'); setMsg('') }} className="flex-1 py-3 text-gray-400 font-bold hover:text-gray-600">CANCELAR</button>
                                    <button onClick={handleJoinByCode} className="flex-1 py-3 bg-indigo-600 text-white font-black rounded-xl hover:bg-indigo-700 shadow-lg">UNIRSE</button>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    /* LIST OF GROUPS */
                    <div className="animate-fade-in space-y-4">
                        <h2 className="text-2xl font-black text-indigo-900 uppercase tracking-tighter mb-6">Mis Grupos</h2>
                        {groups.map(g => (
                            <div key={g.id_grupo} className="bg-white p-6 rounded-2xl shadow-md border-2 border-indigo-50 hover:border-indigo-500 hover:shadow-xl transition-all flex justify-between items-center transform hover:-translate-y-1 group relative">
                                <Link href={`/groups?id=${g.id_grupo}`} className="absolute inset-0 z-0"></Link>

                                <h3 className="text-xl font-black text-gray-800 uppercase tracking-tight relative z-10 pointer-events-none">{g.nombre}</h3>

                                <div className="flex items-center gap-3 relative z-10">
                                    <span className="bg-indigo-50 text-indigo-600 font-bold px-3 py-1 rounded-lg text-xs tracking-widest">{g.codigo_invitacion?.toUpperCase()}</span>

                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            e.preventDefault();
                                            handleLeaveGroup(g.id_grupo, g.nombre);
                                        }}
                                        className="w-8 h-8 flex items-center justify-center bg-red-50 text-red-500 rounded-full hover:bg-red-500 hover:text-white transition-all shadow-sm"
                                        title="Salir y borrar grupo de mi lista"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* FAB */}
            {viewMode === 'main' && groups.length > 0 && (
                <div className="fixed bottom-8 right-8 flex flex-col items-end gap-4 z-50">
                    {showCreateJoin && (
                        <div className="flex flex-col gap-2 mb-2 animate-slide-up">
                            <button onClick={() => { setViewMode('join'); setShowCreateJoin(false) }} className="bg-white text-indigo-600 px-6 py-3 rounded-full font-black shadow-lg hover:bg-gray-50 uppercase text-sm border border-indigo-100">Unirse</button>
                            <button onClick={() => { setViewMode('create'); setShowCreateJoin(false) }} className="bg-indigo-600 text-white px-6 py-3 rounded-full font-black shadow-lg hover:bg-indigo-700 uppercase text-sm">Crear</button>
                        </div>
                    )}
                    <button onClick={() => setShowCreateJoin(!showCreateJoin)} className="h-16 w-16 bg-black text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all">
                        <svg className={`w-8 h-8 transition-transform duration-300 ${showCreateJoin ? 'rotate-45' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" /></svg>
                    </button>
                </div>
            )}

        </div>
    )
}
