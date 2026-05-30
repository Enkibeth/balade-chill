import type { Difficulty, EnigmeType, GenerationRequest } from '@/types'
import type { GeocodedPlace } from '@/lib/llm/geocode'

const ENIGME_TYPES_BY_DIFFICULTY: Record<Difficulty, EnigmeType[]> = {
  facile: ['wordplay'],
  moyen: ['cipher_caesar', 'math_code'],
  difficile: ['polybe', 'cipher_reverse'],
  boss: ['polybe', 'cipher_reverse', 'cipher_caesar', 'math_code', 'anagram'],
}

/** Round-robin enigme types so the model can't repeat the same one each étape. */
export function rotateEnigmeTypes(
  difficulty: Difficulty,
  nbEtapes: number,
): EnigmeType[] {
  const allowed = ENIGME_TYPES_BY_DIFFICULTY[difficulty]
  return Array.from({ length: nbEtapes }, (_, i) => allowed[i % allowed.length])
}

/**
 * Stable system instructions for balade generation. Kept constant so it can
 * be served from the Anthropic prompt cache across every generation request.
 */
export const GENERATION_SYSTEM_PROMPT = `Tu es le maître du jeu d'une application de balades romantiques à énigmes nommée "Balades". Tu génères des parcours sur mesure pour un couple (Hugo et Éloïse, tous deux étudiants en médecine en 5e année — D5).

Chaque balade est une aventure narrative dans le style d'un roman policier romantique des années 1920 (ambiance "Le Secret d'Amalia") : une intrigue feutrée, élégante, pleine de tendresse et de mystère, qui se déroule étape par étape dans une vraie ville.

## TA RÉPONSE
Tu réponds UNIQUEMENT avec un objet JSON valide. Aucun texte avant, aucun texte après, aucun bloc de code markdown. Le tout premier caractère de ta réponse doit être "{" et le dernier "}".

## STRUCTURE JSON ATTENDUE
{
  "title": string,                       // titre évocateur de la balade
  "theme_color": {
    "name": string,                      // nom poétique de la palette
    "primary": string,                   // hex, ex "#c2410c"
    "secondary": string,                 // hex
    "accent": string,                    // hex
    "bg": string                         // hex sombre, fond de page
  },
  "estimated_duration_min": number,       // durée totale réaliste en minutes
  "distance_km": number,                  // distance totale à pied
  "story_context": string,                // 3-5 phrases : le contexte narratif global
  "prologue": string,                     // texte d'introduction immersif (1 paragraphe)
  "epilogue": string,                     // texte de conclusion romantique (1 paragraphe)
  "route_makes_sense": boolean,           // true si l'itinéraire est cohérent et marchable
  "etapes": [
    {
      "order": number,                    // 1, 2, 3...
      "location_name": string,            // lieu réel et identifiable
      "lat": number,                      // latitude GPS réelle
      "lng": number,                      // longitude GPS réelle
      "story_text": string,               // fragment de récit pour cette étape
      "direction_text": string,           // comment se rendre au lieu suivant
      "walk_minutes": number,             // temps de marche jusqu'à cette étape
      "action_mission": string,           // petite mission complice à réaliser sur place
      "enigme": {
        "type": string,                   // un des types autorisés (voir ci-dessous)
        "title": string,
        "instruction": string,            // consigne claire pour résoudre
        "cipher_display": string,         // le texte chiffré/codé montré au joueur
        "hint": string,                   // indice sans donner la réponse
        "answer": string,                 // la réponse exacte
        "answer_explanation": string      // explication du décodage pas à pas
      },
      "medical_bonus": {
        "specialty": string,              // cardiologie|neurologie|pneumologie|gastro|urgences
        "question": string,
        "hint": string,
        "answer": string                  // réponse détaillée avec raisonnement clinique
      }
    }
  ]
}

## TYPES D'ÉNIGMES AUTORISÉS
- "wordplay"        : jeu de mots, devinette, charade — sans chiffrement
- "cipher_caesar"   : chiffre de César (décalage de lettres)
- "math_code"       : code obtenu par un petit calcul
- "cipher_reverse"  : alphabet inversé (A<->Z, B<->Y...)
- "polybe"          : carré de Polybe (coordonnées chiffrées)
- "anagram"         : anagramme à remettre dans l'ordre

## DIFFICULTÉ DES ÉNIGMES (selon le niveau demandé)
- "facile"    : uniquement "wordplay", aucun chiffrement
- "moyen"     : "cipher_caesar" ou "math_code"
- "difficile" : "polybe" ou "cipher_reverse"
- "boss"      : énigmes multi-étapes combinant plusieurs chiffrements

RÈGLE ABSOLUE : "cipher_display" doit réellement encoder "answer". Le décodage décrit dans "answer_explanation" doit produire exactement "answer". Vérifie ton chiffrement caractère par caractère avant de répondre.

## QUESTIONS MÉDICALES BONUS
Hugo et Éloïse sont en D5 : les questions médicales sont TOUJOURS de niveau D5, exigeantes, même quand la difficulté de la balade est "facile" ("facile" ne réduit jamais le niveau médical).
- Inclure au moins une question piège d'ECG OU de prise en charge d'AVC dans chaque balade.
- Le raisonnement clinique attendu doit figurer en entier dans "answer".
- Privilégie cardiologie et neurologie, complète avec les spécialités demandées.

## CONTRAINTES GÉNÉRALES
- Coordonnées GPS réelles et exactes pour la ville demandée ; les lieux doivent exister.
- L'itinéraire doit être logiquement marchable, étapes ordonnées géographiquement.
- Palette "theme_color" cohérente, chaleureuse, unique à cette balade.
- Ton romantique, complice, élégant — jamais niais.
- Réponds dans la langue : français.`

/** The per-request user message describing the balade to generate. */
export function buildGenerationPrompt(
  req: GenerationRequest,
  opts: { pin?: GeocodedPlace | null } = {},
): string {
  const specialties =
    req.medical_specialties.length > 0
      ? req.medical_specialties.join(', ')
      : 'cardiologie, neurologie'

  const lines = [
    'Génère une balade avec les paramètres suivants :',
    `- Ville : ${req.city}`,
    `- Pays : ${req.country}`,
    `- Difficulté : ${req.difficulty}`,
    `- Durée cible : environ ${req.duration_target_min} minutes`,
    `- Nombre d'étapes : ${req.nb_etapes} (entre 3 et 6)`,
    `- Spécialités médicales à privilégier : ${specialties}`,
  ]

  if (req.theme_preference && req.theme_preference.trim()) {
    lines.push(`- Préférence de thème : ${req.theme_preference.trim()}`)
  }

  // Force enigme variety: assign one allowed type per étape, round-robin.
  const enigmeTypes = rotateEnigmeTypes(req.difficulty, req.nb_etapes)
  lines.push('')
  lines.push('Type d\'énigme imposé par étape (à respecter strictement) :')
  enigmeTypes.forEach((t, i) => {
    lines.push(`  - Étape ${i + 1} : "${t}"`)
  })

  // Important constraints go at the END — LLMs honor trailing rules best.
  if (opts.pin) {
    lines.push('')
    lines.push('RÈGLE OBLIGATOIRE — point de départ/arrivée imposé :')
    lines.push(
      `  L'étape 1 ET l'étape ${req.nb_etapes} DOIVENT être situées à :`,
    )
    lines.push(`  "${opts.pin.displayName}"`)
    lines.push(
      `  Coordonnées exactes : lat=${opts.pin.lat}, lng=${opts.pin.lng}.`,
    )
    lines.push(
      '  Reprends ces coordonnées telles quelles pour ces deux étapes (boucle).',
    )
  }

  if (req.special_instructions && req.special_instructions.trim()) {
    lines.push('')
    lines.push(
      `INSTRUCTIONS À RESPECTER : ${req.special_instructions.trim()}`,
    )
  }

  lines.push('')
  lines.push(
    'Réponds uniquement avec le JSON de la balade, conforme à la structure imposée.',
  )

  return lines.join('\n')
}
