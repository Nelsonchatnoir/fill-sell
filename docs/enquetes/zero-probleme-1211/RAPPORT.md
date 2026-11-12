# Lot « zéro problème » — 12/11/2026 soir (terminal « Problèmes »)

Comptes désignés par leur id8 (règle du 11/11). Heures de Paris. Constat complet de la phase 1 (lecture seule) : rendu à
Nico dans le terminal le 12/11 vers 22:40 ; pièces hors dépôt (elles citent des clients) dans le scratchpad de la session
(`audit/bloc*.md`). Ordre de livraison fixé par Nico : étape 1 (argent et confiance : 4a, 4c, 4d, 4b), étape 2 (bloc 1 :
tailles, genre, état, catégories), étape 3 (bloc 3 : retraits, ventes, adresse), étape 4 (bloc 2 : comptes hors France —
plan d'abord), étape 5 (bloc 5 : promesses), bloc 6 (P3 et écrans maintenant, le reste dans l'extension 0.6.187).

Principe de Nico (12/11) : on construit pour l'international — identifiants plutôt que libellés, grilles et capacités
PAR SITE, pays / langue / monnaie de chaque compte de plateforme lus une fois ; jamais de refus ni de grisage pour cacher
un manque.

## Étape 1 — argent et confiance

### 4a. Un achat de test n'envoie jamais de mail à un client
**Cause prouvée** (journal des boutiques, email_logs) : le compte de test 5322fa18 a reçu `cloud_essai_veille` le 07/11 à
19:00, puis `cloud_paiement` « 24,99 € » chaque jour à 18:50 du 08 au 12/11 ; chacun suit un DID_RENEW
`app.fillsell.cloud.sub` d'environnement **Sandbox** (lignes 46, 56, 61, 64, 70 ; TestFlight renouvelle tous les jours).
apple-iap-webhook lisait `data.environment` pour le journal seulement ; support@ recevait aussi l'alerte Cloud et
`ops_paiement` (renouvellement Sandbox de `pro2.sub`). Google : même trou (testPurchase journalisé, jamais lu), pas encore
servi. Stripe : fermé par chance (un seul secret de signature), aucun test de `livemode`. Aucun autre compte touché.

**Correctif** (règle `docs/regles/mails-paiements-comptabilite.md`, 12/11 soir) : une règle
`_shared/environnement-store.js` ; aucun mail client pour un achat de test, alerte support@ « [TEST] », droits gardés ;
un événement Stripe du mode test n'est jamais appliqué en prod ; le rappel de la veille écarte un essai de test lu à la
source.

**Verrou** : `selftest:store-test-sans-mail` — 19 rouges sur 881c2b9 (dont : le vrai module d'envoi, rejouant la ligne 70,
envoie `cloud_paiement` au client), 35 verts après.

### 4c. L'offre suit le canal qui facture, pas l'appareil
**Cause prouvée** (code, audit) : `formulesCloudVendables` et `cartesFormulesCloud` décidaient sur le canal de l'APPAREIL ;
un abonné App Store (16 en prod) voyait sur le web « Pro + Cloud, 49,99 €/mois » sans bouton et « le changement se fait
dans ton abonnement App Store » — où l'offre n'existe pas (Apple n'a pas validé) ; un client du Cloud seul App Store
(`canalAbonnementDuProfil` ignorait `cloud_canal`) voyait « Passer à … », les conditions, puis un refus 409 et « change de
formule dans l'app sur ton iPhone ». **Correctif** : la règle `voieFormulesDuCompte` (canal qui facture + son interrupteur),
le texte de Nico, aucun bouton ; le serveur dit la même chose. **Verrou** : `selftest:formules-canal-ferme`.

### 4d. Changer de formule pendant l'essai
**Écarts prouvés** (code) : montée pendant l'essai annoncée « au prorata » (faux : l'essai continue) ; vers Business + Cloud,
79,99 € prélevés tout de suite sans le dire ; descente de la feuille de la veille refusée ; « Retirer le Cloud » pendant
l'essai : texte faux puis 409 ; C4 visible pendant l'essai (impasse) ; Apple : semaine gratuite sans droits, sans un mot.
**Correctif** : texte = issue de la vraie fonction serveur ; descente par changer-formule ; « Arrêter l'essai » ; C4 caché ;
question avant la feuille de la boutique. **Verrou** : `selftest:formules-essai-changement`.

### 4b. « On te prévient la veille »
12 textes d'écran (6 FR, 6 EN) retirés ; conditions inchangées. Le mail de la veille est codé sur les 3 canaux mais n'a
jamais touché un vrai client (seul envoi : le compte de test, Sandbox, le 07/11) ; premier attendu : Stripe, compte d607ba20,
le 13/11 vers 16:00 — à relire dans email_logs. **Verrou** : `selftest:promesse-veille-app`.

### Cloud et relevés (complément de Nico, 12/11 21:58) — compte b695d990
**Cause prouvée** (vinted_sync_runs, ebay_accounts, cloud_coffre, code) : relevé eBay 2a2223ec (app, 12/11 09:35) jamais
réclamé → expiré à 15:36 avec le texte « ton ordinateur… » ; redemandé par le POLL DU POSTE CLOUD (bb677c32,
« app:redemande », 15:36) → expiré à 21:38. Le Cloud ne porte pas eBay (copie de l'extension : Vinted, Leboncoin, Beebs,
Depop) ; eBay d'un client Cloud passe par l'API, et son eBay n'est pas relié à FillSell (aucune ligne ebay_accounts) — ses
relevés eBay des 10 et 11/11 avaient été faits par l'extension de son ORDINATEUR (build ba13a51), éteint le 12/11. Coffre du
Cloud : Vinted seul. `is_cloud` faux pendant l'essai : voulu (is_cloud = payé), aucune règle ne s'y trompe.
Autres demandes vérifiées : relevés Vinted / Leboncoin / Beebs / Depop d'un compte au Cloud actif → laissés au Cloud
(`commandeLaisseeAuCloud`) ; plateforme non connectée au coffre → même expiration « ordinateur » (même trou, corrigé) ;
ventes : lues par les relevés (même chemin) ou par l'API eBay si relié ; retraits / publications eBay : à l'ordinateur
(reste, 0 tâche ouverte, 3 comptes exposés). **Correctif** : règle `cloud-voie.js`, handler-watch, get-pending-jobs, app.
**Verrou** : `selftest:cloud-releves-sans-ordinateur`.
