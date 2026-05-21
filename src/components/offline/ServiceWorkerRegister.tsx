'use client'

import { useEffect } from 'react'

/** Registers the offline service worker once, on the client. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Registration failures are non-fatal — the app still works online.
      })
    }
  }, [])
  return null
}
