'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function GroupCalendar({ groupId, userId, initialSelectedId }) {
    const [pastQuedadas, setPastQuedadas] = useState([])
    const [selectedQuedada, setSelectedQuedada] = useState(null)
    const [photos, setPhotos] = useState([])
    const [comments, setComments] = useState([])
    const [newComment, setNewComment] = useState('')
    const [uploading, setUploading] = useState(false)
    const [loading, setLoading] = useState(true)
    const [userRole, setUserRole] = useState(null)
    const [manageMode, setManageMode] = useState(false)
    const [allPhotos, setAllPhotos] = useState([]) // All photos for management

    useEffect(() => {
        fetchPastQuedadas()
    }, [groupId])

    // Handle external selection (from the Quedadas list)
    useEffect(() => {
        if (initialSelectedId && pastQuedadas.length > 0) {
            const found = pastQuedadas.find(q => q.id_quedada === initialSelectedId)
            if (found) handleSelectQuedada(found)
        }
    }, [initialSelectedId, pastQuedadas])

    useEffect(() => {
        if (!selectedQuedada) return

        const channel = supabase
            .channel(`quedada-memories-${selectedQuedada.id_quedada}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'Foto',
                filter: `id_quedada=eq.${selectedQuedada.id_quedada}`
            }, async () => {
                // Fetch all to maintain Top 10 logic correctly
                const { data: phs } = await supabase
                    .from('Foto')
                    .select('*, Usuario(email, nombre)')
                    .eq('id_quedada', selectedQuedada.id_quedada)
                    .order('created_at', { ascending: false })

                const { data: members } = await supabase
                    .from('MiembroGrupo')
                    .select('id_usuario, apodo')
                    .eq('id_grupo', groupId)

                const enhancedPhs = (phs || []).map(photo => {
                    const member = members?.find(m => m.id_usuario === photo.id_usuario)
                    const u = Array.isArray(photo.Usuario) ? photo.Usuario[0] : photo.Usuario
                    return { ...photo, displayName: member?.apodo || u?.nombre || u?.email || 'Anónimo' }
                })

                setAllPhotos(enhancedPhs || [])
                setPhotos((enhancedPhs || []).filter(p => p.es_visible).slice(0, 10))
            })
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'Comentario',
                filter: `id_quedada=eq.${selectedQuedada.id_quedada}`
            }, async () => {
                const { data: coms } = await supabase
                    .from('Comentario')
                    .select('*, Usuario(email, nombre)')
                    .eq('id_quedada', selectedQuedada.id_quedada)
                    .order('created_at', { ascending: true })

                const { data: members } = await supabase
                    .from('MiembroGrupo')
                    .select('id_usuario, apodo')
                    .eq('id_grupo', groupId)

                const enhancedComs = (coms || []).map(c => {
                    const member = members?.find(m => m.id_usuario === c.id_usuario)
                    const u = Array.isArray(c.Usuario) ? c.Usuario[0] : c.Usuario
                    return {
                        ...c,
                        displayName: member?.apodo || u?.nombre || u?.email || 'Anónimo'
                    }
                })
                setComments(enhancedComs)
            })
            .subscribe()

        return () => { supabase.removeChannel(channel) }
    }, [selectedQuedada])

    const fetchPastQuedadas = async () => {
        const now = new Date().toISOString()

        // We want meetings where the end date has passed.
        // Since we can't easily do a complex OR/COALESCE in a simple Supabase query without raw SQL,
        // we'll fetch all group meetings and filter locally, or try to be clever with gt/lt.
        // Actually, let's fetch meetings where fecha_inicio is in the past, 
        // OR better: fetch all and filter to match the "active" logic perfectly.

        const { data } = await supabase
            .from('Quedada')
            .select('*')
            .eq('id_grupo', groupId)
            .order('fecha_inicio', { ascending: false }) // Newest past meetings first

        const filtered = (data || []).filter(q => {
            const endDate = new Date(q.fecha_fin || q.fecha_inicio);
            return endDate < new Date();
        });

        setPastQuedadas(filtered)
        setLoading(false)
    }

    const handleSelectQuedada = async (quedada) => {
        setSelectedQuedada(quedada)
        setManageMode(false)

        // 1. Fetch User Role for this Quedada
        const { data: part } = await supabase
            .from('ParticipacionQuedada')
            .select('rol')
            .eq('id_quedada', quedada.id_quedada)
            .eq('id_usuario', userId)
            .single()
        setUserRole(part?.rol || 'Asistente')

        // 2. Fetch Details in parallel
        const pPhotos = supabase
            .from('Foto')
            .select('*, Usuario(email)')
            .eq('id_quedada', quedada.id_quedada)
            .order('created_at', { ascending: false })

        const pComments = supabase
            .from('Comentario')
            .select('*, Usuario(email)')
            .eq('id_quedada', quedada.id_quedada)
            .order('created_at', { ascending: true })

        const [resPhotos, resComments] = await Promise.all([pPhotos, pComments])

        const { data: members } = await supabase
            .from('MiembroGrupo')
            .select('id_usuario, apodo')
            .eq('id_grupo', groupId)

        const totalPhotos = (resPhotos.data || []).map(photo => {
            const member = members?.find(m => m.id_usuario === photo.id_usuario)
            const u = Array.isArray(photo.Usuario) ? photo.Usuario[0] : photo.Usuario
            return { ...photo, displayName: member?.apodo || u?.nombre || u?.email || 'Anónimo' }
        })
        setAllPhotos(totalPhotos)
        setPhotos(totalPhotos.filter(p => p.es_visible).slice(0, 10))

        const enhanced = (resComments.data || []).map(p => {
            const member = members?.find(m => m.id_usuario === p.id_usuario)
            const u = Array.isArray(p.Usuario) ? p.Usuario[0] : p.Usuario
            return {
                ...p,
                displayName: member?.apodo || u?.nombre || u?.email || 'Anónimo'
            }
        })
        setComments(enhanced)
    }

    const togglePhotoVisibility = async (photo) => {
        const currentlyVisible = allPhotos.filter(p => p.es_visible).length
        if (!photo.es_visible && currentlyVisible >= 10) {
            alert("Ya hay 10 fotos visibles. Desactiva una antes de activar otra.")
            return
        }

        const { error } = await supabase
            .from('Foto')
            .update({ es_visible: !photo.es_visible })
            .eq('id', photo.id)

        if (!error) {
            // Refresh local state
            const updated = allPhotos.map(p => p.id === photo.id ? { ...p, es_visible: !p.es_visible } : p)
            setAllPhotos(updated)
            setPhotos(updated.filter(p => p.es_visible).slice(0, 10))
        }
    }

    const handleAddComment = async (e) => {
        e.preventDefault()
        if (!newComment.trim()) return

        const { error } = await supabase.from('Comentario').insert({
            texto: newComment,
            id_quedada: selectedQuedada.id_quedada,
            id_usuario: userId
        })

        if (!error) {
            setNewComment('')
            // Refresh comments with names
            const { data: coms } = await supabase
                .from('Comentario')
                .select('*, Usuario(email, nombre)')
                .eq('id_quedada', selectedQuedada.id_quedada)
                .order('created_at', { ascending: true })

            const { data: members } = await supabase
                .from('MiembroGrupo')
                .select('id_usuario, apodo')
                .eq('id_grupo', groupId)

            const enhancedComs = (coms || []).map(c => {
                const member = members?.find(m => m.id_usuario === c.id_usuario)
                return {
                    ...c,
                    displayName: member?.apodo || c.Usuario?.nombre || c.Usuario?.email
                }
            })
            setComments(enhancedComs)
        }
    }

    const handleUploadPhoto = async (e) => {
        const file = e.target.files[0]
        if (!file) return

        setUploading(true)
        try {
            const fileExt = file.name.split('.').pop()
            const fileName = `${selectedQuedada.id_quedada}/${userId}/${Date.now()}.${fileExt}`
            const filePath = `quedadas/${fileName}`

            // 1. Upload to Supabase Storage
            const { error: uploadError } = await supabase.storage
                .from('Calendar photos')
                .upload(filePath, file)

            if (uploadError) throw uploadError

            // 2. Get Public URL
            const { data: { publicUrl } } = supabase.storage
                .from('Calendar photos')
                .getPublicUrl(filePath)

            // 3. Insert into Foto table
            const visibleCount = allPhotos.filter(p => p.es_visible).length
            const shouldBeVisible = visibleCount < 10

            const { error: dbError } = await supabase.from('Foto').insert({
                url: publicUrl,
                id_quedada: selectedQuedada.id_quedada,
                id_usuario: userId,
                es_visible: shouldBeVisible
            })

            if (dbError) throw dbError

            // 4. Refresh photos
            const { data } = await supabase
                .from('Foto')
                .select('*, Usuario(email)')
                .eq('id_quedada', selectedQuedada.id_quedada)
                .order('created_at', { ascending: false })

            setAllPhotos(data || [])
            setPhotos((data || []).filter(p => p.es_visible).slice(0, 10))

        } catch (error) {
            console.error('Error uploading photo:', error)
            alert('Error al subir la foto. Asegúrate de haber creado el bucket "Calendar photos" en Supabase Storage.')
        } finally {
            setUploading(false)
        }
    }

    if (loading) return <div>Cargando recuerdos...</div>

    return (
        <div className="flex flex-col md:flex-row gap-6 h-[80vh]">
            {/* Timeline / Calendar List */}
            <div className="w-full md:w-1/4 bg-white p-4 rounded-3xl shadow-lg overflow-y-auto">
                <h3 className="text-xl font-bold mb-4 text-gray-800">📸 Recuerdos</h3>
                <div className="space-y-4">
                    {pastQuedadas.map(q => (
                        <div
                            key={q.id_quedada}
                            onClick={() => handleSelectQuedada(q)}
                            className={`p-4 rounded-xl cursor-pointer border transition-all ${selectedQuedada?.id_quedada === q.id_quedada ? 'border-indigo-500 bg-indigo-50 shadow-md' : 'border-gray-100 hover:bg-gray-50'}`}
                        >
                            <div className="font-bold text-gray-900">{q.nombre}</div>
                            <div className="text-sm text-gray-500">{new Date(q.fecha_inicio).toLocaleDateString()}</div>
                        </div>
                    ))}
                    {pastQuedadas.length === 0 && <p className="text-gray-400">Aún no hay eventos pasados.</p>}
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 bg-white p-6 rounded-3xl shadow-lg flex flex-col md:overflow-hidden">
                {selectedQuedada ? (
                    <div className="flex flex-col h-full">
                        <h2 className="text-2xl font-black mb-1">{selectedQuedada.nombre}</h2>
                        <p className="text-gray-500 mb-6">{selectedQuedada.descripcion}</p>

                        <div className="flex-1 overflow-y-auto pr-2 space-y-8">

                            {/* Photos Section */}
                            <section>
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                        📸 Galería (Top 10)
                                    </h3>
                                    {(userRole === 'Organizador' || userRole === 'Fotógrafo') && (
                                        <button
                                            onClick={() => setManageMode(!manageMode)}
                                            className={`text-xs font-bold px-3 py-1 rounded-full border transition-all ${manageMode ? 'bg-black text-white' : 'text-gray-500 hover:bg-gray-100'}`}
                                        >
                                            {manageMode ? '✅ Salir Gestión' : '⚙️ Gestionar Fotos'}
                                        </button>
                                    )}
                                </div>

                                <div className={`grid grid-cols-2 md:grid-cols-5 gap-2 mb-4 ${manageMode ? 'bg-gray-100 p-4 rounded-2xl' : ''}`}>
                                    {(manageMode ? allPhotos : photos).map(photo => (
                                        <div
                                            key={photo.id}
                                            onClick={() => manageMode && togglePhotoVisibility(photo)}
                                            className={`relative aspect-square rounded-lg overflow-hidden bg-white group shadow-sm transition-all ${manageMode ? 'cursor-pointer hover:scale-95' : ''} ${manageMode && !photo.es_visible ? 'opacity-40 grayscale' : ''}`}
                                        >
                                            <img src={photo.url} alt="Recuerdo" className="w-full h-full object-cover" />
                                            <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {photo.displayName}
                                            </div>
                                            {manageMode && (
                                                <div className={`absolute top-1 right-1 h-4 w-4 rounded-full border border-white ${photo.es_visible ? 'bg-green-500' : 'bg-gray-400'}`} />
                                            )}
                                        </div>
                                    ))}
                                    {manageMode && allPhotos.length === 0 && <p className="col-span-full text-center text-gray-400 py-8">No hay fotos que gestionar.</p>}
                                    {!manageMode && photos.length === 0 && <p className="col-span-full text-center text-gray-400 py-8">Aún no hay fotos visibles.</p>}
                                </div>

                                {/* Add Photo Input */}
                                <div className="mt-4">
                                    <label className="block text-sm font-bold text-gray-700 mb-2">📸 Añadir recuerdo</label>
                                    <div className="flex gap-2">
                                        <label className="flex-1 cursor-pointer bg-gray-50 hover:bg-gray-100 border-2 border-dashed border-gray-300 rounded-xl flex items-center justify-center p-4 transition-all group-hover:border-indigo-400">
                                            <input
                                                type="file"
                                                accept="image/*"
                                                className="hidden"
                                                onChange={handleUploadPhoto}
                                                disabled={uploading}
                                            />
                                            {uploading ? (
                                                <span className="text-sm text-indigo-600 font-bold animate-pulse">Subiendo...</span>
                                            ) : (
                                                <span className="text-sm text-gray-500">Toca para subir foto</span>
                                            )}
                                        </label>
                                    </div>
                                </div>
                            </section>

                            <hr className="border-gray-100" />

                            {/* Comments Section */}
                            <section>
                                <h3 className="font-bold text-gray-800 mb-3">💬 Comentarios</h3>
                                <div className="space-y-3 mb-4">
                                    {comments.map(c => (
                                        <div key={c.id} className="bg-gray-50 p-3 rounded-xl rounded-tl-none border border-gray-100">
                                            <div className="text-xs text-indigo-600 font-bold mb-1">{c.displayName}</div>
                                            <p className="text-sm text-gray-900 font-medium">{c.texto}</p>
                                        </div>
                                    ))}
                                    {comments.length === 0 && <p className="text-sm text-gray-400 italic">Sé el primero en comentar qué tal fue...</p>}
                                </div>

                                {/* Add Comment */}
                                <form onSubmit={handleAddComment} className="flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="Escribe un recuerdo..."
                                        className="flex-1 bg-gray-50 border border-gray-200 rounded-lg text-sm px-3 py-2 text-black font-medium focus:ring-2 focus:ring-indigo-500"
                                        value={newComment}
                                        onChange={e => setNewComment(e.target.value)}
                                    />
                                    <button type="submit" className="text-indigo-600 font-bold px-3 hover:bg-indigo-50 rounded-lg">Enviar</button>
                                </form>
                            </section>
                        </div>
                    </div>
                ) : (
                    <div className="h-full flex items-center justify-center text-gray-400 flex-col">
                        <span className="text-4xl mb-2">👈</span>
                        <p>Selecciona una fecha para ver los recuerdos.</p>
                    </div>
                )}
            </div>
        </div>
    )
}
