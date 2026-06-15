'use client'

import { useEffect, useState } from 'react'
import { Sun, Moon } from 'lucide-react'

/**
 * Toggles the app between the default dark "sépia" theme and a light parchment
 * theme. The choice is persisted in localStorage and applied as `.light` on
 * <html>; an inline script in the root layout applies it before paint to avoid
 * a flash of the wrong theme.
 */
export function ThemeToggle() {
  const [light, setLight] = useState(false)

  useEffect(() => {
    setLight(document.documentElement.classList.contains('light'))
  }, [])

  function toggle() {
    const next = !light
    setLight(next)
    document.documentElement.classList.toggle('light', next)
    try {
      localStorage.setItem('theme', next ? 'light' : 'dark')
    } catch {
      /* storage unavailable — theme just won't persist */
    }
  }

  return (
    <button
      onClick={toggle}
      aria-label={light ? 'Passer en mode sombre' : 'Passer en mode clair'}
      title={light ? 'Mode sombre' : 'Mode clair'}
      className="ml-1 rounded-lg px-2.5 py-1.5 text-amber-100/55 transition hover:text-amber-100"
    >
      {light ? <Moon size={15} /> : <Sun size={15} />}
    </button>
  )
}
