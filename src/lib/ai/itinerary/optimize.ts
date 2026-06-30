// lib/itinerary/optimize.ts
// Ordonne des POI en un parcours court et logique entre deux ancres fixes.
// Heuristique : amorçage plus proche voisin + raffinement 2-opt, sur distance
// à vol d'oiseau. Déterministe. Largement suffisant pour une balade urbaine
// (< ~15 arrêts). Pour un ordre routier exact, fournir une matrice de distances.

import { haversineKm } from './geo';
import type { LatLng, PointOfInterest } from './types';

interface OrderOptions {
  start: LatLng;
  /** fin du parcours ; passer le même point que `start` pour une boucle */
  end: LatLng;
}

export function orderStops(
  pois: PointOfInterest[],
  { start, end }: OrderOptions,
): PointOfInterest[] {
  if (pois.length <= 2) return [...pois];
  const seeded = nearestNeighbour(pois, start);
  return twoOpt(seeded, start, end);
}

function nearestNeighbour(pois: PointOfInterest[], start: LatLng): PointOfInterest[] {
  const remaining = [...pois];
  const out: PointOfInterest[] = [];
  let current: LatLng = start;
  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineKm(current, remaining[i]);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    current = remaining[bestIdx];
    out.push(remaining.splice(bestIdx, 1)[0]);
  }
  return out;
}

function totalLen(order: PointOfInterest[], start: LatLng, end: LatLng): number {
  let d = haversineKm(start, order[0]);
  for (let i = 1; i < order.length; i++) d += haversineKm(order[i - 1], order[i]);
  d += haversineKm(order[order.length - 1], end);
  return d;
}

function twoOpt(order: PointOfInterest[], start: LatLng, end: LatLng): PointOfInterest[] {
  let best = order;
  let bestLen = totalLen(best, start, end);
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const candidate = [
          ...best.slice(0, i),
          ...best.slice(i, j + 1).reverse(),
          ...best.slice(j + 1),
        ];
        const len = totalLen(candidate, start, end);
        if (len + 1e-9 < bestLen) {
          best = candidate;
          bestLen = len;
          improved = true;
        }
      }
    }
  }
  return best;
}
