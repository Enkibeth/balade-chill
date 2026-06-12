export const metadata = {
  title: 'Été 2026 · Léman',
}

export default function AutrePage() {
  return (
    <div className="-mx-4 -my-6">
      <iframe
        src="/leman.html"
        className="w-full border-0"
        style={{ height: 'calc(100vh - 56px)', display: 'block' }}
        title="Été 2026 · Léman — Hugo & Éloïse"
      />
    </div>
  )
}
