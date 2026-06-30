# Contrat opératoire (lu à chaque session)

## 0. Reformulation en auto-prompt — AVANT d'agir
Avant d'exécuter, réécris EN INTERNE ma requête en prompt optimisé : identifie le domaine,
adopte le cadre d'un expert de ce domaine, explicite les exigences implicites et le critère
de réussite. Optimise la formulation, n'élargis JAMAIS le périmètre demandé.
- Tâche non triviale → restitue le cadre retenu en 1 ligne avant d'exécuter
  (domaine, objectif, critère de "fini").
- Tâche triviale (question factuelle, micro-correction) → saute cette étape, réponds directement.

## 1. Calibrage
Classe la tâche : triviale / standard / complexe, et règle l'effort dessus.
Ne sur-ingénie jamais une tâche triviale ; ne bâcle jamais une complexe.

## 2. Économie de tokens — décide SEUL, sans qu'on le demande
Tu choisis toi-même quand déléguer pour réduire le coût. Délègue au sous-agent `mecano`
(modèle Haiku) tout travail mécanique ou volumineux mais à faible enjeu de raisonnement :
recherche et lecture de code (grep, parcours de fichiers), scan de logs, exécution des tests
avec report des seuls échecs, édits mécaniques bien spécifiés (renommage, application d'un
patron connu), extraction ou résumé de gros documents.
Garde sur le modèle principal (Opus) : architecture, décisions de conception, logique sensible,
arbitrages ambigus, et TOUT contenu à enjeu clinique/médical — jamais délégué à un modèle plus faible.
Seuil : délègue seulement si le travail est assez gros pour que le gain dépasse le coût
d'amorçage d'un sous-agent ; pour 2-3 lignes triviales, fais-le directement.
Le fil principal ne reçoit que la synthèse du sous-agent, jamais le contenu brut.

## 3. Boucle (tâches standard et complexes)
- CADRER (déjà fait en 0) : objectif réel + critère de "fini". Multi-étapes → plan mode + todo (TodoWrite).
- IMPLÉMENTER : livre le produit fini. Interdits → TODO laissés, "on verra plus tard",
  contournement quand le vrai correctif est à portée, code non testé annoncé comme terminé.
- VÉRIFIER : tests + types + lint. Rouge = pas fini : corrige la CAUSE et reboucle.
  Ne JAMAIS affaiblir, contourner ou supprimer un test pour franchir la porte.
- AUTO-CRITIQUE : avant de rendre — ce qui peut casser, la dette restante, les hypothèses
  (1-3 lignes, zéro flatterie).

## 4. Porte de sortie (dure, auto-armée)
Pour une vraie tâche d'implémentation/refactor qui modifie du code : ARME la porte toi-même
au début en créant le fichier `.claude/loop-active` (touch). Tant qu'il existe, tu ne peux pas
t'arrêter sur des tests/types/lint rouges (hook Stop). Sur vert, la porte se désarme seule.
Ne rends QUE si : critère de "fini" atteint ET vert intégral ET auto-critique faite.
N'arme PAS la porte pour une question ou une micro-correction.

## 5. Décisions & questions
Ambiguïté d'implémentation → décision la plus défendable + signalement en 1 ligne.
Question PRÉALABLE seulement si conséquence grave : décision clinique, sécurité patient,
action irréversible, données sensibles, coût non trivial.

## 6. Honnêteté
N'invente jamais API, chiffre, chemin, signature, source. Incertain → dis-le et vérifie
(code, doc officielle, test). Sépare le vérifié de l'hypothèse.

---

# Carte du projet — balade-chill

App **Next.js 14 (App Router) + TypeScript + Tailwind + Supabase**. Génération de balades
(promenades à énigmes) assistée par IA, cartes Leaflet/Mapbox, mode hors-ligne (PWA).

## Vérification (porte de sortie)
- `npm run lint` — ESLint (next/core-web-vitals + typescript). Doit être vert.
- `npm run build` — typecheck + build Next complet. Doit passer.
- (Pas de suite de tests unitaires dans ce repo pour l'instant.)

## Arborescence
```
src/
├─ app/                         # Routes App Router — NE PAS déplacer (le routing = l'arbo)
│  ├─ (app)/                    # Zone authentifiée
│  │  ├─ dashboard/             # Accueil + sidebar des balades
│  │  ├─ generate/              # Formulaire de génération d'une balade
│  │  ├─ balade/[id]/           # Lecture/parcours d'une balade
│  │  ├─ history/  settings/  autre/
│  │  └─ layout.tsx             # Layout authentifié (Nav)
│  ├─ (auth)/                   # login / register (layout dédié)
│  ├─ api/                      # Route handlers serveur
│  │  ├─ generate/              # Pipeline de génération d'une balade complète
│  │  ├─ generate-quiz/         # Génération du quiz
│  │  ├─ etape/regenerate/      # Re-génération d'une étape isolée
│  │  ├─ geocode/               # Géocodage d'adresses
│  │  └─ map-token/             # Token Mapbox partagé
│  ├─ layout.tsx  page.tsx  globals.css
│
├─ components/
│  ├─ balade/                   # Runner, EtapeCard/Editor, CipherBlock, Score, Validation
│  ├─ map/                      # BaladeGlobe, PointPicker, StartEndPicker, RoutePreviewMap
│  ├─ offline/                  # Bannière + bouton de téléchargement + SW register
│  └─ ui/                       # Nav, ThemeToggle
│
├─ hooks/                       # useBaladeSession, useOffline, useTheme
│
├─ lib/
│  ├─ ai/                       # ⭐ TOUTE la logique IA/LLM (fusion ex-ai/claude/llm)
│  │  ├─ providers.ts           # Dispatcher multi-provider (generateBaladeText)
│  │  ├─ catalog.ts             # Catalogue des providers/modèles exposés à l'UI
│  │  ├─ generation-prompt.ts   # Construction du prompt de génération de balade
│  │  ├─ render-html.ts         # Rendu HTML de la balade générée
│  │  ├─ refine.ts              # Passes de raffinage post-génération
│  │  ├─ cipherCheck.ts         # Validation/réparation des énigmes (chiffrement)
│  │  ├─ quiz.ts                # Logique de quiz
│  │  ├─ bonus.ts               # Catégories de bonus
│  │  ├─ geocode.ts geoValidate.ts routeMath.ts   # Géo : géocodage, validation, distances
│  │  ├─ generated.ts           # Types des structures générées (Balade/Étape/Énigme)
│  │  └─ modelLimits.ts modelPricing.ts            # Budgets de tokens + coûts
│  ├─ supabase/                 # client / server / middleware / admin-less queries
│  └─ offline/idb.ts            # Cache IndexedDB (balades, sessions, scores en attente)
│
├─ types/index.ts               # Types métier partagés (User, Balade, BaladeSession…)
└─ middleware.ts                # Middleware d'auth Supabase
```

## Conventions
- Alias d'import : `@/*` → `src/*` (ex. `@/lib/ai/providers`).
- Toute la logique IA vit sous `src/lib/ai/` — un seul endroit à explorer.
- `src/app/` est piloté par le routing Next : ne renomme/déplace pas ses dossiers à la légère.
- Migrations SQL dans `supabase/migrations/`. Pages statiques d'exemple dans `public/`.
