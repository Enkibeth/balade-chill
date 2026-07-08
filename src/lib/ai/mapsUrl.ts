/**
 * Lien Google Maps « recherche » (api=1) qui ouvre la fiche du lieu nommé
 * plutôt qu'un simple point de coordonnées : Google résout « nom, ville »
 * vers la vraie fiche du lieu (photos, avis, itinéraire en un tap).
 *
 * - Repli sur les coordonnées brutes quand aucun nom n'est disponible.
 * - La ville n'est ajoutée que si le nom ne la contient pas déjà (les
 *   displayName issus du géocodage l'incluent souvent).
 */
export function placeSearchUrl(
  name: string | null | undefined,
  city: string | null | undefined,
  lat: number,
  lng: number,
): string {
  const n = name?.trim() ?? ''
  const c = city?.trim() ?? ''
  let query: string
  if (!n) {
    query = `${lat},${lng}`
  } else if (c && !n.toLowerCase().includes(c.toLowerCase())) {
    query = `${n}, ${c}`
  } else {
    query = n
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

/** True when the URL is a coordinates-only search link (ancien format). */
export function isCoordOnlyMapsUrl(url: string): boolean {
  const m = url.match(/[?&]query=([^&]*)$/)
  if (!m) return false
  let q: string
  try {
    q = decodeURIComponent(m[1])
  } catch {
    return false
  }
  return /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(q)
}

/**
 * Met à niveau un maps_url hérité (coordonnées seules) vers une recherche par
 * nom de lieu — pour que les balades déjà en base ouvrent aussi le lieu-dit.
 * Les liens déjà nommés (ou sans nom disponible) sont rendus tels quels.
 */
export function upgradeMapsUrl(
  url: string,
  name: string | null | undefined,
  city: string | null | undefined,
  lat: number,
  lng: number,
): string {
  if (!isCoordOnlyMapsUrl(url) || !name?.trim()) return url
  // « Étape N » est le nom de repli stocké quand le modèle n'a pas nommé le
  // lieu — chercher ça dans Maps serait pire que les coordonnées.
  if (/^étape\s+\d+$/i.test(name.trim())) return url
  return placeSearchUrl(name, city, lat, lng)
}
