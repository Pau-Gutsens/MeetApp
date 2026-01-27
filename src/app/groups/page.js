'use client'
import { useEffect, useState, Suspense } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import GroupCalendar from '@/components/GroupCalendar'

function GroupDetailsContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const groupId = searchParams.get('id')
    const [user, setUser] = useState(null)
    const [group, setGroup] = useState(null)
    const [quedadas, setQuedadas] = useState([])
    const [loading, setLoading] = useState(true)

    // UI States
    const [view, setView] = useState('list') // 'list', 'create', 'details'
    const [activeTab, setActiveTab] = useState('planes') // 'planes', 'calendario'
    const [selectedQuedada, setSelectedQuedada] = useState(null)
    const [participants, setParticipants] = useState([])
    const [isParticipant, setIsParticipant] = useState(false)

    // Create Form
    const [formData, setFormData] = useState({
        nombre: '',
        descripcion: '',
        fecha_inicio: '',
        fecha_fin: '',
        aforo_min: 1,
        aforo_max: 10
    })
    const [msg, setMsg] = useState('')

    useEffect(() => {
        loadData()
    }, [router])

    const loadData = async () => {
        if (!groupId) {
            router.push('/dashboard')
            return
        }

        const { data: { session } } = await supabase.auth.getSession()
        if (!session) { router.push('/auth'); return }
        setUser(session.user)

        // Verify Membership
        const { data: membership, error } = await supabase
            .from('MiembroGrupo')
            .select('id_grupo, Grupo(*)')
            .eq('id_usuario', session.user.id)
            .eq('id_grupo', groupId)
            .single()

        if (error || !membership?.Grupo) {
            console.error("No eres miembro de este grupo o no existe")
            router.push('/dashboard')
            return
        }

        setGroup(membership.Grupo)
        fetchQuedadas(groupId)
        setLoading(false)
    }

    const fetchQuedadas = async (groupId) => {
        const { data } = await supabase
            .from('Quedada')
            .select('*')
            .eq('id_grupo', groupId)
            .order('fecha_inicio', { ascending: true })
        setQuedadas(data || [])
    }

    useEffect(() => {
        if (!group) return

        const channel = supabase
            .channel(`group-activity-${group.id_grupo}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'Quedada',
                filter: `id_grupo=eq.${group.id_grupo}`
            }, () => {
                fetchQuedadas(group.id_grupo)
            })
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'ParticipacionQuedada'
            }, (payload) => {
                // If the change is for the currently selected quedada, refresh details
                if (selectedQuedada && (payload.new?.id_quedada === selectedQuedada.id_quedada || payload.old?.id_quedada === selectedQuedada.id_quedada)) {
                    fetchQuedadaDetails(selectedQuedada.id_quedada)
                }
            })
            .subscribe()

        return () => { supabase.removeChannel(channel) }
    }, [group, selectedQuedada])

    const fetchQuedadaDetails = async (quedadaId) => {
        // Get Participants
        const { data: parts } = await supabase
            .from('ParticipacionQuedada')
            .select('*, Usuario(email)')
            .eq('id_quedada', quedadaId)

        setParticipants(parts || [])
        const amIIn = parts?.find(p => p.id_usuario === user.id)
        setIsParticipant(!!amIIn)
    }

    const handleCreateWrapper = async () => {
        setMsg('')
        if (!formData.nombre || !formData.fecha_inicio) {
            setMsg('Faltan campos obligatorios.')
            return
        }

        try {
            const { error } = await supabase.from('Quedada').insert({
                id_grupo: group.id_grupo,
                ...formData,
                estado: 'Propuesta'
            })
            if (error) throw error

            await fetchQuedadas(group.id_grupo)
            setView('list')
            setFormData({ nombre: '', descripcion: '', fecha_inicio: '', fecha_fin: '', aforo_min: 1, aforo_max: 10 })
        } catch (e) { setMsg(e.message) }
    }

    const handleJoin = async () => {
        try {
            if (isParticipant) {
                // Leave
                await supabase
                    .from('ParticipacionQuedada')
                    .delete()
                    .eq('id_quedada', selectedQuedada.id_quedada)
                    .eq('id_usuario', user.id)
            } else {
                // Join
                await supabase
                    .from('ParticipacionQuedada')
                    .insert({
                        id_quedada: selectedQuedada.id_quedada,
                        id_usuario: user.id,
                        rol: 'Invitado'
                    })
            }
            await fetchQuedadaDetails(selectedQuedada.id_quedada)
        } catch (e) { alert(e.message) }
    }

    const selectQuedada = async (q) => {
        setSelectedQuedada(q)
        setView('details')
        await fetchQuedadaDetails(q.id_quedada)
    }

    if (loading) return <div className="p-8">Cargando...</div>
    if (!group) return <div className="p-8">Error: No tienes grupo.</div>

    return (
        <div className="min-h-screen bg-gray-50 relative p-6 font-sans">
            {/* PROFILE BUTTON: Top Left */}
            <Link
                href="/profile"
                className="absolute top-6 left-6 z-50 bg-white p-3 rounded-full shadow-lg hover:bg-gray-100 transition-transform"
                title="Ver Perfil"
            >
                <div className="h-8 w-8 text-black">
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                </div>
            </Link>

            <div className="max-w-4xl mx-auto pt-16">

                {/* Header & Tabs */}
                <div className="mb-8">
                    <div className="flex justify-between items-start mb-6">
                        <h1 className="text-4xl font-bold text-gray-900">{group.nombre}</h1>
                        <div className="bg-indigo-50 px-4 py-2 rounded-xl border border-indigo-100">
                            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest text-center">Código</p>
                            <p className="text-lg font-black text-indigo-700 tracking-widest">{group.codigo_invitacion?.toUpperCase()}</p>
                        </div>
                    </div>

                    <div className="flex space-x-1 bg-gray-200 p-1 rounded-xl w-fit">
                        <button
                            onClick={() => { setActiveTab('planes'); setView('list'); }}
                            className={`px-6 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'planes' ? 'bg-white text-black shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            🚀 Planes
                        </button>
                        <button
                            onClick={() => setActiveTab('calendario')}
                            className={`px-6 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'calendario' ? 'bg-white text-black shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            📅 Calendario
                        </button>
                    </div>
                </div>

                {/* --- CALENDAR TAB --- */}
                {activeTab === 'calendario' && (
                    <GroupCalendar groupId={group.id_grupo} userId={user.id} />
                )}

                {/* --- PLANES TAB CONTENT --- */}
                {activeTab === 'planes' && (
                    <>
                        {/* Back Link */}
                        {view !== 'list' && (
                            <button onClick={() => setView('list')} className="mb-4 text-gray-500 hover:text-black font-medium">
                                &larr; Volver a la lista
                            </button>
                        )}
                        {view === 'list' && (
                            <Link href="/dashboard" className="block mb-4 text-gray-500 hover:text-black font-medium text-right">
                                Volver al Panel &rarr;
                            </Link>
                        )}

                        {/* --- LIST VIEW --- */}
                        {view === 'list' && (
                            <>
                                <div className="flex justify-between items-end mb-8">
                                    <div>
                                        <p className="text-gray-500 font-medium">Próximas quedadas</p>
                                    </div>
                                    <button
                                        onClick={() => setView('create')}
                                        className="bg-black text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:bg-gray-800 transition-all"
                                    >
                                        + Crear Quedada
                                    </button>
                                </div>

                                <div className="grid gap-4">
                                    {quedadas.length === 0 ? (
                                        <div className="bg-white p-12 rounded-2xl text-center shadow-sm border border-gray-200">
                                            <p className="text-gray-400 text-lg">No hay planes a la vista... 😴</p>
                                        </div>
                                    ) : (
                                        quedadas.map(q => (
                                            <div key={q.id_quedada} onClick={() => selectQuedada(q)} className="bg-white p-6 rounded-2xl shadow-sm hover:shadow-xl transition-all border border-gray-100 cursor-pointer flex justify-between items-center group">
                                                <div>
                                                    <div className="flex items-center gap-3 mb-1">
                                                        <h3 className="text-xl font-bold text-gray-800 group-hover:text-indigo-600 transition-colors">{q.nombre}</h3>
                                                        <span className={`px-2 py-0.5 rounded text-xs font-bold border ${q.estado === 'Propuesta' ? 'bg-yellow-50 border-yellow-200 text-yellow-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
                                                            {q.estado}
                                                        </span>
                                                    </div>
                                                    <p className="text-gray-500 text-sm">📅 {new Date(q.fecha_inicio).toLocaleString()}</p>
                                                </div>
                                                <div className="text-gray-400 group-hover:translate-x-1 transition-transform">
                                                    ➔
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </>
                        )}

                        {/* --- CREATE VIEW --- */}
                        {view === 'create' && (
                            <div className="bg-white p-8 rounded-3xl shadow-xl max-w-2xl mx-auto">
                                <h2 className="text-2xl font-bold mb-6 text-gray-900">Nueva Quedada</h2>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">Nombre</label>
                                        <input className="w-full p-3 bg-gray-50 rounded-xl border-transparent focus:bg-white focus:ring-2 focus:ring-black text-gray-900" value={formData.nombre} onChange={e => setFormData({ ...formData, nombre: e.target.value })} placeholder="Cena de Navidad, Bolera..." />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">Descripción</label>
                                        <textarea className="w-full p-3 bg-gray-50 rounded-xl border-transparent focus:bg-white focus:ring-2 focus:ring-black text-gray-900" value={formData.descripcion} onChange={e => setFormData({ ...formData, descripcion: e.target.value })} placeholder="Detalles del plan..." />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-1">Inicio</label>
                                            <input type="datetime-local" className="w-full p-3 bg-gray-50 rounded-xl" value={formData.fecha_inicio} onChange={e => setFormData({ ...formData, fecha_inicio: e.target.value })} />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-1">Fin</label>
                                            <input type="datetime-local" className="w-full p-3 bg-gray-50 rounded-xl" value={formData.fecha_fin} onChange={e => setFormData({ ...formData, fecha_fin: e.target.value })} />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-1">Aforo Mín</label>
                                            <input type="number" className="w-full p-3 bg-gray-50 rounded-xl" value={formData.aforo_min} onChange={e => setFormData({ ...formData, aforo_min: e.target.value })} />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-1">Aforo Máx</label>
                                            <input type="number" className="w-full p-3 bg-gray-50 rounded-xl" value={formData.aforo_max} onChange={e => setFormData({ ...formData, aforo_max: e.target.value })} />
                                        </div>
                                    </div>

                                    {msg && <p className="text-red-500 font-bold text-center">{msg}</p>}

                                    <button onClick={handleCreateWrapper} className="w-full py-4 bg-black text-white rounded-xl font-bold shadow-lg hover:scale-[1.02] transition-transform">
                                        Publicar Quedada
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* --- DETAILS VIEW --- */}
                        {view === 'details' && selectedQuedada && (
                            <div className="bg-white p-8 rounded-3xl shadow-xl">
                                <div className="flex justify-between items-start mb-6">
                                    <div>
                                        <h1 className="text-3xl font-extrabold text-gray-900 mb-2">{selectedQuedada.nombre}</h1>
                                        <span className={`px-3 py-1 rounded-full text-sm font-bold ${selectedQuedada.estado === 'Propuesta' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                                            {selectedQuedada.estado}
                                        </span>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-3xl font-bold text-indigo-600">{participants.length} / {selectedQuedada.aforo_max}</div>
                                        <div className="text-sm text-gray-500">Asistentes</div>
                                    </div>
                                </div>

                                <div className="prose max-w-none text-gray-600 mb-8 bg-gray-50 p-6 rounded-2xl">
                                    {selectedQuedada.descripcion || "Sin descripción."}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                                    <div>
                                        <h3 className="font-bold text-gray-900 mb-3">📅 Cuándo</h3>
                                        <p className="text-gray-700">Del: {new Date(selectedQuedada.fecha_inicio).toLocaleString()}</p>
                                        {selectedQuedada.fecha_fin && <p className="text-gray-700">Al: {new Date(selectedQuedada.fecha_fin).toLocaleString()}</p>}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-gray-900 mb-3">🙋 Quiénes van</h3>
                                        <div className="space-y-2">
                                            {participants.map((p, i) => (
                                                <div key={i} className="flex items-center justify-between bg-gray-50 p-2 rounded-xl">
                                                    <div className="flex items-center gap-3">
                                                        <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-800">
                                                            {p.Usuario?.email?.[0]?.toUpperCase() || '?'}
                                                        </div>
                                                        <span className="text-sm font-medium text-gray-700">{p.Usuario?.email || 'Usuario desconocido'}</span>
                                                    </div>
                                                    <span className="text-[10px] px-2 py-1 bg-white border border-gray-200 rounded-full font-bold text-gray-500 uppercase tracking-wider">
                                                        {p.rol || 'Asistente'}
                                                    </span>
                                                </div>
                                            ))}
                                            {participants.length === 0 && <span className="text-gray-400 italic">Nadie todavía...</span>}
                                        </div>
                                    </div>
                                </div>

                                {isParticipant && (
                                    <div className="mb-6 p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
                                        <label className="block text-xs font-black text-indigo-400 uppercase mb-2">Mi Rol en este plan</label>
                                        <select
                                            className="w-full p-3 bg-white rounded-xl border-none shadow-sm text-sm font-bold text-gray-700 focus:ring-2 focus:ring-indigo-500"
                                            value={participants.find(p => p.id_usuario === user.id)?.rol || 'Asistente'}
                                            onChange={async (e) => {
                                                const newRol = e.target.value;
                                                const { error } = await supabase
                                                    .from('ParticipacionQuedada')
                                                    .update({ rol: newRol })
                                                    .eq('id_quedada', selectedQuedada.id_quedada)
                                                    .eq('id_usuario', user.id);
                                                if (!error) fetchQuedadaDetails(selectedQuedada.id_quedada);
                                            }}
                                        >
                                            <option value="Organizador">Organizador</option>
                                            <option value="Fotógrafo">Fotógrafo</option>
                                            <option value="Pagafantas">Pagafantas</option>
                                            <option value="Invitado">Invitado</option>
                                            <option value="Asistente">Asistente</option>
                                        </select>
                                    </div>
                                )}

                                <button
                                    onClick={handleJoin}
                                    className={`w-full py-4 rounded-xl font-bold text-lg shadow-lg transition-all transform hover:scale-[1.02] ${isParticipant ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
                                >
                                    {isParticipant ? '❌ Me bajo del plan' : '✅ ¡Me apunto!'}
                                </button>
                            </div>
                        )}
                    </>
                )}

            </div>
        </div>
    )
}

export default function GroupDetailsPage() {
    return (
        <Suspense fallback={<div className="p-8">Cargando...</div>}>
            <GroupDetailsContent />
        </Suspense>
    )
}
