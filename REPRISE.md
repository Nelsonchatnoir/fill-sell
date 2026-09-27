# REPRISE — passation du 27/09 soir (Claude → Codex)

> Relancer en disant « reprends REPRISE.md ». Détail : `docs/agents/etat-2026-09-27.md`
> § 7.6 (lot « synchronisation parfaite ») et § 7.7 (titre ≠ preuve, CE QUI RESTE).
> Base chargée : requêtes légères, LIMIT, une lourde à la fois. Heures de Paris.

## Règles définitives posées ce soir (AGENTS.md § 4.1, 4.2, 4.5)
1. **Un titre n'est jamais une preuve d'identité** : ni pour rattacher, ni pour
   fusionner automatiquement, ni pour retirer. Le doute = question.
2. **Deux annonces sur la même plateforme sont deux exemplaires** ; une vente ne
   retire que les copies de CET exemplaire sur les AUTRES plateformes, liées par
   une preuve (`retrait_job_prouve` : dépôt FillSell, identifiant, import, geste).
3. **Aucun verdict sur un relevé incomplet** (`[incomplet]` ou lu < annoncé) ; un
   relevé incomplet est repris seul (2 fois / 6 h).
4. **Un champ manquant se demande** (choix fermés en français), il ne se relance pas.
5. **Republier une annonce importée est normal** ; « import ≠ publication »
   ne concerne que le comptage.

## Fait ce soir (tout est appliqué, commité, poussé)
- Migrations : 20260927223000, 224500, 230000, 231500, 233000, 233500 (GO),
  234000, 234500 (GO), 235000, 20260928001000, 002000.
- Fonctions : update-job-status v92, get-pending-jobs v150.
- OTA 2.9.30 servie (canal production). Web : poussé sur main.
- Extension 0.6.75 construite : `build\CWS-0.6.75-A-TELEVERSER\fillsell-extension-0.6.75-cws.zip`
  (0.6.74 archivée dans `build\anciens-zips\`).

## Ce qui reste, dans l'ordre (détail § 7.7)
1. Nico : téléverser la 0.6.75 sur le CWS ; après acceptation, ALREADY_PUBLISHED +
   `EXTENSION_MIN_BUILD = '2026-09-27T20:16:30Z'`.
2. Louis : 2 annonces Beebs retirées à tort (34058194, 32750442), captures complètes —
   remise en ligne sur GO (recréer la fiche depuis la capture, puis dépôt Beebs).
   Ne pas écrire à Louis.
3. nicolas.menar (4) et thomas.vinted590002 (1) : retraits par titre exécutés, à trancher.
4. Vinted : 1 126 fiches « actives » non revues — 712 republiées HORS FillSell (jumelle
   de même titre créée par la synchro), 408 disparues ; garde « effondrement » à revoir ;
   fusions = GO.
5. Stepper : taille non demandée pour une fiche Lens (rayons non résolus au contrôle).
6. Opla : gigoteuse neutre rangée « garçons » → poser « Filles ou Garçons ? ».
7. Parcours nouvel inscrit : avec Nico (pas de création de compte en automatisation).
8. Surveiller le volume des questions « Est-ce le même article ? ».
9. 12 autotests déjà rouges avant le lot (liste § 7.7).
