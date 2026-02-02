'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function ProfilePage() {
    const router = useRouter()
    const [user, setUser] = useState(null)
    const [loading, setLoading] = useState(true)
    const [stats, setStats] = useState([])
    const [globalMemories, setGlobalMemories] = useState(0)

    // User data
    const [nombre, setNombre] = useState('')
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState('')

    useEffect(() => {
        const load = async () => {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) { router.push('/auth'); return }
            setUser(session.user)

            // 1. Load User Basic Info
            const { data: userData } = await supabase.from('Usuario').select('nombre').eq('id_usuario', session.user.id).single()
            if (userData) {
                setNombre(userData.nombre || '')
            }

            // 2. Load Stats
            await fetchStats(session.user.id)

            setLoading(false)
        }
        load()
    }, [router])

    const fetchStats = async (userId) => {
        // A. Groups I am in
        const { data: members } = await supabase
            .from('MiembroGrupo')
            .select('id_grupo, Grupo(id_grupo, nombre)')
            .eq('id_usuario', userId)

        if (!members || members.length === 0) {
            setStats([])
            return
        }

        const groups = members.map(m => m.Grupo).filter(g => g)
        const groupIds = groups.map(g => g.id_grupo)

        // B. Quedadas (Total per group - only Realized or Closed count for stats?) 
        // Let's assume 'Realizada' and 'Cerrada' count as "Hechas". 'Propuesta' is future?
        // User asked: "total hechas". So I use Realizada/Cerrada.
        const { data: allQuedadas } = await supabase
            .from('Quedada')
            .select('id_quedada, id_grupo, estado')
            .in('id_grupo', groupIds)
            .in('estado', ['Realizada', 'Cerrada'])

        // C. My Participations in those Quedadas
        const { data: myParts } = await supabase
            .from('ParticipacionQuedada')
            .select('id_quedada')
            .eq('id_usuario', userId)

        const myQuedadaIds = new Set((myParts || []).map(p => p.id_quedada))

        // D. Memories
        // 1. Get Calendars for these groups
        const { data: calendars } = await supabase
            .from('CalendarioRecuerdos')
            .select('id_calendario, id_grupo')
            .in('id_grupo', groupIds)

        // 2. Get Memories in those calendars
        let allMemories = []
        if (calendars && calendars.length > 0) {
            const calendarIds = calendars.map(c => c.id_calendario)
            const { data: mems } = await supabase
                .from('Recuerdo')
                .select('id_calendario')
                .in('id_calendario', calendarIds)
            allMemories = mems || []
        }

        // E. Aggregate
        const calculatedStats = groups.map(g => {
            const groupQuedadas = (allQuedadas || []).filter(q => q.id_grupo === g.id_grupo)
            const total = groupQuedadas.length
            const attended = groupQuedadas.filter(q => myQuedadaIds.has(q.id_quedada)).length

            const groupCalendar = (calendars || []).find(c => c.id_grupo === g.id_grupo)
            const memoryCount = allMemories.filter(m => m.id_calendario === groupCalendar?.id_calendario).length

            return {
                id: g.id_grupo,
                name: g.nombre,
                total,
                attended,
                percent: total > 0 ? Math.round((attended / total) * 100) : 0,
                memories: memoryCount
            }
        })

        setStats(calculatedStats)
        setGlobalMemories(allMemories.length)
    }

    const handleSave = async (e) => {
        e.preventDefault()
        setSaving(true)
        try {
            await supabase.from('Usuario').upsert({
                id_usuario: user.id,
                email: user.email,
                nombre,
                // Removed bio and fecha_nac
            })
            setMessage('Guardado!')
            setTimeout(() => setMessage(''), 2000)
        } catch (e) { setMessage(e.message) }
        setSaving(false)
    }

    if (loading) return <div className="h-screen flex items-center justify-center font-black text-xl animate-pulse">Cargando perfil...</div>

    return (
        <div className="min-h-screen bg-white pb-20 relative font-sans">
            {/* Nav */}
            <div className="flex justify-between items-center p-6 border-b border-gray-100 sticky top-0 bg-white/90 backdrop-blur z-40">
                <Link href="/dashboard" className="text-gray-500 hover:text-gray-900 font-bold">
                    &larr; Volver
                </Link>
                <h1 className="text-xl font-black uppercase tracking-widest text-indigo-900">MI PERFIL</h1>
                <div className="w-8"></div> {/* Spacer */}
            </div>

            <div className="max-w-md mx-auto px-6 py-8">
                {/* Avatar & Name */}
                <div className="flex flex-col items-center mb-10">
                    <div className="h-28 w-28 bg-gradient-to-tr from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-4xl text-white font-black shadow-xl mb-6">
                        {user?.email?.[0].toUpperCase()}
                    </div>

                    <form onSubmit={handleSave} className="w-full text-center">
                        <input
                            type="text"
                            value={nombre}
                            onChange={e => setNombre(e.target.value)}
                            placeholder="Tu Nombre"
                            className="text-center text-2xl font-black text-gray-900 bg-transparent border-b-2 border-transparent focus:border-indigo-500 focus:outline-none w-full mb-2 placeholder-gray-300"
                        />
                        <p className="text-gray-400 text-sm font-medium">{user?.email}</p>

                        {/* Save Button (Only shows if typing? Or always? Let's keep it simple) */}
                        <button
                            disabled={saving}
                            className="mt-4 px-6 py-2 bg-gray-900 text-white rounded-full text-xs font-bold uppercase tracking-wider shadow-lg hover:scale-105 transition-transform"
                        >
                            {saving ? '...' : 'Guardar Nombre'}
                        </button>
                        {message && <p className="text-green-500 text-xs font-bold mt-2">{message}</p>}
                    </form>
                </div>

                {/* Global Stats Row */}
                <div className="grid grid-cols-2 gap-4 mb-10">
                    <div className="bg-indigo-50 p-5 rounded-3xl border border-indigo-100 flex flex-col items-center">
                        <span className="text-3xl font-black text-indigo-600">{globalMemories}</span>
                        <span className="text-xs font-bold text-indigo-400 uppercase tracking-wide mt-1">Recuerdos</span>
                    </div>
                    <div className="bg-purple-50 p-5 rounded-3xl border border-purple-100 flex flex-col items-center">
                        <span className="text-3xl font-black text-purple-600">{stats.reduce((acc, curr) => acc + curr.attended, 0)}</span>
                        <span className="text-xs font-bold text-purple-400 uppercase tracking-wide mt-1">Quedadas</span>
                    </div>
                </div>

                <div className="border-t border-gray-100 my-8"></div>

                {/* Group Stats */}
                <h2 className="text-lg font-black uppercase tracking-tight text-gray-800 mb-6">Estadísticas por Grupo</h2>

                {stats.length === 0 ? (
                    <p className="text-center text-gray-400 italic">No perteneces a ningún grupo aún.</p>
                ) : (
                    <div className="space-y-4">
                        {stats.map(g => (
                            <div key={g.id} className="bg-white rounded-2xl shadow-lg border border-gray-100 p-5 relative overflow-hidden">
                                {/* Decorator */}
                                <div className="absolute top-0 right-0 w-20 h-20 bg-gray-50 rounded-bl-[4rem] -mr-4 -mt-4 z-0"></div>

                                <div className="relative z-10">
                                    <h3 className="text-lg font-black text-gray-800 uppercase mb-4">{g.name}</h3>

                                    <div className="flex items-end justify-between mb-2">
                                        <div className="flex flex-col">
                                            <span className="text-xs text-gray-400 font-bold uppercase">Asistencia</span>
                                            <div className="flex items-baseline gap-1">
                                                <span className="text-2xl font-black text-indigo-600">{g.attended}</span>
                                                <span className="text-sm font-bold text-gray-400">/ {g.total}</span>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-3xl font-black text-gray-200">{g.percent}%</span>
                                        </div>
                                    </div>

                                    {/* Progress Bar */}
                                    <div className="w-full bg-gray-100 rounded-full h-3 mb-4 overflow-hidden">
                                        <div
                                            className="bg-indigo-500 h-full rounded-full transition-all duration-1000 ease-out"
                                            style={{ width: `${g.percent}%` }}
                                        ></div>
                                    </div>

                                    <div className="flex items-center gap-2 text-xs font-bold text-gray-400">
                                        <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                        </svg>
                                        {g.memories} Recuerdos en este grupo
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
