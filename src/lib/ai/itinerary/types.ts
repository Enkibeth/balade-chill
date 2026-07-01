// lib/itinerary/types.ts
// Types partagés du moteur d'itinéraires "balade".

export type TravelMode = 'walking' | 'transit' | 'bicycling' | 'driving';

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Un lieu que l'utilisateur veut voir.
 * `placeId` (Google Place ID) est la clé : c'est lui qui fait que le lien
 * Google Maps s'ouvre avec le VRAI nom du lieu, et non des coordonnées.
 */
export interface PointOfInterest extends LatLng {
  name: string;
  placeId?: string;
  category?: string;
  notes?: string;
  /** temps de visite estimé, en minutes (sert aux estimations de durée) */
  durationMin?: number;
}

/** Point d'ancrage : départ, arrivée, ou point d'entrée en ville. */
export interface Anchor extends LatLng {
  name: string;
  placeId?: string;
}

export type Stop = Anchor | PointOfInterest;

export interface Segment {
  /** libellé lisible, ex. "Trajet vers le centre (en transports)" ou "Boucle à pied" */
  label: string;
  mode: TravelMode;
  origin: Stop;
  destination: Stop;
  /** arrêts intermédiaires de CE segment (même mode de déplacement) */
  waypoints: PointOfInterest[];
  /**
   * un lien en temps normal ; plusieurs si plus de 9 waypoints
   * (limite des liens Google Maps) — les liens s'enchaînent.
   */
  googleMapsUrls: string[];
  /** estimation à vol d'oiseau, en km */
  distanceKm: number;
}

export interface ItineraryPlan {
  segments: Segment[];
  /** liste ordonnée complète des arrêts, tous segments confondus (dédoublonnée aux jonctions) */
  orderedStops: Stop[];
  /** total à vol d'oiseau, en km (somme des segments) */
  totalDistanceKm: number;
  isLoop: boolean;
}

export interface ApproachConfig {
  /**
   * là où commence réellement la partie à pied / à vélo en ville
   * (une gare, un parking, une place centrale…)
   */
  entry: Anchor;
  /** comment on rejoint `entry` depuis `start` (transit / bicycling / driving) */
  mode: TravelMode;
  /** ajoute un segment miroir entry -> start à la fin, dans le même mode */
  returnToStart?: boolean;
}

export interface PlanOptions {
  start: Anchor;
  pois: PointOfInterest[];
  /** mode utilisé à l'intérieur de la zone (walking / bicycling) */
  loopMode: TravelMode;
  /** referme la boucle sur le point de départ de la boucle (défaut : true) */
  loop?: boolean;
  /** pour un itinéraire A -> B (non bouclé), le point d'arrivée */
  finish?: Anchor;
  /** premier segment optionnel dans un autre mode (ex. transports jusqu'à la ville) */
  approach?: ApproachConfig;
  /** réordonne les POI pour le parcours le plus court raisonnable (défaut : true) */
  optimize?: boolean;
}
