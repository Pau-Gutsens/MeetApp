'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function Navbar() {
    const router = useRouter()
    const { user, signOut } = useAuth()
    const [hasNotifications, setHasNotifications] = useState(false)

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
                        <Link href="/profile" className="flex items-center gap-2 text-gray-700 hover:text-indigo-600 px-3 py-2 rounded-md text-sm font-medium transition-colors relative">
                            <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 relative">
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                                {hasNotifications && (
                                    <span className="absolute top-0 right-0 block h-2.5 w-2.5 rounded-full ring-2 ring-white bg-red-500 animate-pulse" />
                                )}
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
