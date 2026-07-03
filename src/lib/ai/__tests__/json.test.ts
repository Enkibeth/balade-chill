import { describe, expect, it } from 'vitest'
import { extractJsonObject } from '@/lib/ai/json'

describe('extractJsonObject', () => {
  it('parses a bare JSON object', () => {
    expect(extractJsonObject('{"a": 1}')).toEqual({ a: 1 })
  })

  it('strips markdown fences', () => {
    expect(extractJsonObject('```json\n{"a": 1}\n```')).toEqual({ a: 1 })
  })

  it('ignores prose around the object', () => {
    expect(
      extractJsonObject('Voici la balade :\n{"a": 1}\nBonne promenade !'),
    ).toEqual({ a: 1 })
  })

  it('handles braces inside strings', () => {
    expect(extractJsonObject('{"txt": "un rébus avec { dedans"}')).toEqual({
      txt: 'un rébus avec { dedans',
    })
  })

  it('returns null for empty, invalid or non-JSON text', () => {
    expect(extractJsonObject('')).toBeNull()
    expect(extractJsonObject('pas de JSON ici')).toBeNull()
    expect(extractJsonObject('{"a": tronqué')).toBeNull()
  })
})
