/**
 * Liens Google Maps des étapes — ancrés sur les coordonnées exactes.
 *
 * Historique : les liens étaient des recherches par nom (`query=Nom, Ville`)
 * pour ouvrir la « fiche » du lieu. En pratique, sans Place ID Google, une
 * recherche texte est ambiguë : quand Google ne reconnaît pas le libellé
 * (nom d'étape libre, lieu-dit, graphie approximative), il retombe sur la
 * ville entière — le bouton ouvrait « Genève » au lieu du point exact.
 * Seules les coordonnées garantissent le pin au bon endroit ; le nom du
 * lieu reste affiché dans l'app elle-même.
 */

/** Coordonnées exploitables : finies et non (0,0) — 0,0 = géocodage absent. */
export function hasValidCoords(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)
  )
}

/** Lien Google Maps qui ouvre un pin exactement aux coordonnées données. */
export function pointMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat}%2C${lng}`
}

/**
 * Lien à afficher pour une étape : recalculé depuis ses coordonnées dès
 * qu'elles sont exploitables — ce qui corrige aussi, à l'affichage, les
 * maps_url « nom, ville » des balades déjà en base. Repli sur l'URL
 * stockée quand les coordonnées manquent.
 */
export function etapeMapsUrl(
  storedUrl: string | null | undefined,
  lat: number,
  lng: number,
): string {
  if (hasValidCoords(lat, lng)) return pointMapsUrl(lat, lng)
  return storedUrl ?? ''
}
