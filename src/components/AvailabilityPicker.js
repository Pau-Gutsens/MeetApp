'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function AvailabilityPicker({ quedada, userId, onUpdate }) {
    const [myAvailability, setMyAvailability] = useState([])
    const [allParticipations, setAllParticipations] = useState([])
    const [saving, setSaving] = useState(false)

    // Dragging state
    const [isDragging, setIsDragging] = useState(false)
    const [dragStart, setDragStart] = useState(null) // { dayIdx, hourIdx }
    const [dragEnd, setDragEnd] = useState(null)     // { dayIdx, hourIdx }
    const [isSelecting, setIsSelecting] = useState(true)

    // Generate slots
    const start = new Date(quedada.fecha_inicio)
    const end = new Date(quedada.fecha_fin || new Date(start.getTime() + 4 * 60 * 60 * 1000)) // Fallback 4h

    const days = []
    let current = new Date(start)
    current.setHours(0, 0, 0, 0)
    const lastDay = new Date(end)
    lastDay.setHours(0, 0, 0, 0)

    while (current <= lastDay) {
        days.push(new Date(current))
        current.setDate(current.getDate() + 1)
    }

    const hours = Array.from({ length: 24 }, (_, i) => i) // 0:00 to 23:00

    useEffect(() => {
        fetchAvailability()
    }, [quedada.id_quedada])

    const fetchAvailability = async () => {
        // 1. Get participations
        const { data: parts } = await supabase
            .from('ParticipacionQuedada')
            .select('id_usuario, disponibilidad, Usuario(email, nombre)')
            .eq('id_quedada', quedada.id_quedada)

        // 2. Get group nicknames
        const { data: members } = await supabase
            .from('MiembroGrupo')
            .select('id_usuario, apodo')
            .eq('id_grupo', quedada.id_grupo)

        const enhanced = (parts || []).map(p => {
            const member = members?.find(m => m.id_usuario === p.id_usuario)
            const u = Array.isArray(p.Usuario) ? p.Usuario[0] : p.Usuario
            return {
                ...p,
                displayName: member?.apodo || u?.nombre || u?.email || 'Anónimo'
            }
        })

        setAllParticipations(enhanced)
        const mine = enhanced.find(p => p.id_usuario === userId)
        setMyAvailability(mine?.disponibilidad || [])
    }

    const toggleSlot = (day, hour) => {
        const slot = `${day.toISOString().split('T')[0]}T${hour.toString().padStart(2, '0')}:00:00`
        setMyAvailability(prev =>
            prev.includes(slot) ? prev.filter(s => s !== slot) : [...prev, slot]
        )
    }

    const handleMouseDown = (dayIdx, hourIdx, day, hour) => {
        const slot = `${day.toISOString().split('T')[0]}T${hour.toString().padStart(2, '0')}:00:00`
        const alreadySelected = myAvailability.includes(slot)

        setIsDragging(true)
        setDragStart({ dayIdx, hourIdx })
        setDragEnd({ dayIdx, hourIdx })
        setIsSelecting(!alreadySelected)
    }

    const handleMouseEnter = (dayIdx, hourIdx) => {
        if (isDragging) {
            setDragEnd({ dayIdx, hourIdx })
        }
    }

    const handleMouseUp = () => {
        if (!isDragging) return

        // Calculate final selection from range
        const startDay = Math.min(dragStart.dayIdx, dragEnd.dayIdx)
        const endDay = Math.max(dragStart.dayIdx, dragEnd.dayIdx)
        const startHour = Math.min(dragStart.hourIdx, dragEnd.hourIdx)
        const endHour = Math.max(dragStart.hourIdx, dragEnd.hourIdx)

        const slotsInRange = []
        for (let d = startDay; d <= endDay; d++) {
            const dateStr = days[d].toISOString().split('T')[0]
            for (let h = startHour; h <= endHour; h++) {
                const hourVal = hours[h]
                slotsInRange.push(`${dateStr}T${hourVal.toString().padStart(2, '0')}:00:00`)
            }
        }

        setMyAvailability(prev => {
            if (isSelecting) {
                return [...new Set([...prev, ...slotsInRange])]
            } else {
                return prev.filter(s => !slotsInRange.includes(s))
            }
        })

        setIsDragging(false)
        setDragStart(null)
        setDragEnd(null)
    }

    // Add global mouse up listener to handle releases outside the grid
    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mouseup', handleMouseUp)
            return () => window.removeEventListener('mouseup', handleMouseUp)
        }
    }, [isDragging, dragStart, dragEnd, isSelecting])

    const toggleAllDay = (day) => {
        const dateStr = day.toISOString().split('T')[0]
        const daySlots = hours.map(h => `${dateStr}T${h.toString().padStart(2, '0')}:00:00`)

        const allAlreadySelected = daySlots.every(s => myAvailability.includes(s))

        if (allAlreadySelected) {
            // Deselect all for this day
            setMyAvailability(prev => prev.filter(s => !daySlots.includes(s)))
        } else {
            // Select all for this day (avoid duplicates)
            setMyAvailability(prev => [...new Set([...prev, ...daySlots])])
        }
    }

    const toggleAllHour = (hour) => {
        const hourStr = hour.toString().padStart(2, '0')
        const hourSlots = days.map(d => `${d.toISOString().split('T')[0]}T${hourStr}:00:00`)

        const allAlreadySelected = hourSlots.every(s => myAvailability.includes(s))

        if (allAlreadySelected) {
            // Deselect all for this hour
            setMyAvailability(prev => prev.filter(s => !hourSlots.includes(s)))
        } else {
            // Select all for this hour
            setMyAvailability(prev => [...new Set([...prev, ...hourSlots])])
        }
    }

    const handleSave = async () => {
        setSaving(true)
        const { error } = await supabase
            .from('ParticipacionQuedada')
            .update({ disponibilidad: myAvailability })
            .eq('id_quedada', quedada.id_quedada)
            .eq('id_usuario', userId)

        if (error) alert(error.message)
        else {
            fetchAvailability()
            if (onUpdate) onUpdate()
        }
        setSaving(false)
    }

    const getOccupancy = (day, hour) => {
        const slot = `${day.toISOString().split('T')[0]}T${hour.toString().padStart(2, '0')}:00:00`
        return allParticipations.filter(p => p.disponibilidad?.includes(slot)).length
    }

    return (
        <div className="mt-8 bg-white p-6 rounded-3xl shadow-lg border border-gray-100">
            <h3 className="text-lg font-black text-gray-900 mb-4 flex items-center gap-2">
                ⏰ Mi Disponibilidad
                <span className="text-[10px] bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full uppercase tracking-widest">Beta</span>
            </h3>

            <p className="text-sm text-gray-500 mb-6">Marca las horas en las que puedes quedar. Los colores oscuros muestran dónde coincidís más.</p>

            {/* Legend */}
            <div className="mb-6 flex flex-wrap items-center gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Ocupación:</span>
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                        <div className="h-4 w-4 rounded-md bg-[#F9FAFB] border border-gray-200"></div>
                        <span className="text-[10px] font-bold text-gray-500">Nadie</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="h-4 w-4 rounded-md bg-[#dcfce7] border border-green-100"></div>
                        <span className="text-[10px] font-bold text-gray-500">Pocos</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="h-4 w-4 rounded-md bg-[#86efac]"></div>
                        <span className="text-[10px] font-bold text-gray-500">Mitad</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="h-4 w-4 rounded-md bg-[#22c55e]"></div>
                        <span className="text-[10px] font-bold text-gray-500">Mayoría</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="h-4 w-4 rounded-md bg-[#15803d]"></div>
                        <span className="text-[10px] font-bold text-gray-500">Todos</span>
                    </div>
                </div>
            </div>

            <div className="overflow-x-auto pb-4">
                <div className="grid gap-3 w-full min-w-max" style={{ gridTemplateColumns: `auto repeat(${days.length}, 1fr)` }}>
                    {/* Header: Days */}
                    <div />
                    {days.map(d => (
                        <div key={d.toISOString()} className="flex flex-col items-center gap-1 min-w-[60px]">
                            <div className="text-xs font-black text-indigo-400 uppercase tracking-tighter">
                                {d.toLocaleDateString('es-ES', { weekday: 'short' })}
                            </div>
                            <div className="text-lg font-black text-gray-900">{d.getDate()}</div>
                            <button
                                onClick={() => toggleAllDay(d)}
                                title="Seleccionar/Deseleccionar todo el día"
                                className="p-2 hover:bg-indigo-50 rounded-full transition-colors"
                            >
                                <div className={`h-6 w-6 ${hours.every(h => myAvailability.includes(`${d.toISOString().split('T')[0]}T${h.toString().padStart(2, '0')}:00:00`)) ? 'text-green-600' : 'text-gray-300'}`}>
                                    <svg fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                    </svg>
                                </div>
                            </button>
                        </div>
                    ))}

                    {/* Rows: Hours */}
                    {hours.map(h => {
                        const allSelected = days.every(d => myAvailability.includes(`${d.toISOString().split('T')[0]}T${h.toString().padStart(2, '0')}:00:00`))
                        return (
                            <div key={h} className="contents">
                                <div className="flex items-center gap-2 pr-4 min-w-[80px]">
                                    <button
                                        onClick={() => toggleAllHour(h)}
                                        title="Seleccionar/Deseleccionar toda la hora"
                                        className="p-2 hover:bg-indigo-50 rounded-full transition-colors"
                                    >
                                        <div className={`h-5 w-5 ${allSelected ? 'text-green-600' : 'text-gray-300'}`}>
                                            <svg fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                            </svg>
                                        </div>
                                    </button>
                                    <div className="text-sm font-black text-gray-400">{h}:00</div>
                                </div>
                                {days.map((d, dIdx) => {
                                    const hIdx = hours.indexOf(h)
                                    const slot = `${d.toISOString().split('T')[0]}T${h.toString().padStart(2, '0')}:00:00`

                                    // Check if this slot is in the current drag range
                                    let isInDragRange = false
                                    if (isDragging && dragStart && dragEnd) {
                                        const minD = Math.min(dragStart.dayIdx, dragEnd.dayIdx)
                                        const maxD = Math.max(dragStart.dayIdx, dragEnd.dayIdx)
                                        const minH = Math.min(dragStart.hourIdx, dragEnd.hourIdx)
                                        const maxH = Math.max(dragStart.hourIdx, dragEnd.hourIdx)

                                        isInDragRange = dIdx >= minD && dIdx <= maxD && hIdx >= minH && hIdx <= maxH
                                    }

                                    const isSelected = myAvailability.includes(slot)
                                    const effectivelySelected = isInDragRange ? isSelecting : isSelected

                                    const slotParticipants = allParticipations.filter(p => p.disponibilidad?.includes(slot))
                                    const count = slotParticipants.length
                                    const total = allParticipations.length || 1

                                    // Get names for tooltip
                                    const names = slotParticipants.map(p => p.displayName).join(', ')

                                    return (
                                        <div
                                            key={slot}
                                            onMouseDown={() => handleMouseDown(dIdx, hIdx, d, h)}
                                            onMouseEnter={() => handleMouseEnter(dIdx, hIdx)}
                                            className={`h-20 w-full rounded-2xl cursor-pointer transition-all border-2 select-none ${effectivelySelected ? 'border-green-600 ring-8 ring-green-50 shadow-lg scale-[1.02]' : 'border-gray-100 hover:border-gray-200 shadow-sm'
                                                }`}
                                            style={{
                                                backgroundColor: effectivelySelected
                                                    ? '#22c55e'
                                                    : count > 0
                                                        ? count === total
                                                            ? '#15803d' // Dark green for 100%
                                                            : `rgba(34, 197, 94, ${0.05 + (count / total) * 0.85})` // Refined range
                                                        : '#F9FAFB'
                                            }}
                                            title={count > 0 ? `Asisten: ${names}` : 'Nadie disponible'}
                                        >
                                            {count > 0 && (
                                                <div className="flex items-center justify-center h-full">
                                                    <span className={`text-xs font-black ${effectivelySelected ? 'text-white' : 'text-green-700'}`}>
                                                        {count}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        )
                    })}
                </div>
            </div>

            <div className="mt-6 flex justify-between items-center bg-indigo-50 p-4 rounded-2xl border border-indigo-100">
                <div className="text-xs font-bold text-indigo-700">
                    {myAvailability.length} horas seleccionadas
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-indigo-600 text-white px-6 py-2 rounded-xl font-bold shadow-md hover:bg-indigo-700 disabled:opacity-50"
                >
                    {saving ? 'Guardando...' : 'Guardar Horas'}
                </button>
            </div>
        </div>
    )
}
