'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@/types'

interface UseUserResult {
  user: User | null
  loading: boolean
}

/** Current authenticated user (joined with the public.users profile row). */
export function useUser(): UseUserResult {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    let active = true

    async function load() {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser()

      if (!authUser) {
        if (active) {
          setUser(null)
          setLoading(false)
        }
        return
      }

      const { data } = await supabase
        .from('users')
        .select('id,email,display_name,partner_id')
        .eq('id', authUser.id)
        .maybeSingle()

      if (active) {
        setUser((data as User) ?? null)
        setLoading(false)
      }
    }

    load()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void load()
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  return { user, loading }
}
