export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-mono text-3xl tracking-[0.3em] text-amber-200">
            BALADES
          </h1>
          <p className="mt-2 text-sm text-amber-100/50">
            Aventures romantiques à énigmes
          </p>
        </div>
        {children}
      </div>
    </main>
  )
}
