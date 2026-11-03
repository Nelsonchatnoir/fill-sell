# Reprise — quotas et paliers (03/11/2026 soir)

Rapport complet : `docs/enquetes/paliers-quotas-0311/RAPPORT.md`. Règles : `docs/regles/mails-paiements-comptabilite.md`
(cycle) et `docs/regles/republication-et-publication.md` (remontées), sections du 03/11.

## Livré ce soir (prod, commit afe1b49 poussé)
- **Règle des annulées** (migration `20261103234000`, appliquée) : pour Premium et Pro, `remontees_du_cycle` ne compte
  que les remontées créées dans le cycle, publiées ou en cours. Jamais une annulée sans publication, une synchro,
  `hors_quota`, une sortie d'Opla. Aucun compteur ne monte. Free inchangé (`quota_republication_free_etat`).
  - ⛔ Une remontée `cancelled` avec `published_at` est FAITE : elle a été remplacée par la remontée suivante. Elle compte.
- **Correctif `upgrade_monthly_grant`** (migration `20261103233000`, appliquée) : un paiement du même palier qui prolonge
  l'échéance de plus de 2 jours ouvre un cycle neuf à la date du paiement. Une proration, un rejeu ou un RESTARTED ne
  crédite rien.
- **Recalés par la règle** :
  - nadegemarcelin78 : cycle au 16/10. Elle était bloquée à 1 500 depuis le 29/10 ; elle est à 871 / 1 500 et débloquée ;
  - boncoin59300 : cycle au 29/10, la date de son paiement Stripe.
  - Aucun mail. Avant / après sur 61 comptes payants : personne n'a perdu.
- Preuve sur base jetable 38/38 (`PREUVE_PG=embarque node scripts/quotas/preuve-cycle-remontees.mjs`), selftest
  `cycle-et-remontees`, suite complète 538/538.

## Décisions FINALES de Nico — à NE PAS coder maintenant (prochain binaire complet, après validation des prix sur les stores)

### Grille

| Jauge | Free | Premium | Pro | Business |
|---|---|---|---|---|
| Annonces (rédaction IA + Lens) | 5 | 40 | 120 | illimité (Lens 600/mois, affiché) |
| Publications (1 par plateforme, avec ou sans IA) | 50 | 400 | 1 200 | illimité |
| Remontées (1 par plateforme) | 30 | 1 500 | illimité | illimité |

- Tout ce qui est illimité garde un **garde-fou invisible PAR JOUR**, qui remplace le plafond mensuel de 1 500.
  - Seuil à fixer au-dessus du maximum observé : 685 publications d'un Business en une seule journée.
  - Un mensuel de 1 500 aurait gêné des Business actuels (≈ 1 700 publications par mois au rythme observé).
- Imports, synchros, retraits et annulées ne comptent jamais.
- Le coût est affiché avant chaque publication : « Cette publication utilisera 1 annonce et 3 publications. Il te
  restera… ».
- Pas de plafond par jour visible (la décision du 24/10 tient). Pas d'offre à 79,99 €.
- Lu le 03/11 pour cette grille :
  - aucun payant gêné : Publications, max par cycle Premium 133 et Pro 445 ; Lens chez les Business, 1 scan par mois
    au plus ;
  - Free : publications ≥ 50 sur 30 j, 0 compte (1 sur le pire mois glissant) ; le mur du lot (5 annonces) reste le
    premier mur ;
  - remontées ≥ 30 : 35 Free au mur.

### Bordereaux
- Réservés au Pro et au Business, jamais au Premium (levier de conversion).
- Dans les modales : « Bordereaux Vinted » inclus dès le Pro ; « Leboncoin, eBay : bientôt ».

### Cloud
- 24,99 €/mois partout, essai 7 jours, en option sur n'importe quel palier : un Free peut le prendre seul.
- `CLOUD_PRIX_AFFICHE` (`src/utils/palier.js`) passe de 20 à 24,99 € dans le binaire, pas avant.

### Échelle à vendre
Premium = plus de quota · Pro = republication automatique + bordereaux · Business = illimité (Lens 600) · Cloud = sans
ordinateur, en option.

## Où ça vivra (repères pour le chantier, rien n'est commencé)
- Quotas : `coin_config` (`quota_annonces_*`, `quota_republication_*` ; une clé « publications » à créer),
  `quotas_etat`, `spend_coins_for_generate` / `spend_coins_for_lens`, `spend_coins_and_publish` (aucun compteur
  aujourd'hui), `spend_coins_and_republish` + `remontees_du_cycle`.
- Textes des offres : `lignesDiff` (`src/components/ConversionModal.jsx`), `PlanDetailsModal`, `LandingPage`.
- Toute fonction SQL se réécrit depuis `pg_get_functiondef` en prod. Migration : base jetable, puis feu vert.
