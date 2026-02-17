'use client'
import { useEffect, useState, Suspense } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import GroupCalendar from '@/components/GroupCalendar'
import AvailabilityPicker from '@/components/AvailabilityPicker'

const formatProposal = (proposal, description) => {
    return `__PROPOSAL__:${JSON.stringify(proposal)}__DESC__:${description}`
}

const parseProposal = (rawDescription) => {
    if (!rawDescription?.startsWith('__PROPOSAL__:')) return { proposal: null, description: rawDescription }
    try {
        const parts = rawDescription.split('__DESC__:')
        const proposal = JSON.parse(parts[0].replace('__PROPOSAL__:', ''))
        return { proposal, description: parts[1] || '' }
    } catch (e) {
        return { proposal: null, description: rawDescription }
    }
}

const isPlanPossible = (quedada, participants) => {
    if (!quedada || !participants || participants.length < quedada.aforo_min) return false

    const { proposal } = parseProposal(quedada.descripcion || quedada.rawDescription)
    if (!proposal) return false

    const pStart = new Date(proposal.start)
    const pEnd = new Date(proposal.end)

    // Standard hourly slot generation (UTC)
    const getNeededSlots = (start, end) => {
        const slots = []
        let curr = new Date(start)
        curr.setMinutes(0, 0, 0, 0)

        // Ensure at least the start hour slot is included
        slots.push(curr.toISOString().replace(/\.\d{3}Z$/, 'Z'))

        // Add subsequent hours if the range spans more than one hour
        let nextHour = new Date(curr)
        nextHour.setHours(nextHour.getHours() + 1)

        while (nextHour < end) {
            slots.push(nextHour.toISOString().replace(/\.\d{3}Z$/, 'Z'))
            nextHour.setHours(nextHour.getHours() + 1)
        }
        return slots
    }

    const neededSlots = getNeededSlots(pStart, pEnd)
    if (neededSlots.length === 0) return false

    const compatibleCount = participants.filter(p => {
        const userSlots = p.disponibilidad || []
        // Normalize user slots to match the new format if they were in the old local format
        // This handles transition between old and new format
        return neededSlots.every(slot => userSlots.includes(slot))
    }).length

    return compatibleCount >= quedada.aforo_min
}

function GroupDetailsContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const groupId = searchParams.get('id')
    const [user, setUser] = useState(null)
    const [group, setGroup] = useState(null)
    const [quedadas, setQuedadas] = useState([])
    const [formData, setFormData] = useState({
        nombre: '',
        descripcion: '',
        rango_inicio: '',
        rango_fin: '',
        propuesta_inicio: '',
        propuesta_fin: '',
        aforo_min: 1,
        aforo_max: 10
    })
    const [msg, setMsg] = useState('')
    const [loading, setLoading] = useState(true)
    const [view, setView] = useState('list') // 'list', 'create', 'details'
    const [activeTab, setActiveTab] = useState('quedadas') // 'quedadas', 'recuerdos'
    const [selectedQuedada, setSelectedQuedada] = useState(null)
    const [quedadaParticipants, setQuedadaParticipants] = useState([])
    const [isParticipant, setIsParticipant] = useState(false)
    const [proponentName, setProponentName] = useState('')
    const [selectedProposal, setSelectedProposal] = useState(null)
    const [selectedPastId, setSelectedPastId] = useState(null) // ID to auto-select in Recuerdos
    const [myMembership, setMyMembership] = useState(null)
    const [myApodo, setMyApodo] = useState('')
    const [isEditingApodo, setIsEditingApodo] = useState(false)
    const [isEditingMeeting, setIsEditingMeeting] = useState(false)
    const [editFormData, setEditFormData] = useState({
        nombre: '',
        descripcion: '',
        aforo_min: 1,
        aforo_max: 10,
        propuesta_inicio: '',
        propuesta_fin: ''
    })
    const [showBestSlot, setShowBestSlot] = useState(false)
    const [bestSlot, setBestSlot] = useState(null)
    const [isEditingIdentity, setIsEditingIdentity] = useState(false)
    const [uploadingPhoto, setUploadingPhoto] = useState(false)
    const [previewUrl, setPreviewUrl] = useState(null)

    const handlePhotoUpload = async (e) => {
        try {
            setUploadingPhoto(true)
            const file = e.target.files?.[0]
            if (!file) return

            const fileExt = file.name.split('.').pop()
            const fileName = `${groupId}/${user.id}-${Date.now()}.${fileExt}`
            const filePath = `${fileName}`

            // 1. Upload to Supabase Storage
            const { error: uploadError } = await supabase.storage
                .from('Fotos-perfil')
                .upload(filePath, file)

            if (uploadError) throw uploadError

            // 2. Get Public URL
            const { data: { publicUrl } } = supabase.storage
                .from('Fotos-perfil')
                .getPublicUrl(filePath)

            // 3. Update State & DB
            setPreviewUrl(publicUrl)
            const { error: dbError } = await supabase
                .from('MiembroGrupo')
                .update({ url_foto: publicUrl })
                .eq('id_grupo', groupId)
                .eq('id_usuario', user.id)

            if (dbError) throw dbError

            // 4. Update local membership state to reflect change immediately
            setMyMembership(prev => ({ ...prev, url_foto: publicUrl }))

        } catch (error) {
            console.error('Error uploading photo:', error)
            setPreviewUrl(null) // Revert preview on error
        } finally {
            setUploadingPhoto(false)
        }
    }

    const handleUpdateIdentity = async () => {
        try {
            const { error } = await supabase
                .from('MiembroGrupo')
                .update({ apodo: myApodo })
                .eq('id_grupo', groupId)
                .eq('id_usuario', user.id)

            if (error) throw error

            setIsEditingIdentity(false)
            setMsg('Identidad actualizada')
            setTimeout(() => setMsg(''), 2000)
            loadData() // Refresh to sync everywhere
        } catch (error) {
            console.error('Error updating identity:', error)
        }
    }

    useEffect(() => {
        loadData()
    }, [router])

    const loadData = async () => {
        if (!groupId) {
            router.push('/dashboard')
            return
        }

        const { data: { session } } = await supabase.auth.getSession()
        if (!session) { router.push('/auth'); return }
        setUser(session.user)

        // Verify Membership
        const { data: membership, error } = await supabase
            .from('MiembroGrupo')
            .select('*, Grupo(*)')
            .eq('id_usuario', session.user.id)
            .eq('id_grupo', groupId)
            .single()

        if (error || !membership?.Grupo) {
            console.error("No eres miembro de este grupo o no existe")
            router.push('/dashboard')
            return
        }

        setGroup(membership.Grupo)
        setMyMembership(membership)
        setMyApodo(membership.apodo || '')
        fetchQuedadas(groupId)
        setLoading(false)
    }

    const fetchQuedadas = async (groupId) => {
        const { data } = await supabase
            .from('Quedada')
            .select('*, ParticipacionQuedada(id_usuario, rol, disponibilidad)')
            .eq('id_grupo', groupId)
            .order('fecha_inicio', { ascending: true })
        setQuedadas(data || [])
    }

    useEffect(() => {
        if (!group) return

        const channel = supabase
            .channel(`group-activity-${group.id_grupo}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'Quedada',
                filter: `id_grupo=eq.${group.id_grupo}`
            }, () => {
                fetchQuedadas(group.id_grupo)
            })
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'ParticipacionQuedada'
            }, (payload) => {
                // Refresh both list and details to update "Posible" tags
                fetchQuedadas(groupId)
                if (selectedQuedada && (payload.new?.id_quedada === selectedQuedada.id_quedada || payload.old?.id_quedada === selectedQuedada.id_quedada)) {
                    fetchQuedadaDetails(selectedQuedada.id_quedada)
                }
            })
            .subscribe()

        return () => { supabase.removeChannel(channel) }
    }, [group, selectedQuedada])

    const selectQuedada = async (q) => {
        setIsEditingMeeting(false)
        setShowBestSlot(false)
        const { proposal, description } = parseProposal(q.descripcion)
        setSelectedQuedada({ ...q, rawDescription: q.descripcion, description })
        setSelectedProposal(proposal)
        setView('details')
        await fetchQuedadaDetails(q.id_quedada)
    }

    const fetchQuedadaDetails = async (quedadaId) => {
        // Reset proponent name for new selection
        setProponentName('')

        // 1. Get Participants for this quedada
        const { data: parts } = await supabase
            .from('ParticipacionQuedada')
            .select(`
                *,
                Usuario(email, nombre)
            `)
            .eq('id_quedada', quedadaId)

        // 2. Get all members of the group to get their nicknames
        const { data: members } = await supabase
            .from('MiembroGrupo')
            .select('id_usuario, apodo')
            .eq('id_grupo', groupId)

        const enhancedParts = (parts || []).map(p => {
            const member = members?.find(m => m.id_usuario === p.id_usuario)
            const u = Array.isArray(p.Usuario) ? p.Usuario[0] : p.Usuario
            const displayName = member?.apodo || u?.nombre || u?.email || 'Anónimo'

            if (p.rol === 'Organizador') {
                setProponentName(displayName)
            }

            return {
                ...p,
                displayName
            }
        })

        setQuedadaParticipants(enhancedParts)
        const amIIn = enhancedParts.find(p => p.id_usuario === user.id)
        setIsParticipant(!!amIIn)

        // Calculate best slot for creator convenience
        const counts = {}
        enhancedParts.forEach(p => {
            (p.disponibilidad || []).forEach(slot => {
                counts[slot] = (counts[slot] || 0) + 1
            })
        })
        let max = 0
        let best = null
        for (const slot in counts) {
            if (counts[slot] > max) {
                max = counts[slot]
                best = slot
            }
        }
        setBestSlot(best ? { slot: best, count: max } : null)
    }

    const handleCreateWrapper = async () => {
        setMsg('')
        const now = new Date()

        if (!formData.nombre || !formData.rango_inicio || !formData.propuesta_inicio) {
            setMsg('Faltan campos obligatorios.')
            return
        }

        if (new Date(formData.rango_inicio) < now.setHours(0, 0, 0, 0)) {
            setMsg('No puedes crear una quedada con una fecha de inicio pasada.')
            return
        }

        try {
            // Range (Full days for voting grid)
            const rangingStart = new Date(formData.rango_inicio)
            rangingStart.setHours(0, 0, 0, 0)
            const rangingEnd = new Date(formData.rango_fin || formData.rango_inicio)
            rangingEnd.setHours(23, 59, 59, 999)

            // Suggestion (Specific point)
            const proposal = {
                start: new Date(formData.propuesta_inicio).toISOString(),
                end: new Date(formData.propuesta_fin || formData.propuesta_inicio).toISOString()
            }

            const { data, error } = await supabase.from('Quedada').insert({
                id_grupo: group.id_grupo,
                nombre: formData.nombre,
                descripcion: formatProposal(proposal, formData.descripcion),
                aforo_min: Math.max(0, parseInt(formData.aforo_min) || 0),
                aforo_max: Math.max(0, parseInt(formData.aforo_max) || 0),
                fecha_inicio: rangingStart.toISOString(),
                fecha_fin: rangingEnd.toISOString(),
                estado: 'Propuesta'
            }).select().single()

            if (error) throw error

            // Auto-join as Organizador
            await supabase.from('ParticipacionQuedada').insert({
                id_quedada: data.id_quedada,
                id_usuario: user.id,
                rol: 'Organizador'
            })

            await fetchQuedadas(group.id_grupo)
            // Open the grid immediately for the new plan
            selectQuedada(data)
            setFormData({ nombre: '', descripcion: '', rango_inicio: '', rango_fin: '', propuesta_inicio: '', propuesta_fin: '', aforo_min: 1, aforo_max: 10 })
        } catch (e) { setMsg(e.message) }
    }

    const handleJoin = async (quedada) => {
        const amIParticipant = quedada.ParticipacionQuedada?.some(p => p.id_usuario === user.id)

        try {
            if (amIParticipant) {
                // Leave
                await supabase
                    .from('ParticipacionQuedada')
                    .delete()
                    .eq('id_quedada', quedada.id_quedada)
                    .eq('id_usuario', user.id)

                if (selectedQuedada?.id_quedada === quedada.id_quedada) {
                    setIsParticipant(false)
                }
            } else {
                // Join
                if (quedada.ParticipacionQuedada?.length >= quedada.aforo_max) {
                    return
                }
                await supabase
                    .from('ParticipacionQuedada')
                    .insert({
                        id_quedada: quedada.id_quedada,
                        id_usuario: user.id,
                        rol: 'Invitado'
                    })

                // After joining, open the availability grid automatically
                selectQuedada(quedada)
            }
            await fetchQuedadas(groupId)
            if (selectedQuedada?.id_quedada === quedada.id_quedada) {
                await fetchQuedadaDetails(quedada.id_quedada)
            }
        } catch (e) { console.error(e) }
    }

    const handleFinalize = async (quedadaId) => {
        const { error } = await supabase
            .from('Quedada')
            .update({ estado: 'Realizada' })
            .eq('id_quedada', quedadaId)

        if (!error) fetchQuedadas(groupId)
        else console.error(error.message)
    }

    const handleDiscard = async (quedadaId) => {
        if (!confirm('¿Seguro que quieres descartar esta propuesta? Se eliminará definitivamente.')) return

        const { error } = await supabase
            .from('Quedada')
            .delete()
            .eq('id_quedada', quedadaId)

        if (!error) fetchQuedadas(groupId)
        else console.error(error.message)
    }

    const handleUpdateMeeting = async () => {
        setMsg('')
        try {
            const { proposal, description } = parseProposal(selectedQuedada.rawDescription)

            // Re-format description with new proposal if dates changed
            const newProposal = {
                start: new Date(editFormData.propuesta_inicio || proposal?.start || new Date().toISOString()).toISOString(),
                end: new Date(editFormData.propuesta_fin || proposal?.end || new Date().toISOString()).toISOString()
            }

            const { error } = await supabase
                .from('Quedada')
                .update({
                    nombre: editFormData.nombre,
                    descripcion: formatProposal(newProposal, editFormData.descripcion),
                    aforo_min: Math.max(0, parseInt(editFormData.aforo_min) || 0),
                    aforo_max: Math.max(0, parseInt(editFormData.aforo_max) || 0)
                })
                .eq('id_quedada', selectedQuedada.id_quedada)

            if (error) throw error

            setIsEditingMeeting(false)
            await fetchQuedadas(groupId)

            // Update local selected state immediately for better UX
            const updatedRawDescription = formatProposal(newProposal, editFormData.descripcion)
            setSelectedQuedada(prev => ({
                ...prev,
                nombre: editFormData.nombre,
                descripcion: editFormData.descripcion,
                rawDescription: updatedRawDescription,
                aforo_min: editFormData.aforo_min,
                aforo_max: editFormData.aforo_max
            }))
            setSelectedProposal(newProposal)
        } catch (e) { console.error(e) }
    }

    if (loading) return <div className="p-8">Cargando...</div>
    if (!group) return <div className="p-8">Error: No tienes grupo.</div>

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-slate-950 relative p-6 font-sans transition-colors duration-300">
            {/* PROFILE BUTTON: Top Left */}
            {/* PROFILE BUTTON: Top Left (NOW GROUP IDENTITY) */}
            <div
                onClick={() => setIsEditingIdentity(true)}
                className="absolute top-6 left-6 z-50 bg-white dark:bg-slate-800 p-2 rounded-full shadow-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-transform cursor-pointer flex items-center gap-2 pr-4 border border-gray-100 dark:border-slate-700"
                title="Tu Identidad en este Grupo"
            >
                <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden relative border border-gray-300 dark:border-slate-600">
                    {myMembership?.url_foto ? (
                        <img src={myMembership.url_foto} alt="Me" className="h-full w-full object-cover" />
                    ) : (
                        <div className="h-full w-full flex items-center justify-center text-gray-400 dark:text-slate-500 font-bold text-xs">
                            {user?.email?.[0].toUpperCase()}
                        </div>
                    )}
                </div>
                <div className="flex flex-col">
                    <span className="text-xs font-bold text-gray-900 dark:text-slate-100 leading-tight max-w-[100px] truncate">{myApodo || 'Sin apodo'}</span>
                    <span className="text-[9px] text-gray-400 dark:text-slate-500 font-bold uppercase tracking-wider">TÚ</span>
                </div>
            </div>

            <div className="max-w-full mx-auto pt-16 px-6 lg:px-12">

                {/* Header & Tabs */}
                <div className="mb-8">
                    <div className="flex justify-between items-start mb-6">
                        <h1 className="text-4xl font-bold text-gray-900 dark:text-white transition-colors">{group.nombre}</h1>

                        {/* Group Code Display (Restored) */}
                        <div className="bg-indigo-50 dark:bg-indigo-950/30 px-4 py-2 rounded-xl border border-indigo-100 dark:border-indigo-900/50 flex flex-col items-center">
                            <p className="text-[10px] font-black text-indigo-400 dark:text-indigo-500 uppercase tracking-widest text-center">Código Invitación</p>
                            <p className="text-lg font-black text-indigo-700 dark:text-indigo-400 tracking-widest leading-none mt-1 select-all cursor-pointer" onClick={() => navigator.clipboard.writeText(group.codigo_invitacion)} title="Copiar">{group.codigo_invitacion?.toUpperCase()}</p>
                        </div>
                    </div>

                    {/* IDENTITY MODAL */}
                    {isEditingIdentity && (
                        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
                            <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl p-6 w-full max-w-sm relative border border-white/10">
                                <button onClick={() => setIsEditingIdentity(false)} className="absolute top-4 right-4 text-gray-400 hover:text-black dark:hover:text-white">
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>

                                <h3 className="text-xl font-black text-gray-900 dark:text-white mb-6 text-center">TU IDENTIDAD EN EL GRUPO</h3>

                                <div className="flex flex-col items-center gap-6">
                                    {/* Photo Upload */}
                                    <div className="relative group">
                                        <div className="h-24 w-24 rounded-full bg-gray-100 dark:bg-slate-900 border-4 border-white dark:border-slate-700 shadow-lg overflow-hidden flex items-center justify-center">
                                            {previewUrl || myMembership?.url_foto ? (
                                                <img src={previewUrl || myMembership.url_foto} className="h-full w-full object-cover" />
                                            ) : (
                                                <span className="text-4xl text-gray-300 dark:text-slate-700">USER</span>
                                            )}
                                        </div>
                                        <label className="absolute bottom-0 right-0 bg-black dark:bg-indigo-600 text-white p-2 rounded-full cursor-pointer shadow-md hover:scale-110 transition-transform">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                            <input type="file" className="hidden" accept="image/*" onChange={handlePhotoUpload} disabled={uploadingPhoto} />
                                        </label>
                                        {uploadingPhoto && <div className="absolute inset-0 bg-white/50 dark:bg-slate-900/50 flex items-center justify-center rounded-full"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-black dark:border-white"></div></div>}
                                    </div>

                                    {/* Nickname Input */}
                                    <div className="w-full">
                                        <label className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase ml-2 mb-1 block">Tu Apodo</label>
                                        <input
                                            className="w-full bg-gray-50 dark:bg-slate-900 border-none rounded-xl p-3 font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                                            value={myApodo}
                                            onChange={e => setMyApodo(e.target.value)}
                                            placeholder="Ej. 'El Risas'"
                                        />
                                    </div>

                                    <button
                                        onClick={handleUpdateIdentity}
                                        className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-lg hover:bg-indigo-700 transition-all uppercase tracking-wide"
                                    >
                                        Guardar Cambios
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                        <div className="flex space-x-1 bg-gray-200 dark:bg-slate-800 p-1 rounded-xl w-fit">
                            <button
                                onClick={() => { setActiveTab('quedadas'); setView('list'); }}
                                className={`px-6 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'quedadas' ? 'bg-white dark:bg-slate-700 text-black dark:text-white shadow-sm' : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'}`}
                            >
                                🚀 Quedadas
                            </button>
                            <button
                                onClick={() => { setActiveTab('recuerdos'); setSelectedPastId(null); }}
                                className={`px-6 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'recuerdos' ? 'bg-white dark:bg-slate-700 text-black dark:text-white shadow-sm' : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'}`}
                            >
                                📸 Recuerdos
                            </button>
                        </div>

                        <Link href="/dashboard" className="text-gray-500 dark:text-slate-400 hover:text-black dark:hover:text-white font-medium flex items-center gap-1 group">
                            <span className="group-hover:-translate-x-1 transition-transform">&larr;</span> Volver al Panel
                        </Link>
                    </div>

                    {/* --- RECUERDOS TAB --- */}
                    {activeTab === 'recuerdos' && (
                        <GroupCalendar
                            groupId={group.id_grupo}
                            userId={user.id}
                            initialSelectedId={selectedPastId}
                        />
                    )}

                    {/* --- QUEDADAS TAB CONTENT --- */}
                    {activeTab === 'quedadas' && (
                        <>
                            {/* Back Link */}
                            {view !== 'list' && (
                                <button onClick={() => { setView('list'); setIsEditingMeeting(false); }} className="mb-4 text-gray-500 dark:text-slate-400 hover:text-black dark:hover:text-white font-medium">
                                    &larr; Volver a la lista
                                </button>
                            )}

                            {/* --- LIST VIEW --- */}
                            {view === 'list' && (
                                <>
                                    <div className="flex justify-between items-end mb-8">
                                        <div>
                                            <p className="text-gray-500 dark:text-slate-400 font-medium">Próximas quedadas</p>
                                        </div>
                                        <button
                                            onClick={() => setView('create')}
                                            className="bg-black dark:bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:bg-gray-800 dark:hover:bg-indigo-700 transition-all"
                                        >
                                            + Crear Quedada
                                        </button>
                                    </div>

                                    <div className="space-y-12">
                                        {(() => {
                                            const now = new Date();
                                            const activeMeetings = quedadas.filter(q => new Date(q.fecha_fin || q.fecha_inicio) >= now);
                                            const pastMeetings = quedadas.filter(q => new Date(q.fecha_fin || q.fecha_inicio) < now);

                                            return (
                                                <>
                                                    {/* SECTION: ACTIVE MEETINGS */}
                                                    <div>
                                                        <h2 className="text-xl font-black text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                                                            🔥 Próximas Quedadas
                                                            {activeMeetings.length > 0 && <span className="bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 text-[10px] px-2 py-0.5 rounded-full">{activeMeetings.length}</span>}
                                                        </h2>
                                                        <div className="grid gap-4">
                                                            {activeMeetings.length === 0 ? (
                                                                <div className="bg-white dark:bg-slate-800 p-12 rounded-2xl text-center shadow-sm border border-gray-200 dark:border-slate-700">
                                                                    <p className="text-gray-400 dark:text-slate-500 text-lg">No hay planes activos... 😴</p>
                                                                </div>
                                                            ) : (
                                                                activeMeetings.map(q => {
                                                                    const amIIn = q.ParticipacionQuedada?.some(p => p.id_usuario === user.id)
                                                                    return (
                                                                        <div key={q.id_quedada} className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm hover:shadow-md transition-all border border-gray-100 dark:border-slate-700 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                                                            <div className="flex-1 cursor-pointer" onClick={() => selectQuedada(q)}>
                                                                                <div className="flex items-center gap-3 mb-1">
                                                                                    <h3 className="text-xl font-black text-gray-800 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">{q.nombre}</h3>
                                                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-tighter border ${q.estado === 'Propuesta' ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-900/50 text-yellow-700 dark:text-yellow-400' : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-900/50 text-green-700 dark:text-green-400'}`}>
                                                                                        {q.estado}
                                                                                    </span>
                                                                                    {q.estado === 'Propuesta' && isPlanPossible(q, q.ParticipacionQuedada) && (
                                                                                        <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-tighter border bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-900/50 text-blue-700 dark:text-blue-400">
                                                                                            Posible
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                                <p className="text-gray-500 dark:text-slate-400 text-sm font-medium">📅 Del {new Date(q.fecha_inicio).toLocaleDateString()} al {new Date(q.fecha_fin || q.fecha_inicio).toLocaleDateString()}</p>
                                                                                <p className="text-gray-400 dark:text-slate-500 text-xs mt-1 line-clamp-1">{parseProposal(q.descripcion).description}</p>
                                                                            </div>

                                                                            <div className="flex items-center gap-2 w-full md:w-auto">
                                                                                {(() => {
                                                                                    const participation = q.ParticipacionQuedada?.find(p => p.id_usuario === user.id);
                                                                                    const isOrganizer = participation?.rol === 'Organizador';
                                                                                    return isOrganizer && (
                                                                                        <button
                                                                                            onClick={(e) => {
                                                                                                e.stopPropagation();
                                                                                                selectQuedada(q);
                                                                                                setIsEditingMeeting(true);
                                                                                                const { proposal, description } = parseProposal(q.descripcion);
                                                                                                setEditFormData({
                                                                                                    nombre: q.nombre,
                                                                                                    descripcion: description,
                                                                                                    aforo_min: q.aforo_min,
                                                                                                    aforo_max: q.aforo_max,
                                                                                                    propuesta_inicio: proposal?.start?.slice(0, 16) || '',
                                                                                                    propuesta_fin: proposal?.end?.slice(0, 16) || ''
                                                                                                });
                                                                                            }}
                                                                                            className="p-2 text-indigo-400 dark:text-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                                                                                            title="Editar quedada"
                                                                                        >
                                                                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                                                            </svg>
                                                                                        </button>
                                                                                    );
                                                                                })()}
                                                                                <button
                                                                                    onClick={(e) => { e.stopPropagation(); handleDiscard(q.id_quedada); }}
                                                                                    className="p-2 text-red-400 dark:text-red-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                                                                                    title="Cancelar quedada"
                                                                                >
                                                                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                                    </svg>
                                                                                </button>
                                                                                <button
                                                                                    onClick={(e) => { e.stopPropagation(); handleJoin(q); }}
                                                                                    className={`flex-1 md:flex-none px-4 py-2 rounded-xl font-bold text-sm transition-all ${amIIn ? 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300' : (q.ParticipacionQuedada?.length >= q.aforo_max ? 'bg-gray-200 dark:bg-slate-800 text-gray-400 dark:text-slate-600 cursor-not-allowed' : 'bg-indigo-600 text-white shadow-lg hover:bg-indigo-700')}`}
                                                                                >
                                                                                    {amIIn ? 'Gestionar Horas' : (q.ParticipacionQuedada?.length >= q.aforo_max ? 'Completo 🛑' : '¡Me apunto!')}
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    )
                                                                })
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* SECTION: PAST MEETINGS */}
                                                    {pastMeetings.length > 0 && (
                                                        <div>
                                                            <h2 className="text-xl font-black text-gray-400 dark:text-slate-600 mb-4 flex items-center gap-2">
                                                                🕰️ Pendientes de confirmación
                                                                <span className="bg-gray-100 dark:bg-slate-900 text-gray-400 dark:text-slate-600 text-[10px] px-2 py-0.5 rounded-full">{pastMeetings.filter(q => q.estado !== 'Realizada').length}</span>
                                                            </h2>
                                                            <div className="grid gap-3">
                                                                {pastMeetings.map(q => {
                                                                    if (q.estado === 'Realizada') return null;
                                                                    return (
                                                                        <div key={q.id_quedada} className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-gray-100 dark:border-slate-700 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-sm">
                                                                            <div className="flex-1">
                                                                                <h4 className="font-bold text-gray-700 dark:text-slate-300 text-lg">{q.nombre}</h4>
                                                                                <p className="text-xs text-gray-400 dark:text-slate-500 uppercase font-black tracking-widest mt-1">Finalizó el {new Date(q.fecha_fin || q.fecha_inicio).toLocaleDateString()}</p>
                                                                            </div>
                                                                            <div className="flex gap-2 w-full md:w-auto">
                                                                                <button
                                                                                    onClick={() => handleFinalize(q.id_quedada)}
                                                                                    className="flex-1 md:flex-none bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-green-700 transition-all shadow-md"
                                                                                >
                                                                                    Confirmar (Recuerdos) 📸
                                                                                </button>
                                                                                <button
                                                                                    onClick={() => handleDiscard(q.id_quedada)}
                                                                                    className="flex-1 md:flex-none bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400 px-4 py-2 rounded-xl text-sm font-bold hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 transition-all"
                                                                                >
                                                                                    Descartar 🗑️
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    )}
                                                </>
                                            );
                                        })()}
                                    </div>
                                </>
                            )}

                            {/* --- CREATE VIEW --- */}
                            {view === 'create' && (
                                <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-xl max-w-2xl mx-auto border border-gray-100 dark:border-slate-700">
                                    <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Nueva Quedada</h2>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 dark:text-slate-300 mb-1">Nombre</label>
                                            <input className="w-full p-3 bg-gray-50 dark:bg-slate-900 rounded-xl border-transparent focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-black dark:focus:ring-indigo-500 text-gray-900 dark:text-white" value={formData.nombre} onChange={e => setFormData({ ...formData, nombre: e.target.value })} placeholder="Cena de Navidad, Bolera..." />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 dark:text-slate-300 mb-1">Descripción</label>
                                            <textarea className="w-full p-3 bg-gray-50 dark:bg-slate-900 rounded-xl border-transparent focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-black dark:focus:ring-indigo-500 text-gray-900 dark:text-white" value={formData.descripcion} onChange={e => setFormData({ ...formData, descripcion: e.target.value })} placeholder="Detalles del plan..." />
                                        </div>
                                        <div className="bg-indigo-50 dark:bg-indigo-950/20 p-6 rounded-2xl border border-indigo-100 dark:border-indigo-900/40">
                                            <h3 className="text-sm font-black text-indigo-700 dark:text-indigo-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                                📅 Rango de Disponibilidad
                                                <span className="text-[10px] font-normal lowercase bg-indigo-100 dark:bg-indigo-900/50 text-indigo-500 dark:text-indigo-300 px-2 py-0.5 rounded-full">Días para los que se puede votar</span>
                                            </h3>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-[10px] font-black text-indigo-400 dark:text-indigo-500 uppercase mb-1">Día Inicio</label>
                                                    <input
                                                        type="date"
                                                        className="w-full p-3 bg-white dark:bg-slate-900 rounded-xl text-black dark:text-white border border-indigo-100 dark:border-indigo-900/50 focus:ring-2 focus:ring-indigo-600"
                                                        value={formData.rango_inicio}
                                                        min={new Date().toISOString().split('T')[0]}
                                                        onChange={e => setFormData({ ...formData, rango_inicio: e.target.value })}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-black text-indigo-400 dark:text-indigo-500 uppercase mb-1">Día Fin</label>
                                                    <input
                                                        type="date"
                                                        className="w-full p-3 bg-white dark:bg-slate-900 rounded-xl text-black dark:text-white border border-indigo-100 dark:border-indigo-900/50 focus:ring-2 focus:ring-indigo-600"
                                                        value={formData.rango_fin}
                                                        min={formData.rango_inicio || new Date().toISOString().split('T')[0]}
                                                        onChange={e => setFormData({ ...formData, rango_fin: e.target.value })}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="bg-green-50 dark:bg-green-950/20 p-6 rounded-2xl border border-green-100 dark:border-green-900/40">
                                            <h3 className="text-sm font-black text-green-700 dark:text-green-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                                🎯 Tu Propuesta Específica
                                                <span className="text-[10px] font-normal lowercase bg-green-100 dark:bg-green-900/50 text-green-500 dark:text-green-300 px-2 py-0.5 rounded-full">Día y hora ideal</span>
                                            </h3>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-[10px] font-black text-green-400 uppercase mb-1">Sugerencia Inicio</label>
                                                    <input
                                                        type="datetime-local"
                                                        className="w-full p-3 bg-white rounded-xl text-black border border-green-100 focus:ring-2 focus:ring-green-600"
                                                        value={formData.propuesta_inicio}
                                                        min={formData.rango_inicio ? `${formData.rango_inicio}T00:00` : new Date().toISOString().slice(0, 16)}
                                                        max={formData.rango_fin ? `${formData.rango_fin}T23:59` : undefined}
                                                        onChange={e => setFormData({ ...formData, propuesta_inicio: e.target.value })}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-black text-green-400 uppercase mb-1">Sugerencia Fin</label>
                                                    <input
                                                        type="datetime-local"
                                                        className="w-full p-3 bg-white dark:bg-slate-900 rounded-xl text-black dark:text-white border border-green-100 dark:border-green-900/30 focus:ring-2 focus:ring-green-600"
                                                        value={formData.propuesta_fin}
                                                        min={formData.propuesta_inicio || new Date().toISOString().slice(0, 16)}
                                                        max={formData.rango_fin ? `${formData.rango_fin}T23:59` : undefined}
                                                        onChange={e => setFormData({ ...formData, propuesta_fin: e.target.value })}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-bold text-gray-700 dark:text-slate-300 mb-1">Aforo Mín</label>
                                                <input type="number" min="0" className="w-full p-3 bg-gray-50 dark:bg-slate-900 rounded-xl text-black dark:text-white border-transparent dark:border-slate-700" value={formData.aforo_min} onChange={e => setFormData({ ...formData, aforo_min: e.target.value })} />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-bold text-gray-700 dark:text-slate-300 mb-1">Aforo Máx</label>
                                                <input type="number" min="0" className="w-full p-3 bg-gray-50 dark:bg-slate-900 rounded-xl text-black dark:text-white border-transparent dark:border-slate-700" value={formData.aforo_max} onChange={e => setFormData({ ...formData, aforo_max: e.target.value })} />
                                            </div>
                                        </div>

                                        {msg && <p className="text-red-500 font-bold text-center">{msg}</p>}

                                        <button onClick={handleCreateWrapper} className="w-full py-4 bg-black text-white rounded-xl font-bold shadow-lg hover:scale-[1.02] transition-transform">
                                            Publicar Quedada
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* --- DETAILS VIEW --- */}
                            {view === 'details' && selectedQuedada && (
                                <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-xl border border-gray-100 dark:border-slate-700">
                                    <div className="flex justify-between items-start mb-6">
                                        <div>
                                            <h1 className="text-3xl font-extrabold text-gray-900 mb-2">{selectedQuedada.nombre}</h1>
                                            <div className="flex items-center gap-2">
                                                <span className={`px-3 py-1 rounded-full text-sm font-bold ${selectedQuedada.estado === 'Propuesta' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                                                    {selectedQuedada.estado}
                                                </span>
                                                {selectedQuedada.estado === 'Propuesta' && isPlanPossible(selectedQuedada, quedadaParticipants) && (
                                                    <span className="ml-2 px-3 py-1 rounded-full text-sm font-bold bg-blue-100 text-blue-800">
                                                        Posible
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-2">
                                            <div className="flex items-center gap-2">
                                                {quedadaParticipants.find(p => p.id_usuario === user.id)?.rol === 'Organizador' && (
                                                    <>
                                                        <button
                                                            onClick={() => {
                                                                setIsEditingMeeting(!isEditingMeeting);
                                                                const { proposal, description } = parseProposal(selectedQuedada.rawDescription);
                                                                setEditFormData({
                                                                    nombre: selectedQuedada.nombre,
                                                                    descripcion: description,
                                                                    aforo_min: selectedQuedada.aforo_min,
                                                                    aforo_max: selectedQuedada.aforo_max,
                                                                    propuesta_inicio: proposal?.start?.slice(0, 16) || '',
                                                                    propuesta_fin: proposal?.end?.slice(0, 16) || ''
                                                                });
                                                            }}
                                                            className="p-2 text-indigo-400 hover:text-indigo-600 transition-colors"
                                                            title="Editar quedada"
                                                        >
                                                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                            </svg>
                                                        </button>
                                                        <button
                                                            onClick={() => handleDiscard(selectedQuedada.id_quedada)}
                                                            className="p-2 text-red-400 hover:text-red-600 transition-colors"
                                                            title="Eliminar quedada"
                                                        >
                                                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                            </svg>
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                            <div className="text-right">
                                                <div className="text-3xl font-bold text-indigo-600">
                                                    {quedadaParticipants.length} / {selectedQuedada.aforo_max}
                                                </div>
                                                <div className="text-sm text-gray-500">Asistentes</div>
                                            </div>
                                        </div>
                                    </div>

                                    {isEditingMeeting ? (
                                        <div className="bg-gray-50 p-6 rounded-2xl mb-8 space-y-4 border border-indigo-100">
                                            <h3 className="font-black text-indigo-700 uppercase text-xs tracking-widest mb-4">Editar Detalles de la Quedada</h3>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 dark:text-slate-400 mb-1 uppercase">Nombre</label>
                                                <input className="w-full p-3 bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 text-black dark:text-white font-bold" value={editFormData.nombre} onChange={e => setEditFormData({ ...editFormData, nombre: e.target.value })} />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 dark:text-slate-400 mb-1 uppercase">Descripción</label>
                                                <textarea className="w-full p-3 bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 text-black dark:text-white" rows={3} value={editFormData.descripcion} onChange={e => setEditFormData({ ...editFormData, descripcion: e.target.value })} />
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-500 dark:text-slate-400 mb-1 uppercase">Horario Sugerido Inicio</label>
                                                    <input type="datetime-local" className="w-full p-3 bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 text-black dark:text-white" value={editFormData.propuesta_inicio} onChange={e => setEditFormData({ ...editFormData, propuesta_inicio: e.target.value })} />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-500 dark:text-slate-400 mb-1 uppercase">Horario Sugerido Fin</label>
                                                    <input type="datetime-local" className="w-full p-3 bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 text-black dark:text-white" value={editFormData.propuesta_fin} onChange={e => setEditFormData({ ...editFormData, propuesta_fin: e.target.value })} />
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-500 dark:text-slate-400 mb-1 uppercase">Aforo Mínimo</label>
                                                    <input type="number" min="0" className="w-full p-3 bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 text-black dark:text-white font-bold" value={editFormData.aforo_min} onChange={e => setEditFormData({ ...editFormData, aforo_min: e.target.value })} />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-500 dark:text-slate-400 mb-1 uppercase">Aforo Máximo</label>
                                                    <input type="number" min="0" className="w-full p-3 bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 text-black dark:text-white font-bold" value={editFormData.aforo_max} onChange={e => setEditFormData({ ...editFormData, aforo_max: e.target.value })} />
                                                </div>
                                            </div>
                                            <button onClick={handleUpdateMeeting} className="w-full py-4 bg-indigo-600 text-white rounded-xl font-black shadow-lg hover:bg-indigo-700 transition-all">
                                                Guardar Cambios
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="prose max-w-none text-gray-600 dark:text-slate-300 mb-8 bg-gray-50 dark:bg-slate-900/50 p-6 rounded-2xl border border-gray-100 dark:border-slate-800">
                                            {selectedQuedada.description || "Sin descripción."}
                                        </div>
                                    )}

                                    <div className="flex flex-col md:flex-row gap-8">
                                        <div className="flex-1 space-y-6">
                                            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm">
                                                <div className="flex items-center gap-3 mb-4">
                                                    <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 rounded-full flex items-center justify-center font-black">
                                                        {proponentName?.[0]?.toUpperCase() || 'P'}
                                                    </div>
                                                    <div>
                                                        <h3 className="font-black text-gray-900 dark:text-white leading-tight">Propuesta de {proponentName || '...'}</h3>
                                                        <p className="text-xs text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-wider">Creador del plan</p>
                                                    </div>
                                                </div>
                                                <div className="bg-green-50/50 p-4 rounded-xl border border-green-100/50">
                                                    <p className="text-sm font-bold text-green-900 mb-2 flex items-center justify-between">
                                                        <span className="flex items-center gap-2">{showBestSlot ? '🔍 Momento más votado' : '🎯 Horario Sugerido'}</span>
                                                        {quedadaParticipants.find(p => p.id_usuario === user.id)?.rol === 'Organizador' && bestSlot && (
                                                            <button
                                                                onClick={() => setShowBestSlot(!showBestSlot)}
                                                                className="text-[10px] bg-green-200 text-green-800 px-2 py-1 rounded-lg uppercase tracking-widest hover:bg-green-300 transition-colors"
                                                            >
                                                                {showBestSlot ? 'Ver Sugerencia' : 'Ver más votado'}
                                                            </button>
                                                        )}
                                                    </p>
                                                    <div className="space-y-1">
                                                        {showBestSlot && bestSlot ? (
                                                            <div className="flex items-center gap-1 flex-wrap">
                                                                <p className="text-sm text-green-700 font-black capitalize">
                                                                    {new Date(bestSlot.slot).toLocaleString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                                                                </p>
                                                                <span className="text-[10px] bg-green-600 text-white px-2 py-0.5 rounded-full font-bold">
                                                                    {bestSlot.count} votos
                                                                </span>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                <p className="text-sm text-green-700">
                                                                    <span className="font-black">Del:</span> {selectedProposal ? new Date(selectedProposal.start).toLocaleString() : 'No especificado'}
                                                                </p>
                                                                <p className="text-sm text-green-700">
                                                                    <span className="font-black">Al:</span> {selectedProposal ? new Date(selectedProposal.end).toLocaleString() : 'No especificado'}
                                                                </p>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-700">
                                                    <p className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-2">Rango de Votación</p>
                                                    <p className="text-xs text-gray-500 dark:text-slate-400">
                                                        El grupo puede votar disponibilidad entre el <strong>{new Date(selectedQuedada.fecha_inicio).toLocaleDateString()}</strong> y el <strong>{new Date(selectedQuedada.fecha_fin).toLocaleDateString()}</strong>.
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl border border-gray-100 dark:border-slate-700 shadow-sm relative overflow-hidden">
                                                <h3 className="font-bold text-gray-900 dark:text-white mb-3">🙋 Quiénes van</h3>
                                                <div className="space-y-2">
                                                    {quedadaParticipants.map((p, i) => (
                                                        <div key={i} className="flex items-center justify-between bg-gray-50 dark:bg-slate-900/50 p-2 rounded-xl border border-transparent dark:border-slate-700/50">
                                                            <div className="flex items-center gap-3">
                                                                <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-800">
                                                                    {(p.displayName || p.Usuario?.nombre || p.Usuario?.email || '?')[0].toUpperCase()}
                                                                </div>
                                                                <span className="text-sm font-medium text-gray-700">
                                                                    {p.displayName || p.Usuario?.nombre || p.Usuario?.email || 'Anónimo'} {p.id_usuario === user.id ? '(Tú)' : ''}
                                                                </span>
                                                            </div>
                                                            <span className="text-[10px] px-2 py-1 bg-white border border-gray-200 rounded-full font-bold text-gray-500 uppercase tracking-wider">
                                                                {p.rol || 'Asistente'}
                                                            </span>
                                                        </div>
                                                    ))}
                                                    {quedadaParticipants.length === 0 && <span className="text-gray-400 italic">Nadie todavía...</span>}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {isParticipant && (
                                        <>
                                            <div className="mb-6 p-4 bg-indigo-50 dark:bg-indigo-950/30 rounded-2xl border border-indigo-100 dark:border-indigo-900/50">
                                                <label className="block text-xs font-black text-indigo-400 uppercase mb-2">Mi Rol en este plan</label>
                                                <select
                                                    className="w-full p-3 bg-white dark:bg-slate-900 rounded-xl border-none shadow-sm text-sm font-bold text-black dark:text-white focus:ring-2 focus:ring-indigo-500"
                                                    value={quedadaParticipants.find(p => p.id_usuario === user.id)?.rol || 'Asistente'}
                                                    onChange={async (e) => {
                                                        const newRol = e.target.value;
                                                        const { error } = await supabase
                                                            .from('ParticipacionQuedada')
                                                            .update({ rol: newRol })
                                                            .eq('id_quedada', selectedQuedada.id_quedada)
                                                            .eq('id_usuario', user.id);
                                                        if (!error) fetchQuedadaDetails(selectedQuedada.id_quedada);
                                                        else alert(error.message);
                                                    }}
                                                >
                                                    <option value="Organizador">Organizador</option>
                                                    <option value="Fotógrafo">Fotógrafo</option>
                                                    <option value="Pagafantas">Pagafantas</option>
                                                    <option value="Invitado">Invitado</option>
                                                    <option value="Asistente">Asistente</option>
                                                </select>
                                            </div>

                                            <AvailabilityPicker
                                                quedada={selectedQuedada}
                                                userId={user.id}
                                                onUpdate={() => fetchQuedadaDetails(selectedQuedada.id_quedada)}
                                            />
                                        </>
                                    )}

                                    <button
                                        onClick={() => handleJoin(selectedQuedada)}
                                        disabled={!isParticipant && quedadaParticipants.length >= selectedQuedada.aforo_max}
                                        className={`w-full py-4 rounded-xl font-bold text-lg shadow-lg transition-all transform hover:scale-[1.02] ${isParticipant ? 'bg-red-50 text-red-600 hover:bg-red-100' : (quedadaParticipants.length >= selectedQuedada.aforo_max ? 'bg-gray-200 text-gray-400 cursor-not-allowed hover:scale-100' : 'bg-indigo-600 text-white hover:bg-indigo-700')}`}
                                    >
                                        {isParticipant ? '❌ Me bajo del plan' : (quedadaParticipants.length >= selectedQuedada.aforo_max ? 'Límite de aforo alcanzado 🛑' : '✅ ¡Me apunto!')}
                                    </button>
                                </div>
                            )}
                        </>
                    )}

                </div>
            </div>
        </div>
    )
}

export default function GroupDetailsPage() {
    return (
        <Suspense fallback={<div className="p-8">Cargando...</div>}>
            <GroupDetailsContent />
        </Suspense>
    )
}
