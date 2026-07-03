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
  /**
   * JSON schema of the expected output. On Anthropic it is enforced through
   * structured outputs (output_config.format); OpenAI-compatible providers get
   * generic JSON mode (response_format json_object). If a model rejects the
   * constrained mode (400), the call degrades to the plain prompt contract.
   */
  jsonSchema?: Record<string, unknown>
}

export interface LLMGenerationResult {
  text: string
  usage: { inputTokens: number; outputTokens: number; totalTokens: number }
  estimatedCostUsd: number
  latencyMs: number
  /** True when the provider cut the output at the max-token budget. */
  truncated: boolean
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
    const requestMessage = (withSchema: boolean) =>
      anthropic.messages
        .stream({
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
          ...(withSchema && ctx.jsonSchema
            ? {
                output_config: {
                  format: { type: 'json_schema' as const, schema: ctx.jsonSchema },
                },
              }
            : {}),
        })
        .finalMessage()
    let message: Anthropic.Message
    try {
      message = await requestMessage(Boolean(ctx.jsonSchema))
    } catch (err) {
      // Models without structured-output support reject output_config with a
      // 400 — degrade to the prompt-enforced JSON contract instead of failing.
      if (
        ctx.jsonSchema &&
        err instanceof Anthropic.APIError &&
        err.status === 400
      ) {
        message = await requestMessage(false)
      } else {
        throw err
      }
    }
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
    return {
      text,
      usage,
      estimatedCostUsd,
      latencyMs: Date.now() - startedAt,
      truncated: message.stop_reason === 'max_tokens',
    }
  }

  const baseURL = PROVIDERS[ctx.provider].baseURL
  const openai = new OpenAI({
    apiKey: ctx.apiKey,
    ...(baseURL ? { baseURL } : {}),
  })
  const requestCompletion = (withJsonMode: boolean) =>
    openai.chat.completions.create({
      model: ctx.model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      ...(withJsonMode
        ? { response_format: { type: 'json_object' as const } }
        : {}),
    })
  // OpenAI, Groq and the Gemini OpenAI endpoint all support JSON mode; NVIDIA
  // NIM support varies per model, so it keeps the plain prompt contract.
  const jsonMode = ctx.provider !== 'nvidia'
  let response: OpenAI.Chat.Completions.ChatCompletion
  try {
    response = await requestCompletion(jsonMode)
  } catch (err) {
    if (jsonMode && err instanceof OpenAI.APIError && err.status === 400) {
      response = await requestCompletion(false)
    } else {
      throw err
    }
  }
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
    truncated: response.choices[0]?.finish_reason === 'length',
  }
}
