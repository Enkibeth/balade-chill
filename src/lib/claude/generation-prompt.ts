import type { Difficulty, EnigmeType, GenerationRequest } from '@/types'
import type { GeocodedPlace } from '@/lib/llm/geocode'
import { computeWalkBudget } from '@/lib/llm/routeMath'

const ENIGME_TYPES_BY_DIFFICULTY: Record<Difficulty, EnigmeType[]> = {
  // "facile" = jeux de langage, aucun chiffrement à décoder.
  facile: ['wordplay', 'charade', 'riddle', 'rebus', 'acrostiche'],
  // "moyen" = substitutions légères et petits calculs.
  moyen: ['cipher_caesar', 'math_code', 'a1z26', 'morse', 'anagram'],
  // "difficile" = chiffrements plus exigeants.
  difficile: ['polybe', 'cipher_reverse', 'vigenere', 'morse'],
  // "boss" = tout le répertoire, enchaîné.
  boss: [
    'polybe',
    'cipher_reverse',
    'cipher_caesar',
    'vigenere',
    'math_code',
    'anagram',
    'a1z26',
    'morse',
  ],
}

/** Fisher-Yates shuffle on a copy — used to vary the enigme order per balade. */
function shuffle<T>(arr: readonly T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Assigns one allowed enigme type per étape. The pool is shuffled first so two
 * balades of the same difficulty don't open with the same puzzle, then walked
 * round-robin so consecutive étapes never repeat a type (until the pool is
 * exhausted).
 */
export function rotateEnigmeTypes(
  difficulty: Difficulty,
  nbEtapes: number,
): EnigmeType[] {
  const allowed = shuffle(ENIGME_TYPES_BY_DIFFICULTY[difficulty])
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
Jeux de langage (pas de chiffrement — mets l'énoncé du jeu dans "cipher_display") :
- "wordplay"        : jeu de mots ou devinette courte
- "charade"         : charade classique ("Mon premier… mon deuxième… mon tout…")
- "riddle"          : devinette poétique / énigme à deviner
- "rebus"           : rébus décrit en toutes lettres (sons et images)
- "acrostiche"      : petit poème dont l'initiale de chaque vers épelle la réponse
Chiffrements et codes (le code va dans "cipher_display") :
- "cipher_caesar"   : chiffre de César (décalage de lettres)
- "cipher_reverse"  : alphabet inversé (A<->Z, B<->Y...)
- "math_code"       : code obtenu par un petit calcul
- "anagram"         : anagramme à remettre dans l'ordre
- "morse"           : code Morse (points et traits, espace entre lettres, "/" entre mots)
- "a1z26"           : substitution A1Z26 (A=1, B=2, …, Z=26), nombres séparés par des tirets
- "polybe"          : carré de Polybe (coordonnées chiffrées)
- "vigenere"        : chiffre de Vigenère — DONNE TOUJOURS le mot-clé dans "instruction"

## DIFFICULTÉ DES ÉNIGMES (selon le niveau demandé)
- "facile"    : uniquement des jeux de langage ("wordplay", "charade", "riddle", "rebus", "acrostiche"), aucun chiffrement
- "moyen"     : substitutions légères ("cipher_caesar", "a1z26", "morse", "anagram") ou "math_code"
- "difficile" : chiffrements exigeants ("polybe", "cipher_reverse", "vigenere", "morse")
- "boss"      : tout le répertoire, énigmes plus longues combinant plusieurs chiffrements

Le type imposé par étape (voir le message ci-dessous) prime : respecte-le strictement, ne le remplace jamais par un autre.

RÈGLE ABSOLUE : pour tout type chiffré, "cipher_display" doit réellement encoder "answer". Le décodage décrit dans "answer_explanation" doit produire exactement "answer". Vérifie ton chiffrement caractère par caractère avant de répondre. Pour "vigenere", le mot-clé utilisé doit apparaître dans "instruction". Pour les jeux de langage, "answer" est le mot/lieu à trouver et "cipher_display" contient l'énoncé du jeu.

## QUESTIONS MÉDICALES BONUS
Hugo et Éloïse sont en D5 : les questions médicales sont TOUJOURS de niveau D5, exigeantes, même quand la difficulté de la balade est "facile" ("facile" ne réduit jamais le niveau médical).
- Inclure au moins une question piège d'ECG OU de prise en charge d'AVC dans chaque balade.
- Le raisonnement clinique attendu doit figurer en entier dans "answer".
- Privilégie cardiologie et neurologie, complète avec les spécialités demandées.

## DISTANCES & MARCHABILITÉ (RÈGLE CRITIQUE)
La balade se fait INTÉGRALEMENT à pied. L'erreur la plus fréquente — et rédhibitoire — est de choisir des lieux trop éloignés : le parcours devient infaisable dans le temps imparti et la balade est AUTOMATIQUEMENT REJETÉE.
- La distance totale à pied (somme des tronçons entre étapes consécutives) doit tenir dans le budget de marche de la durée demandée (≈ 5 km/h, sachant qu'une partie du temps est passée sur place à résoudre les énigmes). Le message ci-dessous te donne les plafonds chiffrés exacts à respecter.
- Choisis des lieux RÉELLEMENT proches les uns des autres : deux étapes consécutives doivent être à quelques minutes de marche, jamais à l'autre bout de la ville.
- Toutes les étapes tiennent dans un même quartier / périmètre restreint autour du point de départ. Mieux vaut des lieux moins célèbres mais proches que des monuments dispersés.
- AVANT DE RÉPONDRE : estime la distance (à vol d'oiseau) entre chaque paire d'étapes consécutives, additionne-les, et vérifie que le total respecte le plafond. Si ça dépasse, RAPPROCHE les lieux jusqu'à rentrer dans le budget.
- Coordonnées GPS exactes : une seule coordonnée erronée gonfle artificiellement la distance et fait échouer la validation.

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

  if (req.quiz_answers && req.quiz_answers.length > 0) {
    lines.push('')
    lines.push('Préférences détaillées (réponses du joueur, à respecter) :')
    for (const a of req.quiz_answers) {
      lines.push(`- ${a.question_label} → ${a.option_label}`)
    }
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

  // Concrete, computed distance ceilings — same budget the validator enforces.
  // Trailing position + exact numbers make even strong models keep stops close.
  const budget = computeWalkBudget(req.duration_target_min, req.nb_etapes)
  lines.push('')
  lines.push('CONTRAINTE DE DISTANCE (impérative — balade entièrement à pied) :')
  lines.push(
    `  - Distance totale à pied sur tout le parcours : ≤ ~${budget.targetWalkKm} km.`,
  )
  lines.push(
    `  - Entre deux étapes consécutives : ≤ ~${budget.maxLegWalkKm} km (≈ ${budget.maxLegWalkMin} min de marche).`,
  )
  lines.push(
    `  - Toutes les étapes dans un rayon d'environ ${budget.radiusWalkKm} km autour du point de départ.`,
  )
  lines.push(
    '  Additionne les distances entre étapes avant de répondre ; si le total dépasse, rapproche les lieux jusqu\'à rentrer dans le budget.',
  )

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
