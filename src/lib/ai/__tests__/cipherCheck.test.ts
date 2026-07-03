import { describe, expect, it } from 'vitest'
import { validateAndFixEnigme } from '@/lib/ai/cipherCheck'
import type { GeneratedEnigme } from '@/lib/ai/generated'

const base: Omit<GeneratedEnigme, 'type'> = {
  title: 'T',
  instruction: '',
  cipher_display: '',
  hint: '',
  answer: '',
  answer_explanation: '',
}

describe('polybe', () => {
  it('accepts a display valid per the rendered grid', () => {
    const r = validateAndFixEnigme({
      ...base,
      type: 'polybe',
      cipher_display: '22 11 43 15',
      answer: 'GARE',
    })
    expect(r.fixed).toBe(false)
  })

  it('re-encodes a broken display', () => {
    const r = validateAndFixEnigme({
      ...base,
      type: 'polybe',
      cipher_display: '11 11 11',
      answer: 'GARE',
    })
    expect(r.fixed).toBe(true)
    expect(r.enigme.cipher_display).toBe('22 11 43 15')
  })

  it('maps Z onto the shared Y/Z cell and round-trips', () => {
    const fixed = validateAndFixEnigme({
      ...base,
      type: 'polybe',
      cipher_display: '',
      answer: 'ZOE',
    })
    expect(fixed.enigme.cipher_display).toBe('55 35 15')
    const roundTrip = validateAndFixEnigme({ ...fixed.enigme, type: 'polybe' })
    expect(roundTrip.fixed).toBe(false)
  })

  it('keeps all letters of accented answers', () => {
    const r = validateAndFixEnigme({
      ...base,
      type: 'polybe',
      cipher_display: '',
      answer: 'ÉGLISE',
    })
    expect(r.enigme.cipher_display?.match(/\d\d/g)).toHaveLength(6)
  })
})

describe('vigenere', () => {
  it('accepts a display that decodes with the announced keyword', () => {
    const r = validateAndFixEnigme({
      ...base,
      type: 'vigenere',
      instruction: 'Chiffre de Vigenère, mot-clé « AMOUR ».',
      cipher_display: 'PABN',
      answer: 'PONT',
    })
    expect(r.fixed).toBe(false)
  })

  it('re-encodes with the announced keyword when the display is wrong', () => {
    const r = validateAndFixEnigme({
      ...base,
      type: 'vigenere',
      instruction: 'Mot-clé : AMOUR.',
      cipher_display: 'XXXX',
      answer: 'PONT',
    })
    expect(r.fixed).toBe(true)
    expect(r.enigme.cipher_display).toBe('PABN')
    expect(r.enigme.instruction).toBe('Mot-clé : AMOUR.')
  })

  it('injects a keyword into the instruction when none is announced', () => {
    const r = validateAndFixEnigme({
      ...base,
      type: 'vigenere',
      instruction: 'Décode ce message.',
      cipher_display: 'PABN',
      answer: 'PONT',
    })
    expect(r.fixed).toBe(true)
    expect(r.enigme.instruction).toMatch(/mot-clé\s*:\s*amour/i)
    const roundTrip = validateAndFixEnigme({ ...r.enigme, type: 'vigenere' })
    expect(roundTrip.fixed).toBe(false)
  })
})

describe('cipher_caesar', () => {
  it('accepts a display consistent with the announced shift', () => {
    const r = validateAndFixEnigme({
      ...base,
      type: 'cipher_caesar',
      instruction: 'Décale chaque lettre de 3 rangs vers l’arrière.',
      cipher_display: 'WRXU', // TOUR +3
      answer: 'TOUR',
    })
    expect(r.fixed).toBe(false)
  })

  it('re-encodes with the announced shift when the display uses another one', () => {
    const r = validateAndFixEnigme({
      ...base,
      type: 'cipher_caesar',
      instruction: 'Décale chaque lettre de 3 rangs.',
      cipher_display: 'AVBY', // TOUR +7 — unsolvable as stated
      answer: 'TOUR',
    })
    expect(r.fixed).toBe(true)
    expect(r.enigme.cipher_display).toBe('WRXU')
  })

  it('accepts any working shift when none is announced', () => {
    const r = validateAndFixEnigme({
      ...base,
      type: 'cipher_caesar',
      instruction: 'Chiffre de César.',
      cipher_display: 'AVBY',
      answer: 'TOUR',
    })
    expect(r.fixed).toBe(false)
  })

  it('re-encodes garbage with the default shift', () => {
    const r = validateAndFixEnigme({
      ...base,
      type: 'cipher_caesar',
      instruction: 'Chiffre de César.',
      cipher_display: 'ZZZZZZZ',
      answer: 'TOUR',
    })
    expect(r.fixed).toBe(true)
    expect(r.enigme.cipher_display).toBe('WRXU')
  })
})

describe('anagram', () => {
  it('rejects a display identical to the answer and really scrambles', () => {
    const r = validateAndFixEnigme({
      ...base,
      type: 'anagram',
      cipher_display: 'LOUVRE',
      answer: 'LOUVRE',
    })
    expect(r.fixed).toBe(true)
    expect(r.enigme.cipher_display).not.toBe('LOUVRE')
    expect(r.enigme.cipher_display?.split('').sort().join('')).toBe('ELORUV')
  })

  it('accepts a valid permutation', () => {
    const r = validateAndFixEnigme({
      ...base,
      type: 'anagram',
      cipher_display: 'ERVUOL',
      answer: 'LOUVRE',
    })
    expect(r.fixed).toBe(false)
  })
})

describe('morse / a1z26 / reverse', () => {
  it('encodes accented answers without dropping letters (morse)', () => {
    const r = validateAndFixEnigme({
      ...base,
      type: 'morse',
      cipher_display: '',
      answer: 'ÉGLISE',
    })
    const tokens = (r.enigme.cipher_display ?? '')
      .split(' ')
      .filter((t) => t !== '/')
    expect(tokens).toHaveLength(6)
    const roundTrip = validateAndFixEnigme({ ...r.enigme, type: 'morse' })
    expect(roundTrip.fixed).toBe(false)
  })

  it('accepts valid a1z26 and reverse displays', () => {
    expect(
      validateAndFixEnigme({
        ...base,
        type: 'a1z26',
        cipher_display: '16-15-14-20',
        answer: 'PONT',
      }).fixed,
    ).toBe(false)
    expect(
      validateAndFixEnigme({
        ...base,
        type: 'cipher_reverse',
        cipher_display: 'KLMG',
        answer: 'PONT',
      }).fixed,
    ).toBe(false)
  })

  it('leaves word games untouched', () => {
    const r = validateAndFixEnigme({
      ...base,
      type: 'charade',
      cipher_display: 'Mon premier…',
      answer: 'CARTE',
    })
    expect(r.fixed).toBe(false)
  })
})
