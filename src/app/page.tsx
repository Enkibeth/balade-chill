import { redirect } from 'next/navigation'

// The middleware already routes "/" by auth state; this is a safety net.
export default function RootPage() {
  redirect('/dashboard')
}
