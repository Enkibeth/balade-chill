export type Difficulty = 'facile' | 'moyen' | 'difficile' | 'boss'

export type EnigmeType =
  | 'cipher_reverse'
  | 'cipher_caesar'
  | 'math_code'
  | 'polybe'
  | 'wordplay'
  | 'anagram'
  | 'morse'
  | 'a1z26'
  | 'vigenere'
  | 'charade'
  | 'rebus'
  | 'acrostiche'
  | 'riddle'

export type ThemeColor = {
  primary: string
  secondary: string
  accent: string
  bg: string
  name: string
}

export type BaladeStatus = 'draft' | 'validated' | 'completed' | 'archived'

export type MedicalSpecialty =
  | 'cardiologie'
  | 'neurologie'
  | 'pneumologie'
  | 'gastro'
  | 'urgences'

/**
 * The theme of the per-étape bonus question. "medical" is the historical
 * default (kept for Hugo & Éloïse); the others broaden the app to anyone.
 */
export type BonusCategory =
  | 'medical'
  | 'histoire'
  | 'anecdote_fun'
  | 'science'
  | 'blague'
  | 'custom'

/** A point placed on the map (or geocoded) for the start/end of a balade. */
export interface GeoPoint {
  lat: number
  lng: number
  label?: string
}

export interface User {
  id: string
  email: string
  display_name: string
  partner_id: string | null
}

export interface Balade {
  id: string
  title: string
  city: string
  country: string
  theme_color: ThemeColor
  difficulty: Difficulty
  status: BaladeStatus
  created_by: string
  created_at: string
  estimated_duration_min: number
  distance_km: number
  html_content: string // full rendered HTML (offline-ready)
  etapes: Etape[]
  medical_specs: string[] // e.g. ['cardiologie','neurologie']
  story_context: string // narrative backstory
  prologue: string
  epilogue: string
}

export interface Etape {
  id: string
  balade_id: string
  order: number
  location_name: string
  lat: number
  lng: number
  maps_url: string
  story_text: string
  direction_text: string
  walk_minutes: number
  enigme: Enigme
  action_mission: string
  medical_bonus: MedicalBonus | null
}

export interface Enigme {
  id: string
  type: EnigmeType
  title: string
  instruction: string
  cipher_display: string // encoded string shown to user
  hint: string
  answer: string
  answer_explanation: string
  difficulty: Difficulty
}

/**
 * A bonus question attached to an étape. Historically always medical (hence the
 * `medical_bonus` field name kept for stored balades), now themable: `category`
 * selects the kind of question and `label` is the badge shown to the player.
 * Older rows have neither field — treat a missing `category` as 'medical'.
 */
export interface MedicalBonus {
  id: string
  category?: BonusCategory // absent on legacy rows ⇒ 'medical'
  label?: string // badge text (specialty for medical, theme name otherwise)
  specialty?: MedicalSpecialty // only meaningful when category === 'medical'
  question: string
  hint: string
  answer: string // detailed answer with clinical reasoning
  year_level?: 5 // 5 for D5 medical questions
}

export interface BaladeSession {
  id: string
  balade_id: string
  user_id: string
  started_at: string
  completed_at: string | null
  current_etape: number
  enigme_scores: Record<string, boolean> // enigme_id → solved_without_hint
  medical_scores: Record<string, boolean> // medical_id → correct
  mission_scores: Record<string, boolean> // etape_id → mission done
  total_score: number
  notes: string
}

export interface QuizOption {
  id: string
  label: string
}

export interface QuizQuestion {
  id: string
  label: string
  options: QuizOption[]
}

/** A flat answer pair the backend can drop straight into the LLM prompt. */
export interface QuizAnswer {
  question_label: string
  option_label: string
}

export interface GenerationRequest {
  city: string
  country: string
  difficulty: Difficulty
  duration_target_min: number
  medical_specialties: string[]
  nb_etapes: number
  theme_preference?: string
  special_instructions?: string
  /**
   * Which themes the per-étape bonus questions should draw from. When several
   * are picked the generator mixes them across étapes. Defaults to ['medical'].
   */
  bonus_themes?: BonusCategory[]
  /** Free-text theme used when 'custom' is among `bonus_themes`. */
  bonus_custom_theme?: string
  /** Optional address that must be both the start and the end of a loop. */
  loop_address?: string
  /** Optional map-placed start point (recommended). Forces étape 1. */
  start_point?: GeoPoint
  /** Optional map-placed end point. Forces the last étape (loop if = start). */
  end_point?: GeoPoint
  /** Optional answers to the pre-generation orientation quiz. */
  quiz_answers?: QuizAnswer[]
}

export type AIProvider = 'anthropic' | 'openai' | 'nvidia' | 'groq' | 'google'

/** Which parts of a draft balade the refine pass is allowed to rewrite. */
export type RefineTarget = 'enigmes' | 'coherence' | 'prose'

/**
 * Optional second-pass ("refine") configuration. The primary provider/model
 * (ai_provider/ai_model/ai_api_key) drafts the whole balade with a cheap model;
 * when enabled, a stronger model re-checks only the targeted parts and returns
 * just the corrections — keeping its (expensive) output tiny.
 */
export interface RefineConfig {
  enabled: boolean
  provider: AIProvider
  model: string
  apiKey: string | null
  targets: RefineTarget[]
  difficulties: Difficulty[]
}

/** Per-user override for which model runs the pre-generation orientation quiz. */
export interface QuizModelConfig {
  enabled: boolean
  provider: AIProvider
  model: string
  apiKey: string | null
}

export interface GenerationPipeline {
  refine: RefineConfig
  /** Optional override. If absent, the quiz uses the draft (ai_*) model. */
  quiz?: QuizModelConfig
  /**
   * Draft API keys remembered per provider. Lets the settings UI keep a key
   * you already entered (e.g. NVIDIA) when you switch the draft provider to
   * another one, instead of wiping the field. The active provider's key is
   * still mirrored into `ai_api_key` for the server to read.
   */
  draft_keys?: Partial<Record<AIProvider, string>>
}

export interface UserSettings {
  user_id: string
  ai_provider: AIProvider
  ai_model: string
  ai_api_key: string | null
  mapbox_token: string | null
  generation_pipeline: GenerationPipeline | null
  updated_at: string
}
