'use client'

import { useEffect, useState } from 'react'

/**
 * Reactively tracks whether the app is in light mode by watching the `.light`
 * class on <html> (toggled by ThemeToggle). Lets client components — chiefly
 * the maps, whose tiles aren't CSS-themable — swap to light variants live.
 */
export function useIsLight(): boolean {
  const [light, setLight] = useState(false)
  useEffect(() => {
    const el = document.documentElement
    const update = () => setLight(el.classList.contains('light'))
    update()
    const observer = new MutationObserver(update)
    observer.observe(el, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])
  return light
}
