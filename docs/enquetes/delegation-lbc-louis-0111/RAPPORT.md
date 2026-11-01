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

## 3. Déploiements et essai réel
(complété ci-dessous au fil des gestes)
