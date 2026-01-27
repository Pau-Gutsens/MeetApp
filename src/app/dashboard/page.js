'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function Dashboard() {
    const router = useRouter()
    const [user, setUser] = useState(null)
    const [loading, setLoading] = useState(true)
    const [group, setGroup] = useState(null)
    const [showCreateJoin, setShowCreateJoin] = useState(false) // For toggling modal/view

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

            // Check Group
            const { data } = await supabase
                .from('Usuario')
                .select('id_grupo, Grupo(*)')
                .eq('id_usuario', session.user.id)
                .single()

            if (data?.Grupo) {
                setGroup(data.Grupo)
                fetchRequests(data.Grupo.id_grupo)
            }
            setLoading(false)
        }
        init()
    }, [router])

    useEffect(() => {
        if (!group) return

        const channel = supabase
            .channel(`requests-${group.id_grupo}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'SolicitudUnion',
                filter: `id_grupo=eq.${group.id_grupo}`
            }, () => {
                fetchRequests(group.id_grupo)
            })
            .subscribe()

        return () => { supabase.removeChannel(channel) }
    }, [group])

    const fetchRequests = async (groupId) => {
        const { data } = await supabase
            .from('SolicitudUnion')
            .select('*, Usuario(email, id_usuario)')
            .eq('id_grupo', groupId)
            .eq('estado', 'pendiente')
        setPendingRequests(data || [])
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

        await supabase.from('Usuario').update({ id_grupo: data.id_grupo }).eq('id_usuario', user.id)
        setGroup(data)
        setViewMode('main')
    }

    const handleJoinByCode = async () => {
        setMsg('')
        if (!joinCode.trim()) return

        // 1. Find group by code
        const { data: targetGroup, error: findError } = await supabase
            .from('Grupo')
            .select('id_grupo, nombre')
            .eq('codigo_invitacion', joinCode.trim().toUpperCase())
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
        // 1. Update user's group
        const { error: userUpdateError } = await supabase
            .from('Usuario')
            .update({ id_grupo: request.id_grupo })
            .eq('id_usuario', request.id_usuario)

        if (userUpdateError) { alert(userUpdateError.message); return }

        // 2. Mark request as accepted
        await supabase
            .from('SolicitudUnion')
            .update({ estado: 'aceptada' })
            .eq('id', request.id)

        fetchRequests(group.id_grupo)
    }

    const handleRejectRequest = async (requestId) => {
        await supabase
            .from('SolicitudUnion')
            .update({ estado: 'rechazada' })
            .eq('id', requestId)

        fetchRequests(group.id_grupo)
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

                {/* CASE: NO GROUP -> CENTERED OPTIONS */}
                {!group ? (
                    <div className="w-full max-w-md space-y-6 text-center animate-fade-in">
                        <h1 className="text-3xl font-bold text-gray-800 mb-8">Bienvenido</h1>

                        {viewMode === 'main' && (
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
                                <h3 className="text-lg font-bold mb-4">Nuevo Grupo</h3>
                                <input
                                    className="w-full border p-3 rounded mb-4"
                                    placeholder="Nombre..."
                                    value={inputName}
                                    onChange={e => setInputName(e.target.value)}
                                />
                                {msg && <p className="text-red-500 text-sm mb-2">{msg}</p>}
                                <div className="flex gap-2">
                                    <button onClick={() => setViewMode('main')} className="flex-1 py-2 text-gray-500">Cancelar</button>
                                    <button onClick={handleCreate} className="flex-1 py-2 bg-indigo-600 text-white rounded">Crear</button>
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
                    </div>
                ) : (
                    /* CASE: HAS GROUP -> GROUP CARD CENTERED */
                    <div className="flex flex-col items-center gap-6 w-full max-w-lg">
                        {/* Invitation Code Card */}
                        <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100 w-full">
                            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1 text-center">Código de Invitación</p>
                            <p className="text-2xl font-black text-indigo-700 text-center tracking-[0.5em]">{group.codigo_invitacion || '------'}</p>
                        </div>

                        <Link href="/groups" className="block w-full bg-white p-10 rounded-3xl shadow-2xl hover:shadow-xl hover:scale-[1.02] transition-all cursor-pointer border-t-8 border-indigo-500 group relative">
                            <h1 className="text-4xl font-extrabold text-gray-900 mb-2">{group.nombre}</h1>
                            <p className="text-indigo-600 font-medium transition-opacity">
                                Entrar al Grupo &rarr;
                            </p>
                        </Link>

                        {/* Admin Notifications / Notices */}
                        <div className="w-full mt-4">
                            <button
                                onClick={() => {
                                    setViewMode(viewMode === 'requests' ? 'main' : 'requests');
                                    if (viewMode !== 'requests') fetchRequests(group.id_grupo);
                                }}
                                className="flex items-center gap-2 text-sm font-bold text-gray-400 hover:text-indigo-600 transition-colors"
                            >
                                🔔 Avisos y Solicitudes
                            </button>

                            {viewMode === 'requests' && (
                                <div className="mt-4 bg-white rounded-2xl shadow-lg p-4 border border-gray-100 animate-slide-up">
                                    <h3 className="text-sm font-black text-gray-800 mb-3">Solicitudes Pendientes</h3>
                                    <div className="space-y-3">
                                        {pendingRequests.map(req => (
                                            <div key={req.id} className="flex items-center justify-between bg-gray-50 p-3 rounded-xl">
                                                <span className="text-sm font-medium text-gray-700">{req.Usuario?.email}</span>
                                                <div className="flex gap-2">
                                                    <button onClick={() => handleRejectRequest(req.id)} className="px-3 py-1 text-xs font-bold text-red-500 hover:bg-red-50 rounded-lg">Rechazar</button>
                                                    <button onClick={() => handleAcceptRequest(req)} className="px-3 py-1 text-xs font-bold text-green-600 bg-white shadow-sm border border-green-100 rounded-lg">Aceptar</button>
                                                </div>
                                            </div>
                                        ))}
                                        {pendingRequests.length === 0 && <p className="text-xs text-gray-400 italic text-center py-4">No hay avisos nuevos.</p>}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* BUTTON BOTTOM RIGHT: ONLY IF HAS GROUP */}
            {group && (
                <div className="fixed bottom-8 right-8 z-50">
                    <button
                        onClick={() => { setGroup(null); setViewMode('main'); }} // Simple hack: clear local group state to show centering options. Reload prefers.
                        className="bg-gray-900 text-white p-4 rounded-full shadow-2xl hover:bg-gray-800 transition-transform hover:rotate-90"
                        title="Cambiar o Crear Grupo"
                    >
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                    </button>
                </div>
            )}
        </div>
    )
}
