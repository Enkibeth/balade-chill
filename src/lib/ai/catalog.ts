import type { AIProvider } from '@/types'

export interface ProviderInfo {
  label: string
  baseURL?: string
  models: { value: string; label: string }[]
}

/**
 * Client-safe provider + model catalog. Imported by the settings UI.
 * The actual SDK calls live in `providers.ts` (server-only).
 */
export const PROVIDERS: Record<AIProvider, ProviderInfo> = {
  anthropic: {
    label: 'Anthropic',
    models: [
      { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (recommandé)' },
      { value: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
      { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
    ],
  },
  openai: {
    label: 'OpenAI',
    models: [
      { value: 'gpt-4o', label: 'GPT-4o' },
      { value: 'gpt-4o-mini', label: 'GPT-4o mini' },
      { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    ],
  },
  nvidia: {
    label: 'NVIDIA NIM (gratuit)',
    baseURL: 'https://integrate.api.nvidia.com/v1',
    models: [
      { value: 'meta/llama-3.3-70b-instruct', label: 'Llama 3.3 70B' },
      { value: 'meta/llama-3.1-405b-instruct', label: 'Llama 3.1 405B' },
      {
        value: 'nvidia/llama-3.1-nemotron-70b-instruct',
        label: 'Nemotron 70B',
      },
    ],
  },
  groq: {
    label: 'Groq (rapide)',
    baseURL: 'https://api.groq.com/openai/v1',
    models: [
      { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B' },
      { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B (rapide)' },
    ],
  },
}
