---
description: Tâche en boucle vérifiée jusqu'à livraison, porte dure armée
argument-hint: [description de la tâche]
---
Tâche : $ARGUMENTS

Mode strict — applique le contrat opératoire, porte dure incluse :
1. Reformule la tâche en auto-prompt (domaine, cadre expert, critère de "fini") en 1 ligne.
2. Arme la porte : crée `.claude/loop-active` (touch).
3. Délègue lecture / recherche / exécution des tests au sous-agent `mecano` (Haiku) quand c'est rentable.
4. Implémente complètement. Aucun TODO, aucun contournement.
5. Boucle test→correction jusqu'au vert intégral (tests + types + lint). Corrige la CAUSE ;
   ne modifie/supprime JAMAIS un test pour passer.
6. Auto-critique honnête en fin (risques, dette, hypothèses) + note /10.
7. Retire `.claude/loop-active` une fois vert.
Ne me rends la main qu'une fois la porte franchie.
