/**
 * Pulls the first top-level JSON object out of a model's text response,
 * tolerating markdown fences and prose around it. Returns null when nothing
 * parseable is found — callers decide how to classify the failure.
 */
export function extractJsonObject(text: string): unknown | null {
  let raw = (text ?? '').trim()
  if (!raw) return null
  if (raw.startsWith('```')) {
    raw = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  }
  const first = raw.indexOf('{')
  const last = raw.lastIndexOf('}')
  if (first === -1 || last === -1 || last < first) return null
  try {
    return JSON.parse(raw.slice(first, last + 1))
  } catch {
    return null
  }
}
