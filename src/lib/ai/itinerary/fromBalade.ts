// src/lib/ai/itinerary/fromBalade.ts
// Pont entre une balade générée et le moteur d'itinéraires : transforme les
// étapes (déjà ordonnées par l'intrigue) en un lien Google Maps unique qui
// s'ouvre avec les NOMS des lieux, dans l'ordre exact du parcours.
//
// Contraintes propres à la balade :
//   - L'ordre des étapes EST l'histoire : on ne réordonne jamais (optimize:false).
//   - Pas de Google Place ID (le géocodage du projet passe par Nominatim/OSM),
//     donc le moteur passe les noms en texte ; on les désambiguïse avec la ville
//     pour que Google les géocode sur le bon lieu.
//   - Boucle vs A→B : déduit des coordonnées (départ ≈ arrivée ⇒ boucle), seule
//     source de vérité fiable une fois les étapes calées sur le terrain.

import { planItinerary } from './buildItinerary'
import { haversineKm } from './geo'
import type { Anchor, ItineraryPlan, PointOfInterest } from './types'
import type { Balade, Etape } from '@/types'

// En deçà de ce seuil, départ et arrivée sont considérés comme le même point :
// la balade est une boucle (retour au départ), pas un trajet A→B.
const LOOP_THRESHOLD_KM = 0.15

/** Nom d'étape désambiguïsé pour un géocodage Google fiable (sans Place ID). */
function stopName(etape: Etape, city: string): string {
  const base = etape.location_name?.trim() || `Étape ${etape.order}`
  const cityTrimmed = city?.trim()
  if (cityTrimmed && !base.toLowerCase().includes(cityTrimmed.toLowerCase())) {
    return `${base}, ${cityTrimmed}`
  }
  return base
}

function toPoi(etape: Etape, city: string): PointOfInterest {
  return { name: stopName(etape, city), lat: etape.lat, lng: etape.lng }
}

function toAnchor(etape: Etape, city: string): Anchor {
  return { name: stopName(etape, city), lat: etape.lat, lng: etape.lng }
}

/**
 * Construit l'itinéraire Google Maps complet d'une balade, dans l'ordre des
 * étapes. Renvoie `null` s'il n'y a pas assez de points géolocalisés (< 2).
 */
export function buildBaladeItinerary(balade: Balade): ItineraryPlan | null {
  const stops = balade.etapes
    .filter((e) => Number.isFinite(e.lat) && Number.isFinite(e.lng))
    .sort((a, b) => a.order - b.order)
  if (stops.length < 2) return null

  const first = stops[0]
  const last = stops[stops.length - 1]
  const isLoop = haversineKm(first, last) < LOOP_THRESHOLD_KM

  const start = toAnchor(first, balade.city)
  // Arrêts intermédiaires = toutes les étapes sauf départ et arrivée. En boucle,
  // l'arrivée ≈ le départ : l'exclure évite de la dupliquer (le moteur referme
  // la boucle sur `start` de lui-même).
  const middle = stops.slice(1, -1).map((e) => toPoi(e, balade.city))

  if (isLoop) {
    return planItinerary({
      start,
      pois: middle,
      loopMode: 'walking',
      loop: true,
      optimize: false,
    })
  }

  return planItinerary({
    start,
    pois: middle,
    loopMode: 'walking',
    loop: false,
    finish: toAnchor(last, balade.city),
    optimize: false,
  })
}
