
import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gradient-to-br from-indigo-500 to-purple-600 dark:from-slate-900 dark:to-indigo-950 text-white transition-colors duration-500">
      <div className="text-center z-10 relative">
        <h1 className="text-6xl font-bold mb-4 drop-shadow-lg">MeetApp</h1>
        <p className="text-2xl mb-8 opacity-90">Organiza tus quedadas, gestiona tu grupo y guarda recuerdos.</p>

        <div className="flex gap-4 justify-center">
          <Link href="/auth" className="px-8 py-3 bg-white dark:bg-indigo-500 text-indigo-600 dark:text-white rounded-full font-bold shadow-lg hover:bg-gray-100 dark:hover:bg-indigo-400 transition-all transform hover:scale-105">
            Entrar
          </Link>
          <button className="px-8 py-3 bg-transparent border-2 border-white text-white rounded-full font-bold shadow-lg hover:bg-white/10 transition-all">
            Más info
          </button>
        </div>
      </div>

      {/* Decorative Circles */}
      <div className="absolute top-20 left-20 w-72 h-72 bg-purple-400 dark:bg-purple-900 rounded-full mix-blend-multiply dark:mix-blend-overlay filter blur-xl opacity-70 animate-blob"></div>
      <div className="absolute top-20 right-20 w-72 h-72 bg-yellow-400 dark:bg-indigo-900 rounded-full mix-blend-multiply dark:mix-blend-overlay filter blur-xl opacity-70 animate-blob animation-delay-2000"></div>
      <div className="absolute -bottom-8 left-20 w-72 h-72 bg-pink-400 dark:bg-slate-800 rounded-full mix-blend-multiply dark:mix-blend-overlay filter blur-xl opacity-70 animate-blob animation-delay-4000"></div>
    </main>
  )
}
