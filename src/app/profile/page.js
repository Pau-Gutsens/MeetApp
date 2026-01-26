'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function ProfilePage() {
    const router = useRouter()
    const [user, setUser] = useState(null)
    const [loading, setLoading] = useState(true)
    // ... form states ...
    const [bio, setBio] = useState('')
    const [fechaNac, setFechaNac] = useState('')
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState('')

    useEffect(() => {
        const load = async () => {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) { router.push('/auth'); return }
            setUser(session.user)

            const { data } = await supabase.from('Usuario').select('*').eq('id_usuario', session.user.id).single()
            if (data) {
                setBio(data.bio || '')
                setFechaNac(data.fecha_nac || '')
            }
            setLoading(false)
        }
        load()
    }, [router])

    const handleSave = async (e) => {
        e.preventDefault()
        setSaving(true)
        try {
            await supabase.from('Usuario').upsert({
                id_usuario: user.id,
                email: user.email,
                bio,
                fecha_nac: fechaNac || null
            })
            setMessage('Guardado!')
        } catch (e) { setMessage(e.message) }
        setSaving(false)
    }

    if (loading) return <div className="p-8">Cargando...</div>

    return (
        <div className="min-h-screen bg-gray-50 relative">
            {/* BACK BUTTON (Top Left - acting as "Out of groups" nav) */}
            <Link
                href="/dashboard"
                className="absolute top-6 left-6 z-50 bg-white px-4 py-2 rounded-full shadow text-gray-600 font-bold hover:bg-gray-100"
            >
                &larr; Volver
            </Link>

            <div className="h-48 bg-gray-900 rounded-b-[3rem] shadow-lg mb-12 relative overflow-hidden">
                <div className="absolute inset-0 opacity-30 bg-gradient-to-r from-purple-500 to-indigo-500"></div>
            </div>

            <div className="max-w-xl mx-auto px-4 -mt-24 relative z-10">
                <div className="bg-white rounded-3xl shadow-xl p-8 text-center">
                    <div className="mx-auto h-24 w-24 bg-gray-100 rounded-full border-4 border-white shadow-lg flex items-center justify-center text-4xl mb-4">
                        👤
                    </div>
                    <h1 className="text-2xl font-bold text-gray-800">{user.email}</h1>

                    <form onSubmit={handleSave} className="mt-8 text-left space-y-4">
                        <div>
                            <label className="text-sm font-bold text-gray-500 ml-1">Fecha Nacimiento</label>
                            <input
                                type="date"
                                className="w-full mt-1 p-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500"
                                value={fechaNac}
                                onChange={e => setFechaNac(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="text-sm font-bold text-gray-500 ml-1">Bio</label>
                            <textarea
                                rows={3}
                                className="w-full mt-1 p-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 resize-none"
                                value={bio}
                                onChange={e => setBio(e.target.value)}
                                placeholder="Escribe tu bio..."
                            />
                        </div>
                        {message && <p className="text-center text-green-600 text-sm font-bold">{message}</p>}

                        <button
                            disabled={saving}
                            className="w-full py-4 bg-gray-900 text-white font-bold rounded-xl shadow-lg hover:bg-black transition-all"
                        >
                            {saving ? 'Guardando...' : 'Guardar Perfil'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    )
}
