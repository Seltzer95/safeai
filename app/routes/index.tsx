import { createFileRoute } from '@tanstack/react-router'
import { EmbeddingDemo } from '~/components/EmbeddingDemo'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-4xl font-bold tracking-tight">SafeAI</h1>
      <EmbeddingDemo />
    </main>
  )
}
