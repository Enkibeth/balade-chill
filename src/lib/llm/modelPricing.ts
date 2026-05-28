import type { AIProvider } from '@/types'

export const MODEL_PRICING = {
  'anthropic:claude-sonnet': { input: 3, output: 15 },
  'anthropic:claude-haiku': { input: 1, output: 5 },
  'google:gemini-2.5-flash': { input: 0.3, output: 2.5 },
  'google:gemini-2.5-flash-lite': { input: 0.1, output: 0.4 },
  'groq:gpt-oss-120b': { input: 0.15, output: 0.6 },
} as const

function inferPricingKey(provider: AIProvider, model: string): keyof typeof MODEL_PRICING | null {
  const m = model.toLowerCase()
  if (provider === 'anthropic' && m.includes('haiku')) return 'anthropic:claude-haiku'
  if (provider === 'anthropic') return 'anthropic:claude-sonnet'
  if (provider === 'groq' && m.includes('120b')) return 'groq:gpt-oss-120b'
  if (provider === 'openai' && m.includes('flash-lite')) return 'google:gemini-2.5-flash-lite'
  if (provider === 'openai' && m.includes('flash')) return 'google:gemini-2.5-flash'
  return null
}

export function estimateLLMCost(input: { provider: AIProvider; model: string; inputTokens: number; outputTokens: number }): number {
  const key = inferPricingKey(input.provider, input.model)
  if (!key) return 0
  const p = MODEL_PRICING[key]
  return (input.inputTokens / 1_000_000) * p.input + (input.outputTokens / 1_000_000) * p.output
}
