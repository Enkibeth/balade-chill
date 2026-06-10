import { Nav } from '@/components/ui/Nav'
import { OfflineBanner } from '@/components/offline/OfflineBanner'
import { GenerationProvider } from '@/components/generation/GenerationProvider'
import { GenerationIndicator } from '@/components/generation/GenerationIndicator'

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <GenerationProvider>
      <div className="min-h-screen">
        <Nav />
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
        <OfflineBanner />
        <GenerationIndicator />
      </div>
    </GenerationProvider>
  )
}
