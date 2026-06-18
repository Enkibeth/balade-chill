# CLAUDE.md

Guide pour travailler dans ce dépôt. Le projet est rédigé en français (UI,
commentaires, commits) — garde cette langue pour rester cohérent.

## Vue d'ensemble

**balade-chill** est une application Next.js (App Router) personnelle qui
réunit **trois parties indépendantes** sous une même coquille :

1. **Balade** — le cœur de l'app : un jeu de chasse au trésor à pied, avec
   étapes géolocalisées, énigmes chiffrées et missions, générées par IA.
2. **Lac Léman** — un module d'organisation de vacances au bord du lac
   (timeline d'évènements à ajouter/supprimer/filtrer/imprimer).
3. **Voyage Chine** — un module d'organisation de voyage avec carte
   interactive de la Chine.

Les parties Léman et Chine sont des **pages HTML statiques autonomes** dans
`public/`, volontairement hors du rendu React (voir plus bas). Seule la partie
Balade est une vraie application React/Next.

## Commandes

```bash
npm install          # installer les dépendances (lockfile: package-lock.json)
npm run dev          # serveur de dev (next dev)
npm run build        # build de production
npm run lint         # ESLint (config next)
npx tsc --noEmit     # vérification de types (pas de script dédié, mais fonctionne)
```

Il n'existe pas de suite de tests automatisés. Avant de pousser, lance au
minimum `npx tsc --noEmit` **et** `npm run lint` — les deux doivent passer sans
erreur.

### Variables d'environnement

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — connexion
  Supabase (requis).
- `NEXT_PUBLIC_MAPBOX_TOKEN` — jeton Mapbox (optionnel ; sinon le jeton est lu
  côté base via `/api/map-token`, voir partie Chine).
- Les clés API des fournisseurs d'IA **ne sont pas** des variables d'env :
  chaque utilisateur enregistre la sienne dans `user_settings` (page Réglages).

### Base de données

Schéma versionné dans `supabase/migrations/*.sql` (Postgres / Supabase, avec
RLS). À appliquer via Supabase. Tables principales : `users`, `balades`,
`balade_sessions`, `user_settings`.

## Stack

- **Next.js 14.2** (App Router) · **React 18** · **TypeScript 5** (strict)
- **Tailwind CSS 3.4** + thème clair/sombre par variables CSS (voir Conventions)
- **Supabase** (`@supabase/supabase-js` + `@supabase/ssr`) : Postgres + Auth
- **IA** : `@anthropic-ai/sdk` + `openai` (le SDK OpenAI sert aussi aux
  fournisseurs compatibles : Google Gemini, OpenAI, NVIDIA NIM, Groq)
- **Cartes** : `leaflet` + `react-leaflet` (tuiles raster), Mapbox côté Chine
- **Hors-ligne** : `idb` (IndexedDB) + service worker (PWA)
- Alias d'import : `@/*` → `src/*`

## Arborescence

```
src/
  app/
    (app)/            routes authentifiées : dashboard, generate, history,
                      settings, balade/[id], autre (= Léman)
    (auth)/           login, register
    api/              routes serveur : generate, generate-quiz, etape/regenerate,
                      geocode, map-token
    layout.tsx        layout racine + script de thème pré-paint
    globals.css       thème sombre (:root) + remaps thème clair (:root.light)
  components/
    balade/           UX de jeu : BaladeRunner, EtapeCard, CipherBlock,
                      ScoreSummary, ValidationScreen, EtapeEditor
    map/              cartes Leaflet : BaladeGlobe, RoutePreviewMap,
                      StartEndPicker, PointPicker
    ui/               Nav, ThemeToggle
    offline/          ServiceWorkerRegister, OfflineBanner, OfflineDownloadButton
  lib/
    ai/               abstraction des fournisseurs LLM (catalog, providers)
    claude/            prompts Anthropic + rendu HTML hors-ligne
    llm/              post-traitement : cipherCheck, geocode, geoValidate,
                      routeMath, refine, quiz, bonus, modelLimits, modelPricing
    supabase/         clients server/browser, requêtes, middleware auth
    offline/          cache IndexedDB
  hooks/              useTheme, useUser, useBaladeSession, useOffline
  types/              définitions TS (Balade, Etape, Enigme, etc.)
public/
  chine.html          page statique « Voyage Chine » (carte)
  leman.html          page statique « Lac Léman » (timeline d'évènements)
  manifest.json       manifeste PWA
supabase/migrations/  schéma SQL versionné
```

La navigation entre les trois parties se fait depuis `src/components/ui/Nav.tsx`
(liens : Carte, Générer, Historique, Réglages, **Léman**, **Chine**).

---

## Partie 1 — Balade (jeu de chasse au trésor)

Application React complète. Une *balade* est un parcours à pied composé
d'*étapes* ; chaque étape a un fragment d'histoire, une **énigme** chiffrée à
résoudre, une mission à réaliser, et un bonus optionnel (question médicale ou
thématique). Le tout est généré par IA puis jouable hors-ligne.

**Modèle de données** : voir `src/types/` (`Balade`, `Etape`, `Enigme`,
`MedicalBonus`, `BaladeSession`). Les types de chiffrement disponibles sont
l'union `EnigmeType` (Polybe, Morse, César, Vigenère, etc.) — `CipherBlock`
affiche la grille Polybe / la table Morse selon le type.

**Cycle de vie d'une balade :**

1. **Génération** — page `(app)/generate` (assistant multi-étapes, avec quiz
   d'orientation optionnel) → `POST /api/generate`.
2. **Pipeline IA** (`src/lib/ai/providers.ts`, prompts dans
   `src/lib/claude/`) : appel LLM → JSON de balade. Puis post-traitement dans
   `src/lib/llm/` : validation des énigmes (`cipherCheck`), géocodage des
   étapes sur de vrais POI (`geocode`, Nominatim), calcul des distances/temps
   de marche (`routeMath`), validation géographique (`geoValidate`), passe de
   *refine* optionnelle (`refine`). Rendu HTML hors-ligne via
   `src/lib/claude/render-html.ts` (stocké dans `balades.html_content`).
3. **Relecture / édition** — `(app)/balade/[id]?mode=preview` →
   `ValidationScreen` : réordonner les étapes, corriger textes/coordonnées,
   régénérer une étape (`POST /api/etape/regenerate`), puis publier.
4. **Jeu** — `(app)/balade/[id]` → `BaladeRunner` : on déroule les étapes, on
   résout les énigmes, on coche les missions, le score se calcule et la session
   est sauvegardée (`balade_sessions`) + mise en cache IndexedDB, avec synchro
   au retour du réseau. La logique de session vit dans
   `src/hooks/useBaladeSession.ts`.
5. **Historique / carte** — `(app)/history` (liste + scores) et
   `(app)/dashboard` (carte de toutes les balades, `BaladeGlobe`).

**Réglages IA** (`(app)/settings`) : chaque utilisateur choisit fournisseur /
modèle / clé pour le brouillon, et en option un modèle de *refine* et un modèle
de *quiz*. Catalogue des fournisseurs et modèles : `src/lib/ai/catalog.ts`.

---

## Partie 2 — Lac Léman (organisation de vacances)

Module d'organisation d'un séjour au bord du lac Léman : une **timeline
d'évènements** que l'on peut ajouter, supprimer et filtrer, avec une mise en
page imprimable.

- **Implémentation** : page **statique** `public/leman.html` (HTML/CSS/JS
  *vanilla*, sans React), avec son propre style (palette lac/corail/soleil) et
  des styles d'impression intégrés.
- **Intégration** : la route `(app)/autre/page.tsx` l'affiche dans une
  `<iframe>` (hauteur `calc(100vh - 56px)`), accessible via le lien **« Léman »**
  de la nav.
- Pour modifier cette partie, éditer directement `public/leman.html` — ce n'est
  pas du React et ça ne passe pas par le pipeline de build des composants.

---

## Partie 3 — Voyage Chine (carte interactive)

Module d'organisation d'un voyage en Chine, centré sur une **carte interactive**
avec des points d'intérêt.

- **Implémentation** : page **statique** `public/chine.html` (HTML/JS autonome,
  carte Leaflet + tuiles Mapbox). Volontairement servie **hors** de la coquille
  Next, d'où le lien de nav marqué `external: true` (`/chine.html?v=7`) qui fait
  une vraie navigation (balise `<a>`, pas `next/link`).
- **Jeton Mapbox** : la page statique n'a pas de session ni d'accès aux
  variables de build, donc elle récupère son jeton via `GET /api/map-token`
  (`src/app/api/map-token/route.ts`). Ce jeton vient soit de
  `NEXT_PUBLIC_MAPBOX_TOKEN`, soit du dernier jeton enregistré en base
  (`user_settings.mapbox_token`, exposé par une fonction SQL `SECURITY DEFINER`,
  cf. migration `003_shared_mapbox_token.sql`). Le jeton Mapbox `pk.` est public.
- Pour modifier cette partie, éditer `public/chine.html`. Le paramètre `?v=N`
  du lien sert de cache-buster — l'incrémenter après une modif.

---

## Infrastructure partagée & conventions

### Thème clair/sombre — IMPORTANT

L'app est **sombre par défaut** (palette sépia : `#1a0f08` / `#f3e7d3` / accents
ambre). Le mode clair (« parchemin ») est activé par la classe `.light` sur
`<html>`. Mécanique :

- Un **script inline pré-paint** dans `src/app/layout.tsx` ajoute `.light` avant
  le premier rendu (lecture de `localStorage.theme`) → **pas de flash**.
- `src/components/ui/ThemeToggle.tsx` bascule la classe et persiste le choix.
- `src/app/globals.css` *remappe* les classes Tailwind récurrentes sous
  `:root.light` (ex. `text-amber-100/80`, `bg-black/40`, `border-amber-200/20`)
  via des tokens (`--lt`, `--lh`, `--la`, `--lb`, `--ls`). **Préfère ce
  mécanisme CSS** pour rendre un composant theme-aware : il s'applique avant le
  paint, donc sans clignotement.

**Convention pour les couleurs hors-Tailwind** (styles `style={{}}` ou couleurs
sur mesure) : déclarer des **variables CSS** dans `globals.css` (valeur sombre
dans `:root`, override clair dans `:root.light`) et les référencer via
`var(--…)`. C'est le cas des variables `--cipher-*` (bloc énigme) et
`--dot-idle-*` (pastilles de progression du runner).

**N'utilise `useIsLight()` (`src/hooks/useTheme.ts`) qu'en dernier recours** —
uniquement pour ce qui n'est PAS thémable en CSS (typiquement les tuiles de
carte Leaflet, qui changent d'URL selon le thème). Ce hook lit le thème *après*
l'hydratation (`useState(false)` puis effet), donc il provoque un bref
**clignotement** (FOUC) sombre→clair sur les éléments concernés. Les composants
de `src/components/map/` l'utilisent légitimement ; le reste de l'app doit
passer par le CSS.

### Supabase & auth

- Clients : `src/lib/supabase/server.ts` (Server Components / routes, gère les
  cookies) et `client.ts` (Client Components). Middleware de rafraîchissement de
  session : `src/lib/supabase/middleware.ts`.
- Auth e-mail/mot de passe ; les routes `(app)/*` sont protégées. Les
  utilisateurs peuvent se lier en couple (`partner_id`) — voir migration
  `001_init.sql`. Politiques RLS : lecture de ses propres données (et celles du
  partenaire), écriture de ses propres lignes uniquement.
- Requêtes centralisées dans `src/lib/supabase/queries.ts`.

### Cartes (Leaflet)

`src/components/map/` : `BaladeGlobe` (toutes les balades), `RoutePreviewMap`
(une balade), `StartEndPicker` / `PointPicker` (choix des points de départ/arrivée
à la génération, géocodage Nominatim via `/api/geocode`). Bascule des tuiles
clair/sombre via `useIsLight()`.

### Hors-ligne (PWA)

`src/lib/offline/` (IndexedDB via `idb`) met en cache balades + sessions et met
en file d'attente les scores à synchroniser. `src/hooks/useOffline.ts` suit
l'état en ligne/hors-ligne ; `OfflineBanner` / `OfflineDownloadButton` côté UI ;
manifeste PWA dans `public/manifest.json`.

## Notes de style

- Code et UI en français ; suis la densité de commentaires et les conventions de
  nommage du code environnant.
- Les composants serveur n'ont pas `'use client'` ; ne l'ajoute que si le
  composant utilise un hook/état/API navigateur.
- Imports via l'alias `@/…`.
