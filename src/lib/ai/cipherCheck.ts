import type { GeneratedEnigme } from './generated'

/**
 * Free, deterministic safety net for the mechanical cipher types: it checks
 * that `cipher_display` actually decodes to `answer`, and re-encodes it when it
 * doesn't — so a cheap model can never ship an unsolvable puzzle. Covers
 * cipher_reverse, cipher_caesar, anagram, morse, a1z26, polybe and vigenere
 * (keyword read from the instruction). Types that aren't purely mechanical
 * (math_code and the word games — wordplay/charade/riddle/rebus/acrostiche)
 * are left to the LLM refine pass.
 */

/** Drops combining accents so É/È/Ê all become E (French answers keep letters). */
function stripAccents(s: string): string {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function lettersOnly(s: string): string {
  return stripAccents(s).toUpperCase().replace(/[^A-Z]/g, '')
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
  return stripAccents(answer)
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
  return stripAccents(answer)
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

// ── Polybe ──────────────────────────────────────────────────────────────────
// Same 5×5 grid as the one rendered next to the enigma (render-html.ts):
// rows A-E / F-J / K-O / P-T / U-Y, with Y and Z sharing the last cell.

/** Encodes a phrase to Polybe pairs "row col", words separated by " / ". */
function toPolybe(answer: string): string {
  return stripAccents(answer)
    .toUpperCase()
    .split(/\s+/)
    .map((word) =>
      word
        .replace(/[^A-Z]/g, '')
        .split('')
        .map((ch) => {
          const idx = ch === 'Z' ? 24 : ch.charCodeAt(0) - 65
          return `${Math.floor(idx / 5) + 1}${(idx % 5) + 1}`
        })
        .join(' '),
    )
    .filter(Boolean)
    .join(' / ')
}

/** Decodes Polybe coordinates back to letters ("55" reads as Y — Y/Z cell). */
function fromPolybe(display: string): string {
  const digits = (display || '').replace(/[^1-5]/g, '')
  if (digits.length === 0 || digits.length % 2 !== 0) return ''
  let out = ''
  for (let i = 0; i < digits.length; i += 2) {
    const r = Number(digits[i])
    const c = Number(digits[i + 1])
    out += String.fromCharCode(65 + (r - 1) * 5 + (c - 1))
  }
  return out
}

/** Y and Z share the (5,5) cell, so compare with Z folded onto Y. */
function foldYZ(letters: string): string {
  return letters.replace(/Z/g, 'Y')
}

// ── Vigenère ────────────────────────────────────────────────────────────────

/** Shifts letters by the repeating key; sign=+1 encodes, sign=-1 decodes. */
function vigenereApply(text: string, key: string, sign: 1 | -1): string {
  const k = lettersOnly(key)
  if (!k) return text
  let ki = 0
  return text.replace(/[A-Z]/g, (ch) => {
    const shift = (k.charCodeAt(ki % k.length) - 65) * sign
    ki += 1
    return String.fromCharCode(((ch.charCodeAt(0) - 65 + shift + 26) % 26) + 65)
  })
}

/** Encodes the answer with the key, keeping word boundaries readable. */
function toVigenere(answer: string, key: string): string {
  const plain = stripAccents(answer).toUpperCase().replace(/[^A-Z\s]/g, '')
  return vigenereApply(plain, key, 1).replace(/\s+/g, ' ').trim()
}

/**
 * Pulls keyword candidates out of the instruction (and hint), in order of
 * confidence: quoted words, "mot-clé : X" patterns, then ALL-CAPS words.
 */
function vigenereKeywordCandidates(enigme: GeneratedEnigme): string[] {
  const text = `${enigme.instruction ?? ''} ${enigme.hint ?? ''}`
  const out: string[] = []
  const push = (raw: string | undefined) => {
    const k = lettersOnly(raw ?? '')
    if (k.length >= 2 && k.length <= 15 && !out.includes(k)) out.push(k)
  }
  for (const m of Array.from(
    text.matchAll(/«\s*([^»]+?)\s*»|"([^"]+)"|“([^”]+)”/g),
  )) {
    push(m[1] ?? m[2] ?? m[3])
  }
  for (const m of Array.from(
    text.matchAll(
      /(?:mot[- ]cl[ée]|cl[ée])\s*(?:est|:|=)?\s*[«"'”]?\s*([A-Za-zÀ-ÿ]{2,15})/gi,
    ),
  )) {
    push(m[1])
  }
  for (const m of Array.from(stripAccents(text).matchAll(/\b[A-Z]{3,15}\b/g))) {
    push(m[0])
  }
  return out
}

/**
 * Turns a scrambled-but-valid anagram out of the answer's letters. Tries a real
 * shuffle first, falling back to reverse/rotation for degenerate inputs.
 */
function scramble(answer: string): string {
  const letters = lettersOnly(answer)
  if (letters.length < 2) return letters
  const chars = letters.split('')
  for (let attempt = 0; attempt < 10; attempt++) {
    const shuffled = [...chars]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    const candidate = shuffled.join('')
    if (candidate !== letters) return candidate
  }
  const reversed = chars.slice().reverse().join('')
  if (reversed !== letters) return reversed
  return letters.slice(1) + letters.slice(0, 1)
}

const CAESAR_SHIFT = 3

/**
 * Numbers (1..25) stated in the instruction/explanation — the shift the player
 * is told to use. Used to catch a display that decodes fine, but with a
 * different shift than the one announced (unsolvable as stated).
 */
function statedCaesarShifts(enigme: GeneratedEnigme): number[] {
  const text = `${enigme.instruction ?? ''} ${enigme.answer_explanation ?? ''}`
  return (text.match(/\d{1,2}/g) ?? [])
    .map(Number)
    .filter((n) => n >= 1 && n <= 25)
}

const EXPLAIN = {
  caesar: (shift: number) =>
    `Chiffre de César : décale chaque lettre de ${shift} rangs vers l’arrière (${caesarShift(
      'A',
      shift,
    )}→A) pour retrouver la réponse.`,
  reverse:
    'Alphabet inversé (A↔Z, B↔Y, …) : remplace chaque lettre par sa symétrique pour lire la réponse.',
  anagram:
    'Anagramme : les lettres de la réponse ont été mélangées, remets-les dans l’ordre.',
  morse:
    'Code Morse : chaque lettre est une suite de points (·) et de traits (–), séparée par une espace ("/" = séparateur de mots). Reporte chaque signe sur la table Morse pour lire la réponse.',
  a1z26:
    'Code A1Z26 : chaque nombre est le rang d’une lettre dans l’alphabet (A=1, B=2, …, Z=26). Convertis chaque nombre en sa lettre pour reconstituer la réponse.',
  polybe:
    'Carré de Polybe : chaque paire de chiffres indique la ligne puis la colonne d’une lettre dans la grille (Y et Z partagent la dernière case). Repère chaque paire dans la grille pour lire la réponse.',
  vigenere: (key: string) =>
    `Chiffre de Vigenère (mot-clé ${key}) : sous chaque lettre du code, écris la lettre du mot-clé répété, puis recule chaque lettre du code du rang de la lettre-clé (A=0, B=1, …) pour retrouver la réponse.`,
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
        cipher_display: reverseAlpha(stripAccents(answer)),
        answer_explanation: EXPLAIN.reverse,
      },
      fixed: true,
    }
  }

  if (enigme.type === 'cipher_caesar') {
    const cipherLetters = lettersOnly(display)
    // All forward shifts that decode the display into the answer (a pure
    // Caesar text has exactly one).
    const decodeShifts =
      cipherLetters.length === answerLetters.length
        ? Array.from({ length: 25 }, (_, i) => i + 1).filter(
            (k) => caesarShift(cipherLetters, k) === answerLetters,
          )
        : []
    const stated = statedCaesarShifts(enigme)
    if (decodeShifts.length > 0) {
      // Decodable — but if a shift is announced to the player, it must be one
      // that actually works ("décale de n" = encoded forward by n, i.e. decode
      // forward by 26-n; accept the direct reading too).
      const consistent =
        stated.length === 0 ||
        stated.some(
          (n) =>
            decodeShifts.includes((26 - n) % 26) || decodeShifts.includes(n),
        )
      if (consistent) return { enigme, fixed: false }
    }
    // Re-encode, honouring the announced shift when there is one so the
    // instruction text stays truthful.
    const shift = stated[0] ?? CAESAR_SHIFT
    return {
      enigme: {
        ...enigme,
        cipher_display: caesarShift(stripAccents(answer), shift),
        answer_explanation: EXPLAIN.caesar(shift),
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

  if (enigme.type === 'polybe') {
    const decodable =
      foldYZ(lettersOnly(fromPolybe(display))) === foldYZ(answerLetters)
    if (decodable && /[1-5]/.test(display)) return { enigme, fixed: false }
    return {
      enigme: {
        ...enigme,
        cipher_display: toPolybe(answer),
        answer_explanation: EXPLAIN.polybe,
      },
      fixed: true,
    }
  }

  if (enigme.type === 'vigenere') {
    const cipherLetters = lettersOnly(display)
    const candidates = vigenereKeywordCandidates(enigme)
    const decodable =
      cipherLetters.length === answerLetters.length &&
      candidates.some(
        (key) => vigenereApply(cipherLetters, key, -1) === answerLetters,
      )
    if (decodable) return { enigme, fixed: false }
    // Re-encode with the announced keyword when one exists (the instruction
    // stays valid); otherwise pick one and announce it in the instruction.
    const key = candidates[0] ?? 'AMOUR'
    const instruction =
      candidates.length > 0
        ? enigme.instruction
        : `${(enigme.instruction ?? '').trim()} Mot-clé : ${key}.`.trim()
    return {
      enigme: {
        ...enigme,
        instruction,
        cipher_display: toVigenere(answer, key),
        answer_explanation: EXPLAIN.vigenere(key),
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
