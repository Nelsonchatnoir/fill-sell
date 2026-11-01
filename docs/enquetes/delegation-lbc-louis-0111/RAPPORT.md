# Louis — tout le Leboncoin de louis-seller passe par son compte Amiral (01/11/2026 après-midi, heure de Paris)

Décision de Nico : une DÉLÉGATION LEBONCOIN par compte, louis-seller@ttfamily.fr → louis@ttfamily.fr (« Amiral »),
cette paire seule. Règles : `docs/regles/plateformes.md` § 01/11 après-midi.

## 1. Pourquoi l'extension change (et pas seulement le serveur)
- L'extension écrit elle-même en base avec le jeton de SON compte : tâches (28 écritures directes), relevés (20),
  fiches (17), annonces (6). Une tâche de louis-seller exécutée « en tant qu'Amiral » serait refusée (réservation
  `controler_job_extension`, RLS) ou écrite au mauvais compte (annonces relevées, ventes).
- La seule voie propre : l'extension d'Amiral ouvre un SECOND compte de travail, celui de louis-seller, limité à
  Leboncoin, avec une session propre fabriquée par le serveur (`extension-session`, même voie que le bootstrap de
  l'extension, jamais un mot de passe) — seulement si la délégation est posée des deux côtés.
- Conséquence : tout ce que fait le compte de travail s'écrit au nom de louis-seller (tâches, annonces, ventes,
  statistiques, quotas) ; seule l'exécution change de poste. La garde « une annonce, un compte »
  (`annonces_plateforme_un_compte`, comptes liés) joue comme quand la machine virtuelle relevait la même boutique.

## 2. Ce qui est livré
- **Serveur** : `_shared/delegation-leboncoin.js` (la règle) ; get-pending-jobs (compte de travail : Leboncoin seul,
  preuve de l'exécutant vérifiée, pause de l'exécutant suivie ; postes de louis-seller : plus rien de Leboncoin) ;
  extension-session (`delegation_pour`, 403 sans délégation valide).
- **Extension 0.6.164** : cycle « compte de travail » sous le verrou de flux (tâches, relevés servis, relevé quotidien,
  veille par commande neuve, relevé des ventes) ; un poste dont le compte délègue ne touche plus Leboncoin (sonde,
  relevé lancé de lui-même).
- **App** : carte de synchro de louis-seller — « Leboncoin passe par ton compte Amiral. », pastille au dernier relevé
  réussi (plus de « — »).
- **Message vrai** (`_shared/session-prouvee.js`, tout le parc) : « ta connexion X est bonne » seulement prouvé sur CE
  poste, après le mur, jamais devant une vue acheteur.
- **Données** : `scripts/reparations/20261101_louis_delegation_leboncoin.sql` (+ inverse) — exception « machine
  virtuelle » retirée, délégation posée des deux côtés, tâche 9aa5edb9 remise en attente pour l'essai réel.

## 3. Déploiements (01/11, heure de Paris, versions lues avant et après)
- 13:20 extension-session **v12 → v13** (verify_jwt vrai, inchangé).
- 13:21 get-pending-jobs **v316 → v317** (verify_jwt vrai, inchangé).
- 13:22 update-job-status **v162 → v163** (verify_jwt faux, inchangé).
- Journaux à 13:24 : get-pending-jobs 176 réponses 200, update-job-status 36 × 200, aucune 5xx.
- 13:22:52 réparation `scripts/reparations/20261101_louis_delegation_leboncoin.sql` : délégation posée des deux côtés,
  exception « machine virtuelle » retirée (plus aucun compte ne la porte), tâche 9aa5edb9 needs_user → pending avec
  « Leboncoin passe par ton compte Amiral : cette tâche partira dès que l'extension FillSell (à jour) sera ouverte sur
  le compte Amiral… ». Sauvegardes `_backup_0111_delegation_lbc_flags`, `_backup_0111_delegation_lbc_job`,
  `_backup_0111_delegation_lbc_annonces` (annonces Leboncoin vivantes : louis-seller 122, Amiral 287, 0 en commun).
- 13:24 et 13:26 : polls de la machine virtuelle (poste 44e23093) — « Leboncoin délégué (exécutant faf5021a) — 1 tâche
  laissée au compte de travail » ; ses tâches Vinted continuent (republication 8504f5a8 publiée à 13:25) ; aucun
  relevé Leboncoin de louis-seller depuis l'activation ; le message de la tâche n'est pas réécrit à chaque passage.
- Extension **0.6.164** empaquetée : `build/CWS-0.6.164-A-TELEVERSER/fillsell-extension-0.6.164-cws.zip`
  (BUILD_ID 2026-11-01T12:23:35Z+dc2fb08) ; l'ancien zip 0.6.163 (déjà servi) rangé dans `build/CWS-PERIMES/`.
- OTA **2.9.146** sur production (13:27) ; le web suit au push.

## 4. Essai réel : le retrait de la Maison Gabby (9aa5edb9)
- **Pas encore fait, et c'est attendu** : le compte de travail délégué n'existe que dans l'extension 0.6.164. Le poste
  d'Amiral tourne en 0.6.163 (build f6c6bd3) : il reçoit déjà la liste `delegations` mais ne sait pas encore s'en servir.
- Dès que la 0.6.164 est acceptée par le Chrome Web Store et installée chez Louis (mise à jour automatique de Brave) :
  au poll suivant, l'extension d'Amiral obtient la session de louis-seller, fait le poll délégué, et le retrait part sur
  la session Leboncoin d'Amiral, avec les gardes d'identité d'avant (annonce par son adresse et son titre, vendeur =
  la boutique connectée). Si Leboncoin refuse (403), la tâche le dit et la pause d'Amiral s'applique, sans boucle.
- **En attendant, l'annonce 3291865529 reste en ligne** (risque de double vente). Seul geste possible avant la mise à
  jour : la retirer à la main sur leboncoin.fr depuis le PC d'Amiral — décision de Nico.

## 5. Ce que voit Louis
- **louis-seller** : la tâche « Maison Gabby » dit « Leboncoin passe par ton compte Amiral… » (plus « Connexion
  Leboncoin requise ») ; sa machine virtuelle ne touche plus Leboncoin ; carte de synchro : « Leboncoin passe par ton
  compte Amiral. » (ou « En attente de son ordinateur… » tant que la 0.6.164 n'y tourne pas), pastille Leboncoin au
  dernier relevé réussi au lieu de « — ».
- **Amiral** : rien de changé tant que la 0.6.164 n'est pas installée ; ensuite, les tâches Leboncoin de louis-seller
  passent dans son navigateur, entre les siennes, une à la fois (verrou de flux).

## 6. Ouvert
- La pause sur refus vue pendant une tâche déléguée se pose sur louis-seller (règle inchangée) et retient ses tâches ;
  elle ne met pas Amiral en pause. Le contraire (pause d'Amiral) retient bien les deux.
- L'app de louis-seller ne lit pas la pause d'Amiral (sa carte dit seulement l'état du poste d'Amiral).
- Les commandes Leboncoin relevées sans numéro d'annonce vont au premier compte lié qui les lit (comportement d'avant,
  inchangé) ; la vente prouvée par le relevé de chaque compte reste la voie principale.
