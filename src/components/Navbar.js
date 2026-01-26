'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { useEffect, useState } from 'react'

export default function Navbar() {
    const router = useRouter()
    const [user, setUser] = useState(null)

    useEffect(() => {
        const getUser = async () => {
            const { data: { session } } = await supabase.auth.getSession()
            if (session) setUser(session.user)
        }
        getUser()
    }, [])

    const handleLogout = async () => {
        await supabase.auth.signOut()
        router.push('/')
    }

    if (!user) return null

    return (
        <nav className="bg-white shadow sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between h-16">
                    <div className="flex items-center">
                        <Link href="/dashboard" className="flex-shrink-0 flex items-center">
                            <span className="font-bold text-xl text-indigo-600">MeetApp</span>
                        </Link>
                        <div className="ml-10 flex items-baseline space-x-4">
                            <Link href="/groups" className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium">
                                Mi Grupo
                            </Link>
                        </div>
                    </div>
                    <div className="flex items-center space-x-4">
                        <Link href="/profile" className="flex items-center gap-2 text-gray-700 hover:text-indigo-600 px-3 py-2 rounded-md text-sm font-medium transition-colors">
                            <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                            </div>
                            <span className="hidden sm:block">Perfil</span>
                        </Link>
                        <button
                            onClick={handleLogout}
                            className="text-gray-400 hover:text-red-500"
                            title="Cerrar Sesión"
                        >
                            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        </nav>
    )
}
