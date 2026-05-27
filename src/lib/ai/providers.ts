import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { PROVIDERS } from './catalog'
import type { AIProvider } from '@/types'

export interface GenerationContext {
  provider: AIProvider
  apiKey: string
  model: string
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
): Promise<string> {
  if (ctx.provider === 'anthropic') {
    const anthropic = new Anthropic({ apiKey: ctx.apiKey })
    const stream = anthropic.messages.stream({
      model: ctx.model,
      max_tokens: 16000,
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
    return message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
  }

  const baseURL = PROVIDERS[ctx.provider].baseURL
  const openai = new OpenAI({
    apiKey: ctx.apiKey,
    ...(baseURL ? { baseURL } : {}),
  })
  const response = await openai.chat.completions.create({
    model: ctx.model,
    max_tokens: 8000,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  })
  return response.choices[0]?.message?.content ?? ''
}
