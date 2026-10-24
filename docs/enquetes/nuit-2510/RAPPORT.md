# Nuit du 24 au 25/10/2026 — chantier de nuit (« zéro rouge », Republier Vinted, push « Vente annulée », audit)

Message de Nico du 24/10 vers 23:45 : sept points, toute la nuit, zéro régression ; 0 mail, 0 notification à un
utilisateur ; aucune vente en cours touchée ; le short Quiksilver (Vinted, vente annulée) est le cas de test du point 2,
une seule fois ; fonctions et migrations autorisées cette nuit si essai à blanc + selftests verts + preuve en prod ;
extension 0.6.142 préparée, jamais téléversée ; OTA préparée, jamais envoyée. Heure de Paris partout.

## 1a. Dépôts et remises en ligne coupés : tranchés au relevé

**Cause prouvée (louis/Amiral, Leboncoin, 21/10)** : deux remises en ligne coupées sur la page
`/deposer-une-annonce/options` (« message channel closed ») ; get-pending-jobs a posé la question « une annonce pourrait
correspondre » (`recreation_deja_partie`) une seule fois — et plus rien ne la relisait :
- les deux annonces suspectes (3292326913, 3292489182) ont été vues deux fois le 21/10 (statut « inconnu ») puis par
  AUCUN des relevés complets suivants (louis : 22/10 22:21, 23/10 03:07 et 17:13, 24/10 12:10 ; louis-seller, même
  boutique Leboncoin : sept relevés) : l'article n'était plus en ligne nulle part, la question attendait ;
- la preuve par les photos ne pouvait pas jouer : les empreintes des photos des candidates n'avaient jamais été
  calculées (0 ligne `photo_empreintes`) ;
- la passe de handler-watch (15/10) ne savait que rattacher par les photos, et sortait sans rien faire quand les
  candidates avaient disparu ; les dépôts Beebs coupés (`depot_deja_parti`, Ciddjy) n'étaient relus par personne.

**Ciddjy (Beebs, 20/10)** : les trois annonces citées dans la question (34202692, 34202769, 34202839) sont celles
d'AUTRES fiches du même lot, chacune rattachée à son propre dépôt publié ; les quatre pyjamas en question (fiches
…871005, …871004, …871000, …514006) n'ont aucune annonce Beebs (relevés complets du 20/10 16:44 et du 22/10 18:01).

**Règle corrigée** (pour tous les comptes) : `_shared/depot-coupe-tranche.js` + handler-watch **v127** (déployée le
25/10 à 00:24:17, `verify_jwt` false avant et après) — voir `docs/regles/republication-et-publication.md` § 25/10 nuit.

**Preuves** : `selftest:depot-coupe-tranche` (fixture relevée en prod) ; essai à blanc sur le parc (6 questions →
6 relances) ; sauvegarde `_backup_2510_depots_coupes`, inverse `scripts/reparations/20261025_depots_coupes_INVERSE.sql`
(essai annulé vert) ; passage réel de 00:27 : les 6 jobs repartis une fois (louis c7526556, 88db7e2e ; Ciddjy 1819ed99,
23ef4d54, 5871f48a, 39b1a35e). 0 mail.
