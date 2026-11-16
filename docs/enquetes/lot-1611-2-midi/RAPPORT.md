# Lot du 16/11/2026 midi — zéro plainte client (ordre de Nico)

Heure de Paris. Diagnostics des points 4, 5, 6, 7, 8 et 11 faits par cinq agents en lecture seule (rapports complets dans
`.tmp-terminal/p4` … `p8`, vidé en fin de bloc : les éléments utiles sont repris ici). Points 1, 2, 3, 9, 10 et tous les
correctifs faits ici.

## 1. Essai Cloud impossible sur iPhone (URGENT)

**1.a Cause (case cachée).** La case des conditions (z-index 1250) s'ouvrait DERRIÈRE le parcours d'entrée (9980) : le
correctif du 04/11 ne baissait le parcours que pendant l'achat du Cloud SEUL (`c.cloud.achat`), pas d'une formule
(`c.formules.achat`). rachidafarhi54 (16/11) : essai demandé à 09:02:10, case invisible, étape passée à 09:03:08, parcours
fini à 09:03:31, case acceptée à 09:03:34 sur le Tableau — l'achat est parti d'un écran démonté (même chose pour d4929a4e
le 15/11). **Correctif** : la case est au-dessus de tout (`Z_CONDITIONS` 10060) ; le parcours passe dessous pendant tout
achat et « Passer » disparaît ; l'achat relit `ecranVivant` avant la case, après la case et avant la feuille ; une nouvelle
demande de case rend la précédente « remplacee » (le Pro + Cloud de 09:18:17 pendait pour toujours, sans issue).

**1.b Cause de l'échec de l'achat Apple.**
- Les 5 tentatives de rachidafarhi54 (09:02 → 09:23) sont TOUTES sur le build 3c3f93c (OTA 2.9.199 du 15/11 15:12) :
  l'OTA 2.9.200 (ce6e27f) n'a été construite qu'à 09:23:46. Ce n'est pas une régression de la 2.9.200.
- Son essai était PERMIS par le serveur (`cloud_essai_demandes` : `essai_permis = true` à 09:18:05, appareil jamais vu) : la
  question « essai déjà utilisé » ne lui a donc PAS été montrée. Ses « annule » viennent de la feuille d'Apple elle-même
  (StoreKit `.userCancelled`, rendu « User cancelled » par le module) : 13 s, ~60 s et 3 s après l'acceptation. Le chemin
  des formules jetait le code, la durée de la feuille et l'étape : impossible d'en dire plus sur ces 5 essais.
- Ce que montre le parc : Pro + Cloud a abouti sur iPhone (cdf7007c le 13/11 avec la semaine gratuite, af37fa49 le 14/11) ;
  Premium + Cloud n'a JAMAIS abouti chez Apple (0 notification Apple pour `app.fillsell.premium.cloud`) — 2 personnes, toutes
  deux « annule » en 3 à 60 s (3c82995d le 14/11, rachidafarhi54 le 16/11).
- **App Store Connect non vérifié** : la session ASC du Chrome est fermée et je ne tape pas de mot de passe (règle fixe,
  même avec une autorisation). À vérifier dès que Nico ouvre la session : état de `app.fillsell.premium.cloud` et de son
  offre d'introduction (1 semaine gratuite, 175 pays).
- **Le message vu par Nico (test5, 11:31)** : `cloud_essai_demandes.raison = appareil_deja_vu` (l'iPhone avait servi à
  l'essai de son compte principal 5322fa18) ; la « décision 8 » faisait refuser la semaine Apple et l'app le disait en
  « Ton essai gratuit FillSell a déjà été utilisé… n'est pas encore activé ». **Décision de Nico appliquée** : la semaine
  gratuite de la boutique active le service tout de suite (serveur : `verdictEssaiStore`, `droitsAchatBoutique`,
  `validate-apple-receipt` ; app : plus de question, une phrase seulement là où l'argent part aujourd'hui). Google Play :
  même règle (même code). Stripe : pas de semaine de boutique — un essai refusé est payé tout de suite avec le service tout
  de suite (jamais une semaine sans service) ; la phrase dit la vraie raison, en une phrase.

**1.c Journalisation vraie.** `formule_cloud_issue` (et `cloud_achat_issue` pour le Cloud seul) : `raison` jamais nulle
(`conditions_refusees`, `conditions_remplacees`, `ecran_ferme`, `boutique_annulee`, `boutique_erreur`,
`essai_refuse_non_confirme`, `semaine_boutique_non_confirmee`…), `etape`, `code` et `message_boutique` de StoreKit / Google
Play, `duree_feuille_ms`, `produit`, `semaine_boutique` (oui / non / inconnu, telle que l'app l'a lue).

**Verrous** : `selftest:achat-formule-issue-vraie` (1 vert / 23 rouges sur 5f4744a → 30/0) ;
`selftest:semaine-boutique-service-actif` (1 / 21 → 22/0). Tests de l'ancienne règle mis à jour : `option-cloud`,
`formules-cloud-boutiques`, `formules-cloud-business-sans-essai`, `formules-ouverture-partout`, `textes-paiement-verite`,
`formules-essai-changement`, `cloud-executant`, `formules-canal-ferme`, `onboarding-trois-jauges`, `paiements-non-regression`
(lignes relues : `scripts/fixtures/paiements-lignes-semaine-1611.json`).

**Preuve attendue (essai démarré sur iPhone en sandbox, onboarding et Tableau)** : je ne peux pas la produire — pas
d'iPhone ni de Mac ici, et un achat de l'App Store se fait au doigt sur le téléphone. La trace dira désormais la vérité au
premier essai (raison, code StoreKit, durée de la feuille).

