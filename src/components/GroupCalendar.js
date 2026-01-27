'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function GroupCalendar({ groupId, userId }) {
    const [pastQuedadas, setPastQuedadas] = useState([])
    const [selectedQuedada, setSelectedQuedada] = useState(null)
    const [photos, setPhotos] = useState([])
    const [comments, setComments] = useState([])
    const [newComment, setNewComment] = useState('')
    const [newPhotoUrl, setNewPhotoUrl] = useState('')
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchPastQuedadas()
    }, [groupId])

    const fetchPastQuedadas = async () => {
        const now = new Date().toISOString()
        const { data } = await supabase
            .from('Quedada')
            .select('*')
            .eq('id_grupo', groupId)
            .lt('fecha_inicio', now)
            .order('fecha_inicio', { ascending: true }) // Oldest first

        setPastQuedadas(data || [])
        setLoading(false)
    }

    const handleSelectQuedada = async (quedada) => {
        setSelectedQuedada(quedada)
        // Fetch Details in parallel
        const pPhotos = supabase
            .from('Foto')
            .select('*, Usuario(email)')
            .eq('id_quedada', quedada.id_quedada)
            .limit(10)
            .order('created_at', { ascending: false })

        const pComments = supabase
            .from('Comentario')
            .select('*, Usuario(email)')
            .eq('id_quedada', quedada.id_quedada)
            .order('created_at', { ascending: true })

        const [resPhotos, resComments] = await Promise.all([pPhotos, pComments])

        setPhotos(resPhotos.data || [])
        setComments(resComments.data || [])
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
            // Refresh comments
            const { data } = await supabase
                .from('Comentario')
                .select('*, Usuario(email)')
                .eq('id_quedada', selectedQuedada.id_quedada)
                .order('created_at', { ascending: true })
            setComments(data || [])
        }
    }

    const handleAddPhoto = async (e) => {
        e.preventDefault()
        if (!newPhotoUrl.trim()) return

        const { error } = await supabase.from('Foto').insert({
            url: newPhotoUrl,
            id_quedada: selectedQuedada.id_quedada,
            id_usuario: userId
        })

        if (!error) {
            setNewPhotoUrl('')
            // Refresh photos
            const { data } = await supabase
                .from('Foto')
                .select('*, Usuario(email)')
                .eq('id_quedada', selectedQuedada.id_quedada)
                .limit(10)
                .order('created_at', { ascending: false })
            setPhotos(data || [])
        }
    }

    if (loading) return <div>Cargando recuerdos...</div>

    return (
        <div className="flex flex-col md:flex-row gap-6 h-[80vh]">
            {/* Timeline / Calendar List */}
            <div className="w-full md:w-1/3 bg-white p-4 rounded-3xl shadow-lg overflow-y-auto">
                <h3 className="text-xl font-bold mb-4 text-gray-800">📅 Cronología</h3>
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
                                <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                                    📸 Galería (Top 10)
                                </h3>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                                    {photos.map(photo => (
                                        <div key={photo.id} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 group">
                                            <img src={photo.url} alt="Recuerdo" className="w-full h-full object-cover" />
                                            <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {photo.Usuario?.email}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Add Photo Input */}
                                <form onSubmit={handleAddPhoto} className="flex gap-2">
                                    <input
                                        type="url"
                                        placeholder="Pegar URL de imagen..."
                                        className="flex-1 bg-gray-50 border-none rounded-lg text-sm px-3 py-2"
                                        value={newPhotoUrl}
                                        onChange={e => setNewPhotoUrl(e.target.value)}
                                    />
                                    <button type="submit" className="bg-black text-white px-4 py-2 rounded-lg text-xs font-bold">Subir</button>
                                </form>
                            </section>

                            <hr className="border-gray-100" />

                            {/* Comments Section */}
                            <section>
                                <h3 className="font-bold text-gray-800 mb-3">💬 Comentarios</h3>
                                <div className="space-y-3 mb-4">
                                    {comments.map(c => (
                                        <div key={c.id} className="bg-gray-50 p-3 rounded-xl rounded-tl-none">
                                            <div className="text-xs text-indigo-600 font-bold mb-1">{c.Usuario?.email}</div>
                                            <p className="text-sm text-gray-700">{c.texto}</p>
                                        </div>
                                    ))}
                                    {comments.length === 0 && <p className="text-sm text-gray-400 italic">Sé el primero en comentar qué tal fue...</p>}
                                </div>

                                {/* Add Comment */}
                                <form onSubmit={handleAddComment} className="flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="Escribe un recuerdo..."
                                        className="flex-1 bg-gray-50 border-none rounded-lg text-sm px-3 py-2"
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
