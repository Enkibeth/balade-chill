'use client'

import { useEffect, useRef, useState } from 'react'
import { WifiOff, RefreshCw } from 'lucide-react'
import { useOffline } from '@/hooks/useOffline'

/** Fixed bottom banner: red while offline, a transient sync notice on
 *  reconnect. Triggers the pending-score sync automatically. */
export function OfflineBanner() {
  const { isOnline, syncPendingScores } = useOffline()
  const [notice, setNotice] = useState<string | null>(null)
  const wasOffline = useRef(false)

  useEffect(() => {
    if (!isOnline) {
      wasOffline.current = true
      return
    }
    if (wasOffline.current) {
      wasOffline.current = false
      void syncPendingScores().then((n) => {
        setNotice(
          n > 0
            ? `De retour en ligne — ${n} session(s) synchronisée(s).`
            : 'De retour en ligne.',
        )
        setTimeout(() => setNotice(null), 4000)
      })
    }
  }, [isOnline, syncPendingScores])

  if (!isOnline) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-center gap-2 bg-rose-800 px-4 py-2 text-center text-xs text-rose-50">
        <WifiOff size={14} />
        Mode hors ligne — tes scores sont sauvegardés localement.
      </div>
    )
  }

  if (notice) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-center gap-2 bg-emerald-800 px-4 py-2 text-center text-xs text-emerald-50">
        <RefreshCw size={14} />
        {notice}
      </div>
    )
  }

  return null
}
