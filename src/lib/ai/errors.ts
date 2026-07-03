import { PROVIDERS } from './catalog'
import type { AIProvider } from '@/types'

/**
 * Maps a raw provider/SDK error to a French, user-facing, actionable message.
 * The Anthropic and OpenAI SDKs (also used for NIM/Groq/Gemini via baseURL)
 * both expose the HTTP status on the thrown error.
 */
export interface ProviderErrorInfo {
  /** What to show the user — says what to do next, not just what broke. */
  message: string
  /** Transient (rate limit, overload, network): worth one automatic retry. */
  retryable: boolean
}

function statusOf(err: unknown): number | undefined {
  if (err && typeof err === 'object') {
    const e = err as { status?: unknown; statusCode?: unknown }
    if (typeof e.status === 'number') return e.status
    if (typeof e.statusCode === 'number') return e.statusCode
  }
  return undefined
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err ?? '')
}

export function describeProviderError(
  provider: AIProvider,
  err: unknown,
): ProviderErrorInfo {
  const label = PROVIDERS[provider]?.label ?? provider
  const status = statusOf(err)
  const raw = messageOf(err).toLowerCase()
  const quotaHit =
    raw.includes('quota') ||
    raw.includes('billing') ||
    raw.includes('credit balance') ||
    raw.includes('insufficient credit')

  if (status === 401 || status === 403) {
    return {
      message: `Clé API refusée par ${label}. Vérifie ta clé dans les Réglages.`,
      retryable: false,
    }
  }
  if (status === 404) {
    return {
      message: `Modèle introuvable chez ${label}. Choisis un autre modèle dans les Réglages.`,
      retryable: false,
    }
  }
  if (quotaHit) {
    return {
      message: `Crédits épuisés chez ${label}. Recharge ton compte ou change de fournisseur dans les Réglages.`,
      retryable: false,
    }
  }
  if (status === 429) {
    return {
      message: `Limite de requêtes atteinte chez ${label}. Patiente une minute puis réessaie.`,
      retryable: true,
    }
  }
  if ((status !== undefined && status >= 500) || raw.includes('overloaded')) {
    return {
      message: `${label} est temporairement surchargé. Réessaie dans quelques instants.`,
      retryable: true,
    }
  }
  if (
    raw.includes('fetch failed') ||
    raw.includes('econn') ||
    raw.includes('network') ||
    raw.includes('timed out') ||
    raw.includes('timeout') ||
    raw.includes('abort')
  ) {
    return {
      message: `Connexion à ${label} impossible. Réessaie dans un instant.`,
      retryable: true,
    }
  }
  return {
    message: `La génération a échoué chez ${label}. Réessaie ; si ça persiste, vérifie le modèle et la clé API dans les Réglages.`,
    retryable: true,
  }
}
