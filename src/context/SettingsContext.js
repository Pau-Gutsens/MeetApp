'use client'
import { createContext, useContext, useState, useEffect } from 'react'

const SettingsContext = createContext()

export function SettingsProvider({ children }) {
    const [settings, setSettings] = useState({
        darkMode: false,
        soundEnabled: true,
        fontSize: 16, // px, default
        gridSize: 1, // scale factor, default 1
    })

    // Load from localStorage on mount
    useEffect(() => {
        const stored = localStorage.getItem('meetapp-settings')
        if (stored) {
            try {
                const parsed = JSON.parse(stored)
                setSettings(prev => ({ ...prev, ...parsed }))

                // Apply initial effects
                if (parsed.darkMode) document.documentElement.classList.add('dark')
                document.documentElement.style.fontSize = `${parsed.fontSize}px`
            } catch (e) {
                console.error("Failed to parse settings", e)
            }
        }
    }, [])

    // Update localStorage and effects when settings change
    const updateSetting = (key, value) => {
        setSettings(prev => {
            const newSettings = { ...prev, [key]: value }
            localStorage.setItem('meetapp-settings', JSON.stringify(newSettings))

            // Side effects
            if (key === 'darkMode') {
                if (value) document.documentElement.classList.add('dark')
                else document.documentElement.classList.remove('dark')
            }
            if (key === 'fontSize') {
                document.documentElement.style.fontSize = `${value}px`
            }

            return newSettings
        })
    }

    return (
        <SettingsContext.Provider value={{ settings, updateSetting }}>
            {children}
        </SettingsContext.Provider>
    )
}

export const useSettings = () => useContext(SettingsContext)
