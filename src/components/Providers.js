'use client'

import { useEffect } from 'react'
import { AuthProvider } from '@/context/AuthContext'
import { SettingsProvider } from '@/context/SettingsContext'

export function Providers({ children }) {
    useEffect(() => {
        // Attempt to lock screen orientation to portrait
        // Note: Browsers may reject this promise if not full-screen or installed as PWA.
        if (typeof window !== 'undefined' && window.screen && window.screen.orientation && window.screen.orientation.lock) {
            window.screen.orientation.lock('portrait').catch((err) => {
                console.warn('Screen orientation lock failed or not permitted by browser:', err)
            })
        }
    }, [])

    return (
        <SettingsProvider>
            <AuthProvider>
                {children}
            </AuthProvider>
        </SettingsProvider>
    )
}
