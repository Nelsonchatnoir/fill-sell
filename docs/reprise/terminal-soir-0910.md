# Reprise — terminal du 09/10 soir (reprise des terminaux Depop + Marta)

## En prod [relu]

| Quoi | État |
|---|---|
| Migrations APPLIQUÉES (+ repair) | 20261009160000 (aucun mail « vendu » avant une vente enregistrée), 170000 (commandes relevées : identifiant seul, plus de timeout 8 s), 180000 (une vente, une fois : job sans fiche, enchère, même cession), 190000 (commande eBay = un exemplaire ; quantité eBay sur la fiche), 200000 (fiches même photo → question) |
| Fonctions | ebay-ventes-sync **v8**, ebay-releve-api **v5**, rapprochement **v18** — toutes `verify_jwt` false relu avant/après |
| Inverses | `scripts/reparations/20261009_inverse_*` (mail_apres_la_vente corrigé : ne retire plus la preuve de page 130000) |

## Réparations exécutées (GO de Nico) — sauvegardes, inverses prouvés à l'identique
- Audit eBay (`_backup_0910_audit_ebay`) : XEWER 1-2 (une vente Leboncoin, saisie prime), 3 (78319 supprimée/notée), 4 (« Déjà vendu ? » LBC 3260299583), 5 (96766 supprimée, fiches Xbox fusionnées) ; labouquinerie85 8 (enchère sans acheteur : vente 42187 annulée, fiche en stock).
- Rattrapage des commandes eBay : 247 ventes manquantes écrites (Jocabroc 166, Louis 49, vinc-tage 31, tho 1), 0 mail.
- Stock en cours (`_backup_0910_ebay_exemplaires`) : Flamengo 1791015782859 en stock 1 → 2 (Opla intacte) ; Mach3 1790174168241 et dentelle 1790174236694 vendues ; portefeuille 1790174163845 hors règle (commande remboursée).

## Règles posées ce soir
- Une commande eBay = la vente d'UN exemplaire : quantité eBay lue APRÈS la commande ; 0 / introuvable → fiche vendue + copies prouvées retirées ; ≥ 1 → stock à la quantité eBay, aucun retrait ; illisible → « à relire » (table `ventes_ebay_exemplaires`, relue par ebay-ventes-sync).
- ⛔ Aucun retrait proposé sans la quantité réelle de la plateforme (mémoire `retrait-quantite-reelle-et-pas-de-veille`).
- ⛔ Aucune surveillance en boucle : livrer, prouver une fois, rapport, stop.

## À vérifier au prochain check
- Prochain relevé API eBay d'un compte actif : `annonces_plateforme.quantite` remplie et `inventaire_journal` source `releve_ebay` (homer21 : 9 / 4 exemplaires).
- Passe de rapprochement suivante : questions `source = 'meme_photo'` (≈ 52 au parc).
- Commandes « à relire » : `select decision, count(*) from ventes_ebay_exemplaires group by 1`.

## Ouvert / décisions de Nico
- Portefeuille 1790174163845 : vente 28273 d'une commande REMBOURSÉE encore en compta (CA +) — à supprimer ? Plus largement : une commande remboursée après relevé reste une vente.
- Leboncoin : ses commandes n'ont pas de numéro d'annonce (listing_id null) → ni rattachement par identifiant ni règle « même cession » ; Leboncoin pro multi-exemplaires sans quantité lue.
- Conflits Leboncoin anciens : cas 1 (Louis) et 2 (Joséphine) à réparer sur GO ; 3 et 4 rien.
- Extension : « page de connexion non ouvrable » quand Edge tourne sans fenêtre (Marta) → ouvrir une fenêtre au lieu d'un onglet.
- Tables `_backup_0910_*` d'autres terminaux sans RLS (exposées à l'API) — à fermer.
- Ce soir : 0.6.106 chez Nico (« je suis là »), preuve vinted.fr + Depop, CWS, OTA 2.9.68.
