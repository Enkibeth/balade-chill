// lib/itinerary/geo.ts
// Distances à vol d'oiseau. Suffisant pour ordonner des arrêts à l'échelle
// d'une ville ; pour des distances routières exactes, brancher une matrice
// de distances (voir README).

import type { LatLng } from './types';

const EARTH_RADIUS_KM = 6371;

export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Longueur cumulée d'un chemin passant par les points dans l'ordre. */
export function pathLengthKm(points: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineKm(points[i - 1], points[i]);
  }
  return total;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
