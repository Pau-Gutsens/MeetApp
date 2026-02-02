'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function Navbar() {
    const router = useRouter()
    const { user, signOut } = useAuth()
    const [hasNotifications, setHasNotifications] = useState(false)
    const [isDropdownOpen, setIsDropdownOpen] = useState(false)
    const dropdownRef = useRef(null)

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsDropdownOpen(false)
            }
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [])

    const handleLogout = async () => {
        await signOut()
        router.push('/')
    }

    useEffect(() => {
        if (!user) return

        const checkNotifications = async () => {
            let notify = false

            // 1. Check Pending Join Requests (If I am Admin)
            const { data: myAdminGroups } = await supabase
                .from('MiembroGrupo')
                .select('id_grupo')
                .eq('id_usuario', user.id)
                .eq('rol', 'admin')

            if (myAdminGroups && myAdminGroups.length > 0) {
                const groupIds = myAdminGroups.map(g => g.id_grupo)
                const { count } = await supabase
                    .from('SolicitudUnion')
                    .select('*', { count: 'exact', head: true })
                    .in('id_grupo', groupIds)
                    .eq('estado', 'pendiente')

                if (count > 0) notify = true
            }

            // 2. Check Direct Invitations (by email) - Optional based on typical usage, but requested "avisos de invitaciones"
            if (!notify && user.email) {
                const { count: invCount } = await supabase
                    .from('Invitacion')
                    .select('*', { count: 'exact', head: true })
                    .eq('email_invitado', user.email)

                if (invCount > 0) notify = true
            }

            setHasNotifications(notify)
        }

        checkNotifications()

        // Realtime: We listen for changes in SolicitudUnion (we could filter, but for now global is easier to implement quickly)
        const channel = supabase
            .channel('nav_notifications')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'SolicitudUnion' }, () => {
                checkNotifications()
            })
            .subscribe()

        return () => { supabase.removeChannel(channel) }
    }, [user])

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
                        <div className="relative" ref={dropdownRef}>
                            <button
                                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                className="flex items-center gap-2 text-gray-700 hover:text-indigo-600 px-3 py-2 rounded-md text-sm font-medium transition-colors relative focus:outline-none"
                            >
                                <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 relative">
                                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                    </svg>
                                    {hasNotifications && (
                                        <span className="absolute top-0 right-0 block h-2.5 w-2.5 rounded-full ring-2 ring-white bg-red-500 animate-pulse" />
                                    )}
                                </div>
                                <span className="hidden sm:block">Perfil</span>
                            </button>
                            {isDropdownOpen && (
                                <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl py-2 z-50 animate-fade-in border border-gray-100">
                                    <Link href="/profile" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-black font-semibold" onClick={() => setIsDropdownOpen(false)}>
                                        Mi Perfil
                                    </Link>
                                    <Link href="/settings" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-black font-semibold" onClick={() => setIsDropdownOpen(false)}>
                                        Ajustes ⚙️
                                    </Link>
                                    <button
                                        onClick={() => { handleLogout(); setIsDropdownOpen(false); }}
                                        className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 font-bold"
                                    >
                                        Cerrar Sesión
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </nav>
    )
}
