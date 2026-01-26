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
    const [viewMode, setViewMode] = useState('main') // 'main', 'create', 'join'
    const [inputName, setInputName] = useState('')
    const [joinList, setJoinList] = useState([])
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
            }
            setLoading(false)
        }
        init()
    }, [router])

    const handleCreate = async () => {
        if (!inputName.trim()) return
        const { data, error } = await supabase.from('Grupo').insert({ nombre: inputName }).select().single()
        if (error) { setMsg(error.message); return }

        await supabase.from('Usuario').update({ id_grupo: data.id_grupo }).eq('id_usuario', user.id)
        setGroup(data)
        setViewMode('main')
    }

    const loadJoinList = async () => {
        const { data } = await supabase.from('Grupo').select('*').limit(20)
        setJoinList(data || [])
        setViewMode('join')
    }

    const handleJoin = async (id) => {
        const { error } = await supabase.from('Usuario').update({ id_grupo: id }).eq('id_usuario', user.id)
        if (error) { setMsg(error.message); return }
        window.location.reload() // Simple reload to refresh state
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
                                    onClick={loadJoinList}
                                    className="w-full py-4 bg-white text-indigo-600 border-2 border-indigo-100 rounded-xl font-bold shadow-lg hover:bg-indigo-50 transition-all"
                                >
                                    Unirse a Grupo
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
                            <div className="bg-white p-6 rounded-xl shadow-xl text-left">
                                <h3 className="text-lg font-bold mb-4">Elige un Grupo</h3>
                                <div className="max-h-60 overflow-y-auto space-y-2 mb-4">
                                    {joinList.map(g => (
                                        <div key={g.id_grupo} onClick={() => handleJoin(g.id_grupo)} className="p-3 border rounded hover:bg-indigo-50 cursor-pointer">
                                            {g.nombre}
                                        </div>
                                    ))}
                                </div>
                                <button onClick={() => setViewMode('main')} className="w-full py-2 text-gray-500">Cancelar</button>
                            </div>
                        )}
                    </div>
                ) : (
                    /* CASE: HAS GROUP -> GROUP CARD CENTERED */
                    <div className="text-center w-full max-w-lg">
                        <h2 className="text-gray-500 mb-4">Tu Grupo Actual</h2>

                        <Link href="/groups" className="block bg-white p-10 rounded-3xl shadow-2xl hover:shadow-xl hover:scale-105 transition-all cursor-pointer border-t-8 border-indigo-500 group">
                            <h1 className="text-4xl font-extrabold text-gray-900 mb-2">{group.nombre}</h1>
                            <p className="text-indigo-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                                Toca para ver las Quedadas &rarr;
                            </p>
                        </Link>
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
