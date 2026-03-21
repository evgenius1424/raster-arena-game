import { createFileRoute, useNavigate } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
    component: LandingPage,
})

function LandingPage() {
    const navigate = useNavigate()

    return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-6">
            <h1 className="text-white text-6xl font-bold tracking-widest uppercase select-none">
                Need For Fun
            </h1>
            <p className="text-gray-500 text-sm tracking-widest uppercase">
                2D Arena Deathmatch
            </p>
            <button
                onClick={() => navigate({ to: '/game' })}
                className="mt-4 px-12 py-4 bg-transparent border-2 border-white text-white text-lg font-bold uppercase tracking-widest hover:bg-white hover:text-black transition-colors duration-200 cursor-pointer"
            >
                Play
            </button>
        </div>
    )
}
