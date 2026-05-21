# Déploiement — Balades

Guide pas à pas pour mettre l'application en production. Tu auras besoin
d'un compte **Supabase**, d'un compte **Vercel**, d'une clé **Anthropic**
et d'un token **Mapbox**.

---

## 1. Supabase

1. Crée un projet sur [supabase.com](https://supabase.com).
2. Ouvre **SQL Editor** → colle le contenu de
   `supabase/migrations/001_init.sql` → **Run**.
   (Ou, avec la CLI Supabase liée au projet : `npx supabase db push`.)
3. **Authentication → Providers → Email** : active *Email*. Pour Hugo &
   Éloïse, il est recommandé de **désactiver "Confirm email"** (sinon
   l'inscription demande une confirmation par mail — l'app gère les deux
   cas, mais sans confirmation le parcours est immédiat).
4. **Project Settings → API** : récupère
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (secret — jamais côté client)

Le trigger `handle_new_user` crée automatiquement la ligne `public.users`
à l'inscription et relie les partenaires (email du partenaire fourni au
register, dans un sens comme dans l'autre).

## 2. Clés externes

- **Anthropic** : crée une clé sur [console.anthropic.com](https://console.anthropic.com)
  → `ANTHROPIC_API_KEY`.
- **Mapbox** : crée un token public sur [account.mapbox.com](https://account.mapbox.com)
  → `NEXT_PUBLIC_MAPBOX_TOKEN`. (Sans token, la carte affiche un repli ;
  l'app reste fonctionnelle.)

## 3. Variables d'environnement

Toutes les variables (voir `.env.local.example`) :

| Variable | Usage |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL du projet Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé anon publique |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé service-role (API routes uniquement) |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Token Mapbox (globe 3D) |
| `ANTHROPIC_API_KEY` | Génération des balades |
| `NEXT_PUBLIC_APP_URL` | URL publique de l'app |

En local : copie `.env.local.example` vers `.env.local` et remplis-la.

## 4. Vérification locale

```sh
npm install
npx tsc --noEmit      # aucun type error
npm run build         # build de production OK
```

## 5. Déploiement Vercel

```sh
npx vercel            # lie le projet (1re fois)
# Ajoute les 6 variables ci-dessus dans Vercel :
#   Project Settings → Environment Variables
npx vercel --prod
```

> ⚠️ La route `/api/generate` est configurée avec `maxDuration = 300`.
> Sur le plan **Hobby**, Vercel plafonne à 60 s : une génération longue
> peut être coupée. Le plan **Pro** est recommandé pour laisser jusqu'à
> 300 s.

## 6. Smoke test (manuel, sur l'URL de prod)

- [ ] Inscrire deux comptes (Hugo + Éloïse), les lier comme partenaires
- [ ] Générer une balade à Paris, difficulté = difficile
- [ ] Valider l'itinéraire → démarrer la balade
- [ ] Compléter 2 étapes, cocher les scores
- [ ] Vérifier que le globe du tableau de bord affiche la balade
- [ ] Activer le mode hors ligne (DevTools) → finir les étapes restantes
- [ ] Se reconnecter → vérifier la synchronisation des scores dans Supabase

---

## Coûts indicatifs

- Génération d'une balade : ~4 k tokens entrée + ~16 k sortie sur
  Claude Sonnet 4.6 ≈ 0,25 $ / balade (le prompt système est mis en
  cache, ce qui réduit le coût des générations suivantes).
- Supabase / Mapbox : les offres gratuites suffisent pour un usage
  personnel à deux.
