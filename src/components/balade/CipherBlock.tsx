import type { EnigmeType } from '@/types'

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
 *  cipher aesthetic — green-on-dark by night, ink-on-parchment by day. Colours
 *  come from the --cipher-* CSS vars in globals.css, which the theme script in
 *  layout.tsx flips before first paint, so there is no light/dark flash and no
 *  client hook is needed. Renders the Polybe grid and Morse chart too. */
export function CipherBlock({
  type,
  display,
}: {
  type: EnigmeType
  display: string
}) {
  return (
    <div
      className="my-3 rounded-lg border p-4"
      style={{
        borderColor: 'var(--cipher-border)',
        backgroundColor: 'var(--cipher-bg)',
      }}
    >
      {type === 'polybe' && (
        <table
          className="mx-auto mb-3 border-collapse font-mono text-xs"
          style={{ color: 'var(--cipher-grid)' }}
        >
          <tbody>
            <tr>
              <th
                className="border px-2 py-1"
                style={{ borderColor: 'var(--cipher-cell)' }}
              />
              {[1, 2, 3, 4, 5].map((n) => (
                <th
                  key={n}
                  className="border px-2 py-1"
                  style={{
                    borderColor: 'var(--cipher-cell)',
                    backgroundColor: 'var(--cipher-head-bg)',
                    color: 'var(--cipher-head)',
                  }}
                >
                  {n}
                </th>
              ))}
            </tr>
            {POLYBE_ROWS.map((row, i) => (
              <tr key={i}>
                <th
                  className="border px-2 py-1"
                  style={{
                    borderColor: 'var(--cipher-cell)',
                    backgroundColor: 'var(--cipher-head-bg)',
                    color: 'var(--cipher-head)',
                  }}
                >
                  {i + 1}
                </th>
                {row.map((c) => (
                  <td
                    key={c}
                    className="border px-2 py-1 text-center"
                    style={{ borderColor: 'var(--cipher-cell-soft)' }}
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
        <div
          className="mx-auto mb-3 grid max-w-[320px] grid-cols-4 gap-x-2 gap-y-0.5 font-mono text-[10px] sm:grid-cols-6"
          style={{ color: 'var(--cipher-grid)' }}
        >
          {MORSE_CHART.map(([letter, code]) => (
            <span key={letter} className="whitespace-nowrap">
              <span style={{ color: 'var(--cipher-head)' }}>{letter}</span> {code}
            </span>
          ))}
        </div>
      )}
      <p
        className="mb-1.5 text-center font-mono text-[9px] uppercase tracking-[0.3em]"
        style={{ color: 'var(--cipher-label)' }}
      >
        message chiffré
      </p>
      <p
        className="break-words text-center font-mono text-lg font-bold tracking-[0.2em]"
        style={{ color: 'var(--cipher-code)' }}
      >
        {display || '—'}
      </p>
    </div>
  )
}
