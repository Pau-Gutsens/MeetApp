'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSettings } from '@/context/SettingsContext'

export default function SettingsPage() {
    const router = useRouter()
    const { settings, updateSetting } = useSettings()

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6 transition-colors duration-300">
            <div className="max-w-xl mx-auto pt-16">
                <button
                    onClick={() => router.back()}
                    className="mb-8 text-gray-500 hover:text-black dark:text-gray-400 dark:hover:text-white font-bold flex items-center gap-2"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    Volver
                </button>

                <h1 className="text-4xl font-black text-gray-900 dark:text-white mb-2">Ajustes</h1>
                <p className="text-gray-500 dark:text-gray-400 mb-12">Personaliza tu experiencia en MeetApp</p>

                <div className="space-y-6">
                    {/* Dark Mode */}
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                🌙 Modo Oscuro
                            </h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Descansa tus ojos con el tema oscuro.</p>
                        </div>
                        <button
                            onClick={() => updateSetting('darkMode', !settings.darkMode)}
                            className={`w-14 h-8 rounded-full p-1 transition-colors duration-300 ${settings.darkMode ? 'bg-indigo-600' : 'bg-gray-200'}`}
                        >
                            <div className={`w-6 h-6 bg-white rounded-full shadow-md transform transition-transform duration-300 ${settings.darkMode ? 'translate-x-6' : ''}`} />
                        </button>
                    </div>

                    {/* Sound */}
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                🔊 Sonidos
                            </h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Activa o desactiva los efectos de sonido.</p>
                        </div>
                        <button
                            onClick={() => updateSetting('soundEnabled', !settings.soundEnabled)}
                            className={`w-14 h-8 rounded-full p-1 transition-colors duration-300 ${settings.soundEnabled ? 'bg-green-500' : 'bg-gray-200'}`}
                        >
                            <div className={`w-6 h-6 bg-white rounded-full shadow-md transform transition-transform duration-300 ${settings.soundEnabled ? 'translate-x-6' : ''}`} />
                        </button>
                    </div>

                    {/* Font Size */}
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
                        <div className="mb-4">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                🅰️ Tamaño de Texto
                            </h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Ajusta el tamaño general de la letra.</p>
                        </div>
                        <div className="flex items-center gap-4">
                            <span className="text-xs font-bold text-gray-400">A</span>
                            <input
                                type="range"
                                min="12"
                                max="24"
                                step="1"
                                value={settings.fontSize}
                                onChange={(e) => updateSetting('fontSize', parseInt(e.target.value))}
                                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                            />
                            <span className="text-xl font-bold text-gray-900 dark:text-white">A</span>
                        </div>
                        <p className="text-center mt-2 text-xs font-mono text-gray-400">{settings.fontSize}px</p>
                    </div>

                    {/* Grid Size */}
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
                        <div className="mb-4">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                📅 Tamaño de Calendarios
                            </h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Haz las casillas de fechas y horas más grandes.</p>
                        </div>
                        <div className="flex items-center gap-4">
                            <span className="text-xs font-bold text-gray-400">🔍</span>
                            <input
                                type="range"
                                min="0.8"
                                max="1.5"
                                step="0.1"
                                value={settings.gridSize}
                                onChange={(e) => updateSetting('gridSize', parseFloat(e.target.value))}
                                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                            />
                            <span className="text-xl font-bold text-gray-900 dark:text-white">🔍</span>
                        </div>
                        <p className="text-center mt-2 text-xs font-mono text-gray-400">x{settings.gridSize}</p>
                    </div>
                </div>
            </div>
        </div>
    )
}
