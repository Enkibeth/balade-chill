import { Nav } from '@/components/ui/Nav'
import { OfflineBanner } from '@/components/offline/OfflineBanner'

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      <OfflineBanner />
    </div>
  )
}
