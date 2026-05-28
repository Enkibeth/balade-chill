# Generation Audit (Phase 0)

Date: 2026-05-28

## Fichiers clés inspectés
- `src/app/api/generate/route.ts`
- `src/lib/ai/providers.ts`
- `src/lib/claude/generation-prompt.ts`
- `src/lib/claude/render-html.ts`
- `src/app/(app)/generate/page.tsx`
- `DEPLOYMENT.md`

## Flow actuel
1. Le frontend (`/generate`) envoie un POST sur `/api/generate`.
2. `route.ts` valide le payload puis choisit provider/model via `user_settings`.
3. `generateBaladeText` appelle Anthropic (stream) ou OpenAI-compatible providers.
4. Le parsing est fait par `extractJson`: trim + strip markdown fences + slice premier `{`/dernier `}` + `JSON.parse`.
5. Les données sont normalisées puis transformées en `Balade`.
6. `renderBaladeHtml` régénère le HTML puis `saveGeneratedBalade` persiste en DB.

## Fragilités
- Parsing fragile (`extractJson`) sans classification fine des erreurs.
- Aucun schéma strict (pas de Zod), validation implicite partielle.
- `max_tokens` hardcodés (`16000` Anthropic, `8000` autres).
- Peu d’observabilité coût/tokens/latence/retry.
- Pas d’estimation coût avant génération.
- Pas de stratégie explicite par difficulté/tier.

## Coûts estimés (état actuel)
- Référence DEPLOYMENT: ~4k input + ~16k output Claude Sonnet ~0.25 USD.
- Message produit fourni: potentiellement ~6k input + ~24k output sur certains cas (~0.33–0.50€).
- Driver principal du coût: output tokens.

## Endroits exacts à modifier
- Parsing/validation: `src/app/api/generate/route.ts` (remplacer `extractJson`).
- Providers + limites: `src/lib/ai/providers.ts` + nouveaux `src/lib/llm/modelLimits.ts`.
- Observabilité coût: nouveaux `src/lib/llm/modelPricing.ts` + instrumentation dans providers + route.
- Structured output abstraction: nouvelle couche `src/lib/llm/generateStructuredObject.ts`.
- Docs déploiement/archi: `DEPLOYMENT.md` + nouveaux docs d’architecture.

## Contraintes produit identifiées
- Vercel timeout: `/api/generate` expose `maxDuration=300`, mais Hobby peut couper à 60s.
- Les clés API sont actuellement possibles via `user_settings.ai_api_key` (config utilisateur).
- Le flow est synchrone; une génération longue bloque la réponse.
