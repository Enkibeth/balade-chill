'use client'

import type { EnigmeType } from '@/types'
import { useIsLight } from '@/hooks/useTheme'

const POLYBE_ROWS = [
  ['A', 'B', 'C', 'D', 'E'],
  ['F', 'G', 'H', 'I', 'J'],
  ['K', 'L', 'M', 'N', 'O'],
  ['P', 'Q', 'R', 'S', 'T'],
  ['U', 'V', 'W', 'X', 'Y/Z'],
]

const MORSE_CHART: Array<[string, string]> = [
  ['A', '.-'], ['B', '-...'], ['C', '-.-.'], ['D', '-..'], ['E', '.'],
  ['F', '..-.'], ['G', '--.'], ['H', '....'], ['I', '..'], ['J', '.---'],
  ['K', '-.-'], ['L', '.-..'], ['M', '--'], ['N', '-.'], ['O', '---'],
  ['P', '.--.'], ['Q', '--.-'], ['R', '.-.'], ['S', '...'], ['T', '-'],
  ['U', '..-'], ['V', '...-'], ['W', '.--'], ['X', '-..-'], ['Y', '-.--'],
  ['Z', '--..'],
]

/** Monospace display of an encoded puzzle, matching the "Le Secret d'Amalia"
 *  cipher aesthetic — green-on-dark by night, ink-on-parchment by day. Renders
 *  the Polybe grid and Morse chart too. */
export function CipherBlock({
  type,
  display,
}: {
  type: EnigmeType
  display: string
}) {
  const light = useIsLight()
  const box = light
    ? 'border-emerald-800/30 bg-[#ede0c4]'
    : 'border-emerald-400/25 bg-[#1e1410]'
  const codeText = light ? 'text-emerald-800' : 'text-emerald-400'
  const labelText = light ? 'text-emerald-800/60' : 'text-emerald-400/40'
  const gridText = light ? 'text-emerald-900/75' : 'text-emerald-200/70'
  const headText = light ? 'text-emerald-800' : 'text-emerald-300'
  const headBg = light ? 'bg-emerald-700/10' : 'bg-emerald-400/10'
  const cellBorder = light ? 'border-emerald-800/20' : 'border-emerald-400/20'
  const cellBorderSoft = light
    ? 'border-emerald-800/10'
    : 'border-emerald-400/10'

  return (
    <div className={`my-3 rounded-lg border p-4 ${box}`}>
      {type === 'polybe' && (
        <table className={`mx-auto mb-3 border-collapse font-mono text-xs ${gridText}`}>
          <tbody>
            <tr>
              <th className={`border px-2 py-1 ${cellBorder}`} />
              {[1, 2, 3, 4, 5].map((n) => (
                <th
                  key={n}
                  className={`border px-2 py-1 ${cellBorder} ${headBg} ${headText}`}
                >
                  {n}
                </th>
              ))}
            </tr>
            {POLYBE_ROWS.map((row, i) => (
              <tr key={i}>
                <th className={`border px-2 py-1 ${cellBorder} ${headBg} ${headText}`}>
                  {i + 1}
                </th>
                {row.map((c) => (
                  <td
                    key={c}
                    className={`border px-2 py-1 text-center ${cellBorderSoft}`}
                  >
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {type === 'morse' && (
        <div className={`mx-auto mb-3 grid max-w-[320px] grid-cols-4 gap-x-2 gap-y-0.5 font-mono text-[10px] sm:grid-cols-6 ${gridText}`}>
          {MORSE_CHART.map(([letter, code]) => (
            <span key={letter} className="whitespace-nowrap">
              <span className={headText}>{letter}</span> {code}
            </span>
          ))}
        </div>
      )}
      <p className={`mb-1.5 text-center font-mono text-[9px] uppercase tracking-[0.3em] ${labelText}`}>
        message chiffré
      </p>
      <p className={`break-words text-center font-mono text-lg font-bold tracking-[0.2em] ${codeText}`}>
        {display || '—'}
      </p>
    </div>
  )
}
