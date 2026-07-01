// src/lib/ai/parcours/types.ts
// Types du mode « Parcours » : une visite guidée d'une ville à partir des lieux
// choisis par l'utilisateur. Contrairement aux balades à énigmes, chaque arrêt
// porte seulement une anecdote et une petite question de culture (pas de
// chiffrement). L'ordre et les liens Google Maps viennent du moteur
// d'itinéraires (src/lib/ai/itinerary).

/** Requête envoyée par le formulaire de création de parcours. */
export interface ParcoursRequest {
  city: string
  country: string
  /** durée cible de la visite, en minutes */
  duration_target_min: number
  /** liste libre des lieux à voir, un par ligne côté UI */
  places: string[]
  /** adresse de départ (texte géocodé). Vide ⇒ premier lieu de la liste. */
  start_address?: string
  /** adresse d'arrivée. Vide ⇒ retour au départ si boucle, sinon dernier lieu. */
  end_address?: string
  /** referme le parcours sur le point de départ (défaut : true) */
  loop: boolean
  /** garde l'ordre saisi par l'utilisateur au lieu d'optimiser (défaut : false) */
  keep_order: boolean
}

/** Un arrêt résolu (géocodé) du parcours, dans l'ordre final. */
export interface ParcoursStop {
  /** nom affiché (libellé court du lieu) */
  name: string
  lat: number
  lng: number
  /** anecdote courte écrite par le modèle (2-4 phrases) */
  anecdote: string
  /** petite question de culture liée au lieu */
  question: string
  /** réponse à la question */
  answer: string
}

/** Résultat complet d'une génération de parcours. */
export interface GeneratedParcours {
  title: string
  intro: string
  city: string
  country: string
  stops: ParcoursStop[]
  /** liens Google Maps nommés, dans l'ordre (plusieurs si > 9 arrêts) */
  google_maps_urls: string[]
  distance_km: number
  estimated_duration_min: number
  is_loop: boolean
  /** lieux saisis mais introuvables au géocodage (signalés à l'utilisateur) */
  unresolved: string[]
}

/** Ce que le modèle doit renvoyer : titre, intro, et le texte par arrêt. */
export interface ParcoursLLMOutput {
  title: string
  intro: string
  stops: Array<{
    name: string
    anecdote: string
    question: string
    answer: string
  }>
}
