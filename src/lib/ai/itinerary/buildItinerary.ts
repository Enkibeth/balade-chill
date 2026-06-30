// lib/itinerary/buildItinerary.ts
// Point d'entrée du moteur : transforme un point de départ + une liste de POI
// en un itinéraire prêt à partager :
//   - ordonne les POI en boucle logique (ou en parcours A -> B),
//   - ajoute en option un segment d'approche dans un autre mode
//     (ex. transports jusqu'au centre), puis la boucle à pied / à vélo,
//   - produit des liens Google Maps qui s'ouvrent avec les noms des lieux.

import { pathLengthKm } from './geo';
import { buildDirectionsUrls } from './googleMaps';
import { orderStops } from './optimize';
import type {
  Anchor,
  ItineraryPlan,
  PlanOptions,
  PointOfInterest,
  Segment,
  Stop,
  TravelMode,
} from './types';

const MODE_LABEL: Record<TravelMode, string> = {
  walking: 'à pied',
  bicycling: 'à vélo',
  transit: 'en transports',
  driving: 'en voiture',
};

export function planItinerary(opts: PlanOptions): ItineraryPlan {
  const {
    start,
    pois,
    loopMode,
    loop = true,
    finish,
    approach,
    optimize = true,
  } = opts;

  const segments: Segment[] = [];

  // 1) Où commence / finit la partie à pied (ou vélo) ?
  const loopStart: Anchor = approach ? approach.entry : start;
  const loopEnd: Anchor = loop ? loopStart : finish ?? loopStart;

  // 2) Segment d'approche (autre mode), le cas échéant.
  if (approach) {
    segments.push(
      makeSegment(
        `Trajet vers ${approach.entry.name} (${MODE_LABEL[approach.mode]})`,
        approach.mode,
        start,
        approach.entry,
        [],
      ),
    );
  }

  // 3) Ordonner les POI entre loopStart et loopEnd.
  const ordered = optimize
    ? orderStops(pois, { start: loopStart, end: loopEnd })
    : [...pois];

  // 4) La boucle / le parcours principal.
  segments.push(
    makeSegment(
      loop ? `Boucle ${MODE_LABEL[loopMode]}` : `Parcours ${MODE_LABEL[loopMode]}`,
      loopMode,
      loopStart,
      loopEnd,
      ordered,
    ),
  );

  // 5) Segment de retour optionnel vers le vrai point de départ.
  if (approach?.returnToStart) {
    segments.push(
      makeSegment(
        `Retour vers ${start.name} (${MODE_LABEL[approach.mode]})`,
        approach.mode,
        approach.entry,
        start,
        [],
      ),
    );
  }

  const orderedStops = dedupeJoins(segments);
  const totalDistanceKm = round(
    segments.reduce((sum, seg) => sum + seg.distanceKm, 0),
  );

  return { segments, orderedStops, totalDistanceKm, isLoop: loop };
}

function makeSegment(
  label: string,
  mode: TravelMode,
  origin: Stop,
  destination: Stop,
  waypoints: PointOfInterest[],
): Segment {
  return {
    label,
    mode,
    origin,
    destination,
    waypoints,
    googleMapsUrls: buildDirectionsUrls(origin, destination, waypoints, mode),
    distanceKm: round(pathLengthKm([origin, ...waypoints, destination])),
  };
}

/** Concatène les arrêts de tous les segments en évitant de répéter les jonctions. */
function dedupeJoins(segments: Segment[]): Stop[] {
  const out: Stop[] = [];
  for (const seg of segments) {
    for (const s of [seg.origin, ...seg.waypoints, seg.destination]) {
      const last = out[out.length - 1];
      if (last && samePoint(last, s)) continue;
      out.push(s);
    }
  }
  return out;
}

function samePoint(a: Stop, b: Stop): boolean {
  if (a.placeId && b.placeId) return a.placeId === b.placeId;
  return Math.abs(a.lat - b.lat) < 1e-7 && Math.abs(a.lng - b.lng) < 1e-7;
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
