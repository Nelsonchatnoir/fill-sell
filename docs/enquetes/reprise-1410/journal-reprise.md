# Journal de reprise (phase 3) — 15/10/2026

Heures de Paris. Chaque paquet : état AVANT, geste, état APRÈS, contrôle du
disjoncteur (arrêt net si plus de 10 % d'échecs dans le paquet).
Sauvegardes : table `_backup_1510_reprise` (fermée à l'API), inverse dans
l'en-tête de `scripts/reparations/20261015_reprise_tache_sans_demarrage.sql`.

## Reprises faites par les RÈGLES (aucun geste manuel)

| Heure | Compte | Plateforme | Quoi | Règle | Résultat |
|---|---|---|---|---|---|
| 15/10 01:59 | Louis (Amiral) | Vinted | carte « Vendue » des 12 adaptateurs Vert (d7b3b535) | signaux_vente_reconcilier (mig 20261015000000) | signal démenti par le relevé, carte disparue |
| 15/10 01:59-02:01 | Tech-t ×3, SPGL 44 ×2, josephinecerni ×6, meminiandmove ×3, Ornella ×1 | Vinted / eBay | cartes « Vendue » d'articles déjà vendus par une vente saisie | idem (même cession) | 15 annonces closes « vendues » sur la vente existante ; 0 vente créée, 0 mail, 0 retrait |
| 15/10 03:00 | Ornella | Vinted | republication 9a7b9499 « Étape inconnue : recreated » | handler-watch v103 (_shared/republication-finie.js) | close « published » (annonce 10352378300 en ligne) |

## Reprises par paquets (règle corrigée, tâches jamais commencées)

### Ciddjy Elisabeth-Flora (eacbe32c) — dépôts Beebs « mis de côté » à tort

- Cause : file servie entière, chaque tâche comptée « servie sans démarrer »
  (règle corrigée : migration 20261015020000, get-pending-jobs v243).
- AVANT (15/10 03:07) : 68 dépôts needs_user `tache_sans_demarrage`, 0 en file,
  4 publiés sur 24 h, 6 autres attentes (« n'a pas abouti après plusieurs
  essais », gardées : risque de doublon, à juger sur un relevé Beebs).
  Extension vue à 02:42, Beebs connecté (sonde 02:39).
- Paquet `ciddjy-1` (03:07) : 10 dépôts relancés (status pending, attentes
  retirées, message archivé). Restent 58 dépôts + 1 republication (jugée à part).
- APRÈS : à relever au passage suivant de son ordinateur (voir ci-dessous).
