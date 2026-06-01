import type { AIProvider } from '@/types'

/** USD per 1M tokens (input / output). Approximate public list prices. */
export const MODEL_PRICING = {
  'anthropic:claude-opus': { input: 15, output: 75 },
  'anthropic:claude-sonnet': { input: 3, output: 15 },
  'anthropic:claude-haiku': { input: 1, output: 5 },
  'openai:gpt-4o': { input: 2.5, output: 10 },
  'openai:gpt-4o-mini': { input: 0.15, output: 0.6 },
  'openai:gpt-4.1': { input: 2, output: 8 },
  'openai:gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'openai:gpt-4.1-nano': { input: 0.1, output: 0.4 },
  'openai:o4-mini': { input: 1.1, output: 4.4 },
  'openai:gpt-4-turbo': { input: 10, output: 30 },
  'groq:llama-3.3-70b': { input: 0.59, output: 0.79 },
  'groq:llama-3.1-8b': { input: 0.05, output: 0.08 },
  'google:gemini-2.5-flash': { input: 0.3, output: 2.5 },
  'google:gemini-2.5-flash-lite': { input: 0.1, output: 0.4 },
  'nvidia:free': { input: 0, output: 0 },
} as const

function inferPricingKey(
  provider: AIProvider,
  model: string,
): keyof typeof MODEL_PRICING | null {
  const m = model.toLowerCase()
  if (provider === 'anthropic') {
    if (m.includes('opus')) return 'anthropic:claude-opus'
    if (m.includes('haiku')) return 'anthropic:claude-haiku'
    return 'anthropic:claude-sonnet'
  }
  if (provider === 'openai') {
    if (m.includes('nano')) return 'openai:gpt-4.1-nano'
    if (m.includes('o4-mini') || m.includes('o4 mini')) return 'openai:o4-mini'
    if (m.includes('4.1-mini') || m.includes('4.1 mini')) return 'openai:gpt-4.1-mini'
    if (m.includes('4.1')) return 'openai:gpt-4.1'
    if (m.includes('mini')) return 'openai:gpt-4o-mini'
    if (m.includes('turbo')) return 'openai:gpt-4-turbo'
    return 'openai:gpt-4o'
  }
  if (provider === 'groq') {
    if (m.includes('8b')) return 'groq:llama-3.1-8b'
    return 'groq:llama-3.3-70b'
  }
  if (provider === 'google') {
    if (m.includes('lite')) return 'google:gemini-2.5-flash-lite'
    return 'google:gemini-2.5-flash'
  }
  if (provider === 'nvidia') return 'nvidia:free'
  return null
}

export function estimateLLMCost(input: {
  provider: AIProvider
  model: string
  inputTokens: number
  outputTokens: number
}): number {
  const key = inferPricingKey(input.provider, input.model)
  if (!key) return 0
  const p = MODEL_PRICING[key]
  return (
    (input.inputTokens / 1_000_000) * p.input +
    (input.outputTokens / 1_000_000) * p.output
  )
}
