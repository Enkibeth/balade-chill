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
      { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 · 15 $/M (recommandé)' },
      { value: 'claude-opus-4-7', label: 'Claude Opus 4.7 · 75 $/M' },
      { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 · 5 $/M' },
    ],
  },
  google: {
    label: 'Google Gemini (économique)',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    models: [
      { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash · 2,5 $/M' },
      { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite · 0,4 $/M' },
    ],
  },
  openai: {
    label: 'OpenAI',
    models: [
      { value: 'gpt-4o', label: 'GPT-4o · 10 $/M' },
      { value: 'gpt-4o-mini', label: 'GPT-4o mini · 0,6 $/M' },
      { value: 'gpt-4-turbo', label: 'GPT-4 Turbo · 30 $/M' },
    ],
  },
  nvidia: {
    label: 'NVIDIA NIM (gratuit)',
    baseURL: 'https://integrate.api.nvidia.com/v1',
    models: [
      { value: 'meta/llama-3.3-70b-instruct', label: 'Llama 3.3 70B · gratuit' },
      { value: 'meta/llama-3.1-405b-instruct', label: 'Llama 3.1 405B · gratuit' },
      {
        value: 'nvidia/llama-3.1-nemotron-70b-instruct',
        label: 'Nemotron 70B · gratuit',
      },
    ],
  },
  groq: {
    label: 'Groq (rapide, économique)',
    baseURL: 'https://api.groq.com/openai/v1',
    models: [
      { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B · 0,79 $/M' },
      { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B · 0,08 $/M (rapide)' },
    ],
  },
}
