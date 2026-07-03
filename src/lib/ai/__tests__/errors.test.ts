import { describe, expect, it } from 'vitest'
import { describeProviderError } from '@/lib/ai/errors'

function errWith(status: number | undefined, message = 'boom') {
  const e = new Error(message) as Error & { status?: number }
  e.status = status
  return e
}

describe('describeProviderError', () => {
  it('maps auth failures to a Réglages hint, not retryable', () => {
    const info = describeProviderError('anthropic', errWith(401))
    expect(info.retryable).toBe(false)
    expect(info.message).toContain('Réglages')
    expect(info.message).toContain('Anthropic')
  })

  it('maps 404 to a model problem', () => {
    const info = describeProviderError('openai', errWith(404))
    expect(info.retryable).toBe(false)
    expect(info.message).toContain('Modèle introuvable')
  })

  it('treats plain rate limits as retryable', () => {
    expect(describeProviderError('groq', errWith(429)).retryable).toBe(true)
  })

  it('treats exhausted credits as non-retryable even on 429', () => {
    const info = describeProviderError(
      'anthropic',
      errWith(429, 'insufficient credit balance'),
    )
    expect(info.retryable).toBe(false)
    expect(info.message).toContain('Crédits')
  })

  it('treats overload and network failures as retryable', () => {
    expect(describeProviderError('anthropic', errWith(529)).retryable).toBe(
      true,
    )
    expect(
      describeProviderError('google', errWith(undefined, 'fetch failed'))
        .retryable,
    ).toBe(true)
  })
})
