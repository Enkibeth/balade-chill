import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserSettings } from '@/lib/supabase/queries'
import { generateBaladeText } from '@/lib/ai/providers'
import {
  QUIZ_SYSTEM_PROMPT,
  buildQuizPrompt,
  parseQuiz,
  type QuizPromptInput,
} from '@/lib/llm/quiz'
import type { AIProvider, Difficulty } from '@/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const DIFFICULTIES: Difficulty[] = ['facile', 'moyen', 'difficile', 'boss']

function asString(v: unknown, fb = ''): string {
  return typeof v === 'string' ? v : fb
}
function asNumber(v: unknown, fb = 0): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fb
}

function parseBody(body: unknown): QuizPromptInput | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  const city = asString(b.city).trim()
  const country = asString(b.country).trim()
  const difficulty = b.difficulty as Difficulty
  if (!city || !country || !DIFFICULTIES.includes(difficulty)) return null
  return {
    city,
    country,
    difficulty,
    duration_target_min: Math.max(30, Math.round(asNumber(b.duration_target_min, 120))),
    nb_etapes: Math.min(6, Math.max(3, Math.round(asNumber(b.nb_etapes, 5)))),
    theme_preference: asString(b.theme_preference) || undefined,
  }
}

export async function POST(request: Request) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 })
  }
  const input = parseBody(body)
  if (!input) {
    return NextResponse.json({ error: 'Paramètres invalides' }, { status: 400 })
  }

  const settings = await getUserSettings(supabase, user.id)
  const quizCfg = settings?.generation_pipeline?.quiz

  // Honor an explicit "disabled" flag from settings.
  if (quizCfg && quizCfg.enabled === false) {
    return NextResponse.json({ disabled: true })
  }

  // Quiz model resolution: dedicated quiz config wins, otherwise fall back to
  // the draft model (ai_*). The quiz API key may be omitted when the quiz uses
  // the same provider as the draft — we reuse the draft key in that case.
  const useQuizCfg = Boolean(quizCfg && quizCfg.model)
  const provider: AIProvider = useQuizCfg
    ? quizCfg!.provider
    : (settings?.ai_provider ?? 'anthropic')
  const model = useQuizCfg
    ? quizCfg!.model
    : settings?.ai_model && settings.ai_model.length > 0
      ? settings.ai_model
      : 'claude-sonnet-4-6'
  let apiKey: string | undefined
  if (useQuizCfg) {
    if (quizCfg!.apiKey) {
      apiKey = quizCfg!.apiKey
    } else if (quizCfg!.provider === settings?.ai_provider) {
      apiKey = settings?.ai_api_key ?? undefined
    }
  } else {
    apiKey = settings?.ai_api_key?.length ? settings.ai_api_key : undefined
  }
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Aucune clé API personnelle configurée.' },
      { status: 400 },
    )
  }

  try {
    const output = await generateBaladeText(
      {
        provider,
        apiKey,
        model,
        difficulty: input.difficulty,
        generationId: crypto.randomUUID(),
        maxTokensOverride: 1200,
      },
      QUIZ_SYSTEM_PROMPT,
      buildQuizPrompt(input),
    )
    const quiz = parseQuiz(output.text)
    if (!quiz) {
      return NextResponse.json(
        { error: 'Quiz illisible. Tu peux passer cette étape.' },
        { status: 502 },
      )
    }
    console.info('[LLM_GENERATION]', {
      stage: 'quiz',
      provider,
      model,
      input_tokens: output.usage.inputTokens,
      output_tokens: output.usage.outputTokens,
      estimated_cost_usd: output.estimatedCostUsd,
      latency_ms: output.latencyMs,
      questions: quiz.questions.length,
      city: input.city,
    })
    return NextResponse.json(quiz)
  } catch (err) {
    console.error('Quiz generation failed:', err)
    return NextResponse.json(
      { error: 'Impossible de générer le quiz.' },
      { status: 502 },
    )
  }
}
