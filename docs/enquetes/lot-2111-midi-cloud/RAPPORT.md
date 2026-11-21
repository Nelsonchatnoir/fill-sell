# 21/11/2026 midi (Opus-2) — Cloud : Muriel sur Leboncoin, fausses alertes « reconnecte-toi », Beebs « passée seule », eBay, IP

Heures de Paris. Lot de Nico « PROMPT OPUS-2 — 21/11 midi ». Règles durables : `docs/regles/extension-et-versions.md`
§ « 21/11/2026 midi ».

## 1. Muriel (0c97dc8b) — Leboncoin jamais reconnu
**Cause (journaux archivés de l'orchestrateur, `archives/journaux/orchestrateur-20261120-173744-*` et `-20261121-084518-*`)** :
- 14 essais (20/11 16:56 → 21/11 01:12), tous « abandonnee ». À 8 d'entre eux, la session Leboncoin était POSÉE : la sonde
  voyait les cookies complets (`__Secure-Login`) et lançait la lecture du compte, qui répondait `connexion_compte_non_lu
  motif: hors_site` (17:06:46, 17:07:24, 17:09:26, 17:12:37, 23:09:54, 23:12:28, 23:18:17, 23:25:31 → 23:30:46 toutes les 6 s,
  01:04:28, 01:06:30) : la page affichée n'était PAS sur www.leboncoin.fr (une étape d'auth.leboncoin.fr) et la lecture de
  « Me connecter » ne lit que dans cette page. À 23:13:30, pendant l'essai de 23:11:58-23:14:02, l'extension du même navigateur
  lisait ses 20 commandes Leboncoin (usage_logs `veille_commandes`, amorcage) : la session marchait.
- À CHAQUE fermeture, la session valide était effacée du profil : `sessions_purgees` leboncoin, 10 à 20 cookies (16:58:45,
  16:59:54, …, 23:14:02, 23:35:32, 01:05:00, 01:11:58). D'où « tout refaire » à chaque essai.
- Google n'est pas la cause : les premiers essais passaient par Google (`codecallback` 16:56:51) ; Marjorie (0909a787,
  19/11 17:24:08) : retour de Google → www.leboncoin.fr → compte lu 5 s plus tard.
**Correctif (pour tous)** : `lectureSession.js` (page de fond sur le site, voir les règles) ; « Me connecter » s'en sert quand la
page reste hors du site, et avant toute purge à la fermeture. Simulation : « 21/11, Muriel » (4 tests).
**IP** : script `scripts/reparations/20261121_ip_muriel_94.sql` joué à **12:50:43** (après un contrôle de la 94 à 12:50 :
Orange AS5511, FR, Vinted/Leboncoin/Beebs/Depop 200) : 94 `attribuee_essai` à 0c97dc8b ; 76 disponible, refus Beebs noté
(non prouvé), Beebs fermé (`plateformes_fermees`), jamais `cloud_ip_liberer`. Pays de la 76 relu à 12:51 (contrôle sans
écriture) : sortie **FR** (ip-api ; AS2914 NTT enregistré aux États-Unis, hébergeur) → elle ne relève pas du point 5.
**Session dans son profil** : aucune (`poste_ouvert` 12:04:46 : `leboncoin: absente`) — elle doit se reconnecter une fois ;
cette fois, la connexion sera reconnue même si la page reste sur auth.leboncoin.fr. Session Vinted : non touchée.

## 2. Fausses alertes de déconnexion (14 jours) — inventaire
Méthode : connexions vérifiées par le serveur (`cloud_connexions` + `usage_logs cloud_connexion_verifiee`) en ≤ 6 s après
l'ouverture (la session existait déjà), croisées avec ce que l'app montrait (`cloud_me_connecter_ligne_clic.etat`, origine du
clic) et le journal de l'orchestrateur.

| Compte | Plateforme | Quand | Ce que l'app disait | Preuve que la session marchait |
|---|---|---|---|---|
| f44b5917 (Nico) | Leboncoin | 15/11 22:22:31 | « reconnecte-toi à Leboncoin » (Nico) | `poste_ouvert` 17:46 : leboncoin `profil` ; compte lu en 3 s (22:22:33) |
| c7c382b7 | Beebs | 17/11 15:35:38 | `a_reconnecter` (Synchroniser) | vérification passée seule 15:35:17 ; compte lu en 3 s (15:35:42) |
| 13e274de | Leboncoin | 14/11 21:27:25 | `a_reconnecter` (carte du tableau) | compte lu à 21:24:52 et 21:25:17 (3 s), 2 min avant |
| f0acd3af | Depop | 12/11 16:49 → 17:07 (×5) | bouton « Me connecter » d'une tâche | compte lu en 4 à 6 s, 5 fois |
| 35ab6f0f | Beebs | 20/11 12:42:57, 12:46:59 | bouton « Me connecter » d'une tâche (coffre : connecté) | compte lu en 2-3 s |
| f0acd3af | Leboncoin | 21/11 10:31 → 10:49 | « session fermée » à 5 confirmations | lue `sans_jeton` au chargement de la page de fond (le jeton arrive après) — non prouvée |

Causes trouvées et corrigées : (a) « à reconnecter » sur le seul cookie (sauvegarde des 10 min, verrou de l'extension) ;
(b) une vérification passée seule rouvrait la plateforme sans rendre le coffre « connecté » (c7c382b7) ; (c) « session fermée »
sur une lecture faite au chargement (f0acd3af Leboncoin). Toutes passent désormais par la lecture sur la plateforme.
Reste hors de ce lot : le message « connecte-toi » d'une TÂCHE (f0acd3af Depop, 35ab6f0f Beebs : extension → update-job-status)
— voir « Reste ».

## 3. Muriel, Beebs
- `RESOLUTIONS_SANS_LA_PERSONNE` : la glissière de 11:19 qui suivait la vérification passée seule de 11:05 est un premier
  captcha (rejoué en test). La « revenue » de 11:19:10 est requalifiée au démarrage de l'orchestrateur (confirmation par page
  de fond, 3 min après) : Beebs repart seul si la page passe, sinon « Résoudre ». Aucun ralentissement.

## 4. Paul Gaillard (8fd44622) et le mug d'Alison (52f5dc70)
- eBay : `_shared/remise-texte-vendeur-ebay.ts` + entretien d'ebay-api-worker ; marque posée par
  `scripts/reparations/20261121_texte_vendeur_ebay_marque_auto.sql` (règle : toute fiche « à relire » publiée sur eBay par
  l'API — lu en prod : exactement les 4 de Paul, 407375028015, 407375028601, 407375028972, 407375034126).
- Mug (eBay 880138201156, publié par l'extension) : l'extension ne sait PAS modifier une annonce eBay en place (scripts eBay :
  `FILLSELL_PING`, `GO_TO_SELL`, `DELETE_LISTING`, `FILL_LISTING` seulement ; formulaire en `AddItem` seulement) → laissé tel quel.

## 5. IP
- Marge fixe 8, une IP par achat, 82/96/103 (hors de France) et 88/98 (proxy refusé) définitivement non saines, refus d'un
  compte gardé fermé (code) ; `scripts/reparations/20261121_cloud_ip_marge_8_achats_auto.sql` (marge 8 PUIS
  cloud_ip_achats_auto = 1) joué APRÈS le redéploiement.

## 6. Tests et livraison
Voir l'entrée de l'état de prod (`docs/agents/etat-2026-10-01.md`, « 21/11/2026 midi (Opus-2) ») pour les heures de
déploiement, les versions lues avant/après et la suite complète.

## Reste
- Muriel : une connexion Leboncoin de sa part (aucun message envoyé : Nico décide) ; preuve attendue : ligne leboncoin
  `connecte = true` dans `cloud_coffre` puis une première publication Leboncoin.
- Message « connecte-toi » d'une tâche (voie extension → update-job-status) : la même règle (lire la plateforme avant de le
  dire) n'y est pas encore — à décider (extension / fonction).
- IP 76 : « réservée aux comptes sans Beebs » = priorité d'attribution (règle du 20/11) ; si aucune autre IP saine n'est libre,
  un compte Beebs peut encore la recevoir (changer cela = migration de `cloud_ip_attribuer`, feu vert de Nico).
