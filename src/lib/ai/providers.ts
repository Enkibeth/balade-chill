import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { PROVIDERS } from './catalog'
import type { AIProvider } from '@/types'
import { estimateLLMCost } from '@/lib/ai/modelPricing'
import { getModelOutputBudget } from '@/lib/ai/modelLimits'

export interface GenerationContext {
  provider: AIProvider
  apiKey: string
  model: string
  difficulty: 'facile' | 'moyen' | 'difficile' | 'boss'
  generationId: string
  maxTokensOverride?: number
}

export interface LLMGenerationResult {
  text: string
  usage: { inputTokens: number; outputTokens: number; totalTokens: number }
  estimatedCostUsd: number
  latencyMs: number
}

/**
 * Generates the raw model output (expected JSON text) using the user's
 * chosen provider. OpenAI / NVIDIA NIM / Groq all share the OpenAI SDK
 * with different baseURLs.
 */
export async function generateBaladeText(
  ctx: GenerationContext,
  system: string,
  user: string,
): Promise<LLMGenerationResult> {
  const startedAt = Date.now()
  const maxTokens =
    ctx.maxTokensOverride ??
    getModelOutputBudget({
      model: ctx.model,
      difficulty: ctx.difficulty,
      generationMode: ctx.difficulty === 'boss' ? 'segmented' : 'full',
    })
  if (ctx.provider === 'anthropic') {
    const anthropic = new Anthropic({ apiKey: ctx.apiKey })
    const stream = anthropic.messages.stream({
      model: ctx.model,
      max_tokens: maxTokens,
      system: [
        {
          type: 'text',
          text: system,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: user }],
    })
    const message = await stream.finalMessage()
    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
    const usage = {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      totalTokens: message.usage.input_tokens + message.usage.output_tokens,
    }
    const estimatedCostUsd = estimateLLMCost({
      provider: ctx.provider,
      model: ctx.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    })
    return { text, usage, estimatedCostUsd, latencyMs: Date.now() - startedAt }
  }

  const baseURL = PROVIDERS[ctx.provider].baseURL
  const openai = new OpenAI({
    apiKey: ctx.apiKey,
    ...(baseURL ? { baseURL } : {}),
  })
  const response = await openai.chat.completions.create({
    model: ctx.model,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  })
  const usage = {
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
    totalTokens: response.usage?.total_tokens ?? 0,
  }
  const estimatedCostUsd = estimateLLMCost({
    provider: ctx.provider,
    model: ctx.model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
  })
  return {
    text: response.choices[0]?.message?.content ?? '',
    usage,
    estimatedCostUsd,
    latencyMs: Date.now() - startedAt,
  }
}
