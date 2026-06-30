// lib/itinerary/googleMaps.ts
// Construit des liens Google Maps Directions qui s'ouvrent avec les VRAIS NOMS
// des lieux (et non des coordonnées), grâce aux Place IDs.
//
// Règle Google Maps (api=1) :
//   - origin / destination : texte (nom ou "lat,lng")
//   - origin_place_id / destination_place_id : Place IDs correspondants
//   - waypoints : noms séparés par "|"
//   - waypoint_place_ids : Place IDs alignés 1:1 avec waypoints (tout ou rien)
//   - travelmode : walking | transit | bicycling | driving
//   - max 9 waypoints intermédiaires par lien

import type { Stop, TravelMode } from './types';

const BASE = 'https://www.google.com/maps/dir/?api=1';

/** Google Maps n'accepte que 9 waypoints intermédiaires par lien. */
export const MAX_WAYPOINTS = 9;

function label(stop: Stop): string {
  // On préfère le nom (joli libellé) ; repli sur les coordonnées.
  return stop.name?.trim() ? stop.name.trim() : `${stop.lat},${stop.lng}`;
}

/**
 * Construit UN lien Google Maps Directions.
 * Si chaque arrêt a un `placeId`, le lien s'ouvre avec les noms des lieux.
 * Suppose waypoints.length <= MAX_WAYPOINTS (sinon utiliser buildDirectionsUrls).
 */
export function buildDirectionsUrl(
  origin: Stop,
  destination: Stop,
  waypoints: Stop[],
  mode: TravelMode,
): string {
  const params: string[] = [
    `origin=${encodeURIComponent(label(origin))}`,
    `destination=${encodeURIComponent(label(destination))}`,
    `travelmode=${mode}`,
  ];

  if (origin.placeId) {
    params.push(`origin_place_id=${encodeURIComponent(origin.placeId)}`);
  }
  if (destination.placeId) {
    params.push(`destination_place_id=${encodeURIComponent(destination.placeId)}`);
  }

  if (waypoints.length > 0) {
    params.push(
      `waypoints=${waypoints.map((w) => encodeURIComponent(label(w))).join('|')}`,
    );
    // waypoint_place_ids doit être aligné 1:1 avec waypoints -> tout ou rien.
    if (waypoints.every((w) => w.placeId)) {
      params.push(
        `waypoint_place_ids=${waypoints.map((w) => encodeURIComponent(w.placeId!)).join('|')}`,
      );
    }
  }

  return `${BASE}&${params.join('&')}`;
}

/**
 * Comme buildDirectionsUrl, mais découpe automatiquement en plusieurs liens
 * au-delà de 9 waypoints. Les liens se chevauchent d'un arrêt pour que la
 * chaîne soit continue (le lien N se termine là où le lien N+1 commence).
 */
export function buildDirectionsUrls(
  origin: Stop,
  destination: Stop,
  waypoints: Stop[],
  mode: TravelMode,
): string[] {
  if (waypoints.length <= MAX_WAYPOINTS) {
    return [buildDirectionsUrl(origin, destination, waypoints, mode)];
  }

  const all: Stop[] = [origin, ...waypoints, destination];
  const urls: string[] = [];
  // Fenêtre de (MAX_WAYPOINTS + 1) pas => au plus 11 arrêts par lien => 9 waypoints.
  const step = MAX_WAYPOINTS + 1;
  let start = 0;
  while (start < all.length - 1) {
    const end = Math.min(start + step, all.length - 1);
    const chunk = all.slice(start, end + 1);
    urls.push(
      buildDirectionsUrl(chunk[0], chunk[chunk.length - 1], chunk.slice(1, -1), mode),
    );
    start = end; // chevauchement d'un arrêt
  }
  return urls;
}
