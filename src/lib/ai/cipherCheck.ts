import type { GeneratedEnigme } from './generated'

/**
 * Free, deterministic safety net for the mechanical cipher types: it checks
 * that `cipher_display` actually decodes to `answer`, and re-encodes it when it
 * doesn't — so a cheap model can never ship an unsolvable puzzle. Covers
 * cipher_reverse, cipher_caesar, anagram, morse and a1z26. Types that aren't
 * purely mechanical (math_code, polybe, vigenere, and the word games —
 * wordplay/charade/riddle/rebus/acrostiche) are left to the LLM refine pass.
 */

function lettersOnly(s: string): string {
  return (s || '').toUpperCase().replace(/[^A-Z]/g, '')
}

function caesarShift(text: string, shift: number): string {
  return text.replace(/[a-z]/gi, (ch) => {
    const base = ch <= 'Z' ? 65 : 97
    return String.fromCharCode(
      ((ch.charCodeAt(0) - base + shift + 26) % 26) + base,
    )
  })
}

function reverseAlpha(text: string): string {
  return text.replace(/[a-z]/gi, (ch) => {
    const base = ch <= 'Z' ? 65 : 97
    return String.fromCharCode(base + (25 - (ch.charCodeAt(0) - base)))
  })
}

function sortedLetters(s: string): string {
  return lettersOnly(s).split('').sort().join('')
}

const MORSE: Record<string, string> = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.',
  H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.',
  O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-',
  V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
}
const MORSE_REVERSE: Record<string, string> = Object.fromEntries(
  Object.entries(MORSE).map(([k, v]) => [v, k]),
)

/** Encodes a phrase to Morse: letters spaced, words separated by " / ". */
function toMorse(answer: string): string {
  return answer
    .toUpperCase()
    .split(/\s+/)
    .map((word) =>
      word
        .replace(/[^A-Z]/g, '')
        .split('')
        .map((ch) => MORSE[ch] ?? '')
        .filter(Boolean)
        .join(' '),
    )
    .filter(Boolean)
    .join(' / ')
}

/** Decodes a Morse string back to letters (ignores anything unrecognised). */
function fromMorse(display: string): string {
  return display
    .trim()
    .split(/\s+/)
    .map((tok) => (tok === '/' ? '' : MORSE_REVERSE[tok] ?? ''))
    .join('')
}

/** Encodes a phrase to A1Z26: A=1…Z=26, letters joined by "-", words by " / ". */
function toA1Z26(answer: string): string {
  return answer
    .toUpperCase()
    .split(/\s+/)
    .map((word) =>
      word
        .replace(/[^A-Z]/g, '')
        .split('')
        .map((ch) => ch.charCodeAt(0) - 64)
        .join('-'),
    )
    .filter(Boolean)
    .join(' / ')
}

/** Decodes an A1Z26 string back to letters (ignores out-of-range numbers). */
function fromA1Z26(display: string): string {
  return (display.match(/\d+/g) ?? [])
    .map((n) => {
      const v = parseInt(n, 10)
      return v >= 1 && v <= 26 ? String.fromCharCode(64 + v) : ''
    })
    .join('')
}

function scramble(answer: string): string {
  const letters = lettersOnly(answer)
  const reversed = letters.split('').reverse().join('')
  if (reversed !== letters) return reversed
  return letters.slice(1) + letters.slice(0, 1)
}

const CAESAR_SHIFT = 3
const EXPLAIN = {
  caesar: `Chiffre de César : décale chaque lettre de ${CAESAR_SHIFT} rangs vers l’arrière (D→A) pour retrouver la réponse.`,
  reverse:
    'Alphabet inversé (A↔Z, B↔Y, …) : remplace chaque lettre par sa symétrique pour lire la réponse.',
  anagram:
    'Anagramme : les lettres de la réponse ont été mélangées, remets-les dans l’ordre.',
  morse:
    'Code Morse : chaque lettre est une suite de points (·) et de traits (–), séparée par une espace ("/" = séparateur de mots). Reporte chaque signe sur la table Morse pour lire la réponse.',
  a1z26:
    'Code A1Z26 : chaque nombre est le rang d’une lettre dans l’alphabet (A=1, B=2, …, Z=26). Convertis chaque nombre en sa lettre pour reconstituer la réponse.',
}

export function validateAndFixEnigme(enigme: GeneratedEnigme): {
  enigme: GeneratedEnigme
  fixed: boolean
} {
  const answer = enigme.answer || ''
  const display = enigme.cipher_display || ''
  const answerLetters = lettersOnly(answer)
  if (!answerLetters) return { enigme, fixed: false }

  if (enigme.type === 'cipher_reverse') {
    if (lettersOnly(display) === reverseAlpha(answerLetters)) {
      return { enigme, fixed: false }
    }
    return {
      enigme: {
        ...enigme,
        cipher_display: reverseAlpha(answer),
        answer_explanation: EXPLAIN.reverse,
      },
      fixed: true,
    }
  }

  if (enigme.type === 'cipher_caesar') {
    const cipherLetters = lettersOnly(display)
    const decodable =
      cipherLetters.length === answerLetters.length &&
      Array.from({ length: 25 }, (_, i) => i + 1).some(
        (k) => caesarShift(cipherLetters, k) === answerLetters,
      )
    if (decodable) return { enigme, fixed: false }
    return {
      enigme: {
        ...enigme,
        cipher_display: caesarShift(answer, CAESAR_SHIFT),
        answer_explanation: EXPLAIN.caesar,
      },
      fixed: true,
    }
  }

  if (enigme.type === 'morse') {
    const decodable = lettersOnly(fromMorse(display)) === answerLetters
    if (decodable && /[.\-]/.test(display)) return { enigme, fixed: false }
    return {
      enigme: {
        ...enigme,
        cipher_display: toMorse(answer),
        answer_explanation: EXPLAIN.morse,
      },
      fixed: true,
    }
  }

  if (enigme.type === 'a1z26') {
    const decodable = lettersOnly(fromA1Z26(display)) === answerLetters
    if (decodable && /\d/.test(display)) return { enigme, fixed: false }
    return {
      enigme: {
        ...enigme,
        cipher_display: toA1Z26(answer),
        answer_explanation: EXPLAIN.a1z26,
      },
      fixed: true,
    }
  }

  if (enigme.type === 'anagram') {
    const isPermutation =
      sortedLetters(display) === sortedLetters(answer) &&
      lettersOnly(display) !== answerLetters
    if (isPermutation) return { enigme, fixed: false }
    return {
      enigme: {
        ...enigme,
        cipher_display: scramble(answer),
        answer_explanation: EXPLAIN.anagram,
      },
      fixed: true,
    }
  }

  return { enigme, fixed: false }
}
