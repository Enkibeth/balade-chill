import type { EnigmeType } from '@/types'

const POLYBE_ROWS = [
  ['A', 'B', 'C', 'D', 'E'],
  ['F', 'G', 'H', 'I', 'J'],
  ['K', 'L', 'M', 'N', 'O'],
  ['P', 'Q', 'R', 'S', 'T'],
  ['U', 'V', 'W', 'X', 'Y/Z'],
]

/** Monospace green-on-dark display of an encoded puzzle, matching the
 *  "Le Secret d'Amalia" cipher aesthetic. Renders the Polybe grid too. */
export function CipherBlock({
  type,
  display,
}: {
  type: EnigmeType
  display: string
}) {
  return (
    <div className="my-3 rounded-lg border border-emerald-400/25 bg-[#1e1410] p-4">
      {type === 'polybe' && (
        <table className="mx-auto mb-3 border-collapse font-mono text-xs text-emerald-200/70">
          <tbody>
            <tr>
              <th className="border border-emerald-400/20 px-2 py-1" />
              {[1, 2, 3, 4, 5].map((n) => (
                <th
                  key={n}
                  className="border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-emerald-300"
                >
                  {n}
                </th>
              ))}
            </tr>
            {POLYBE_ROWS.map((row, i) => (
              <tr key={i}>
                <th className="border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-emerald-300">
                  {i + 1}
                </th>
                {row.map((c) => (
                  <td
                    key={c}
                    className="border border-emerald-400/10 px-2 py-1 text-center"
                  >
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mb-1.5 text-center font-mono text-[9px] uppercase tracking-[0.3em] text-emerald-400/40">
        message chiffré
      </p>
      <p className="break-words text-center font-mono text-lg font-bold tracking-[0.2em] text-emerald-400">
        {display || '—'}
      </p>
    </div>
  )
}
