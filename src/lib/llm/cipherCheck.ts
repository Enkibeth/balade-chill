import type { GeneratedEnigme } from './generated'

/**
 * Free, deterministic safety net for the mechanical cipher types: it checks
 * that `cipher_display` actually decodes to `answer`, and re-encodes it when it
 * doesn't — so a cheap model can never ship an unsolvable puzzle. Non-mechanical
 * types (math_code, wordplay, polybe) are left to the LLM refine pass.
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
