import type { ThemeColor } from '@/types'

/** Shape of the JSON the model is asked to return for a balade. */
export interface GeneratedBalade {
  title: string
  theme_color: Partial<ThemeColor>
  estimated_duration_min: number
  distance_km: number
  story_context: string
  prologue: string
  epilogue: string
  route_makes_sense: boolean
  etapes: GeneratedEtape[]
}

export interface GeneratedEnigme {
  type: string
  title: string
  instruction: string
  cipher_display?: string
  hint: string
  answer: string
  answer_explanation: string
}

export interface GeneratedEtape {
  order: number
  location_name: string
  lat: number
  lng: number
  story_text: string
  direction_text: string
  walk_minutes: number
  action_mission: string
  enigme: GeneratedEnigme
  medical_bonus: {
    category?: string
    label?: string
    specialty?: string
    question: string
    hint?: string
    answer: string
  } | null
}
