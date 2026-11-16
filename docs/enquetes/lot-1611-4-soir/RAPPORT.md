# Lot du 16/11 soir — réponses de Nico, « Complet » sur le Cloud, validation bancaire pendant l'achat (rapport)

Heure de Paris. Suite du lot de l'après-midi (`docs/enquetes/lot-1611-3-apres-midi/RAPPORT.md`).

## URGENT — « Complet » sur le Cloud (≈ 15:39 → 18:25)
- **Cause.** La vente compte les IP « disponible » attribuables à un nouveau compte (`cloud_ip_attribuable(i, NULL, 'essai')`) :
  0 (la 3 réservée jusqu'au soir, la 39 gardée à Nico jusqu'au 03/12, la 40 et la 76 au repos). Le rachat automatique
  (`planDuJour`) et sa garde (`cloud_ip_garde_nombre`) comptaient la 3 et la 39 comme du stock : aCommander 0, et la garde
  refusait même un achat manuel (« garde_nombre »). `cloud_ip_stock_min` n'est plus lu depuis le 07/11 (la marge le remplace).
- **Corrigé (pour tous).** Migration `20261116220000_cloud_ip_garde_attribuables` (appliquée 18:1x, repair ; garde md5
  f5b37e20 ; inverse = corps de prod) : une IP libre ne compte que « achetee » (en route) ou « disponible » attribuable ;
  `cloud-pool.js` (gardeNombre, planDuJour) suit. Banc jetable 9/9 (défaut reproduit, miroir JS = SQL sur 300 pools, inverse
  à l'octet) ; verrou `selftest:cloud-ip-rachat-attribuables` (8 ; rouge avant : 5). Orchestrateur cloud-2
  ebc9be7b0bb2 → **6f3959560d19** (santé ok, 9 navigateurs). Commit 6f39595.
- **Achats (ordre de Nico, solde IPRoyal).** Commandes 88752535 (IP 80, contrôlée, réservée par l'app à un compte en
  préparation) et 88753885 (IP 81, quarantaine : sortie illisible au contrôle d'entrée, recontrôlée seule), 4 $ chacune ;
  puis le rachat corrigé a acheté seul la 88755106 (IP 82, contrôle d'entrée réussi). **Preuve** : `cloud_vente_etat` de
  nicolas.svobodny+test10 → `vente_possible = true`, 2 places (≈ 18:25).
- **Reste.** Solde IPRoyal 18,15 $ (≈ 4 IP ; l'orchestrateur alerte : 28 $ prévus sur 14 jours) — recharger = paiement de Nico.
  Entre la dernière IP attribuable et le rachat suivant (≤ 5 min + livraison + contrôle), « Complet » peut encore s'afficher
  quelques minutes (compter une IP « en commande » comme une place = décision).

## Validation bancaire pendant la feuille d'Apple / de Google (reproduit par Nico à 18:19)
- **Cause.** Le module d'achat iPhone rend « User cancelled » quand la feuille d'Apple disparaît pendant le passage dans
  l'appli de la banque (trace test5 18:19 : `duree_feuille_ms` 35 605, `semaine_boutique` « oui ») ; l'app concluait
  « n'a pas démarré » (bandeau de reprise du 16/11 13:17). Android : « Purchase is pending » était bien « en attente »,
  mais l'app ne revenait jamais le vérifier, et **un abonnement passé ACHETÉ hors de la feuille n'était acquitté par
  personne** (Google rembourse au bout de 3 jours).
- **Ton achat de 18:19** : Apple ne l'a PAS validé (aucune notification SUBSCRIBED ; le récepteur marche : une EXPIRED reçue
  à 18:31) — rien prélevé, rien à rattraper.
- **Rachida (6 « annulé »)** : 3 sont la case des conditions fermée (09:18:22, 09:23:19, 09:23:33) ; 3 sont passés par la
  feuille d'Apple : 09:16:54 → 09:18:00 (66 s, elle touche l'app à 09:17:54 — impossible feuille ouverte : **le cas de la
  banque**), 09:03:34 → 09:03:47 et 09:18:05 → 09:18:08 (cause illisible, avant la trace vraie). Aucun achat validé chez Apple.
  L'onboarding n'a pas coupé la feuille : son 1er achat est parti après la fin du parcours (case cachée, corrigée à 12:35).
- **Corrigé (OTA, sans binaire).** `src/cloud/veilleAchatBoutique.js` : annulation après un passage en arrière-plan (iPhone :
  événement `pause` ; Android : appStateChange inactif) ou achat en attente = « On attend la validation de ta banque… Dès
  qu'Apple confirme, ton essai … démarre tout seul : tu n'as rien à refaire. » ; une veille vérifiée à l'ouverture et à chaque
  retour (serveur actif → « Ton essai … a démarré » ; iPhone : transactions d'abonnement écoutées ; Android : achats relus,
  validation une fois, acquittement) ; 24 h sans confirmation → « Ta banque n'a pas confirmé : rien n'a été prélevé. ».
  Serveur : `_shared/google-acquitter-abonnement.js` — google-play-webhook et validate-google-purchase acquittent tout
  abonnement actif encore à acquitter. Verrous `selftest:achat-attente-banque` (68 ; rouge avant : 58),
  `selftest:google-acquitter-abonnement` (10 ; rouge avant : module absent).
- **Limites sans binaire.** iPhone : « User cancelled » ne dit pas qu'une banque valide encore (déduit de l'arrière-plan) ;
  une transaction arrivée avant l'écoute JS (démarrage à froid) est vue par l'état serveur (notification d'Apple).

## Réponses de Nico appliquées
1. **Un seul essai Cloud par personne** (`_shared/essai-cloud-unique.js`, registre = `profiles.cloud_essai_debut`, tous
   canaux) : jamais eu → essai ; déjà eu (Premium + Cloud, Pro + Cloud, autre canal) → payé, refusé AVANT la feuille sur
   iPhone quand Apple offrirait quand même sa semaine ; abonné Premium/Pro sans Cloud → essai (Stripe : essai d'abonné ;
   boutiques : Cloud seul, groupe « FillSell Cloud » chez Apple) ; Android < 2.9.205 face à une offre d'essai → « Mets à
   jour FillSell ». Verrou `selftest:essai-cloud-unique` (94 ; rouge avant : 23). **Réglage Google à poser APRÈS l'adoption
   de l'OTA 2.9.207** (sinon un vieux code donnerait un 2e essai) : premium-cloud-trial-7d et pro-cloud-trial-7d → « N'ont
   jamais eu CET abonnement » ; cloud.sub inchangé ; Apple : rien à changer.
2. Testeur sandbox `Nicotest2@…` : « interrompre les achats » COUPÉ par l'API App Store Connect (relu : false).
3. Retraits (F1) : quand des retraits dépassent ≈ 15 min estimées, un passage ne sert que des retraits (vérifications
   Beebs d'abord) ; sans cela, identique (`_shared/tranche-cycle.js`, verrou `selftest:retraits-lot-cycle-borne`, 26 ;
   rouge avant). CPU AVANT (18:05) : base 15-17 % (moyenne horaire), cloud-2 charge 0,20 sur 32 fils, 99 % libre ;
   coût estimé après : +40 s d'exécution par heure pendant un gros lot. Mesure APRÈS : voir l'état de prod.
4. Preuves sur appareil : faites par Nico (Android, iPhone) ; Stripe prouvé en réel (victorine.boutique, 15:39).
5. Migration `20261114100000` (plateforme d'inscription) APPLIQUÉE 18:55, repair ; relue (une seule RPC, colonne et CHECK,
   droits ; md5 sans CR conformes, la prod garde les CR du fichier).
6. Leboncoin « Locations de vacances » (« Locations saisonnières », lien `/ad/locations_saisonnieres/`) bloquée comme
   l'Immobilier ; 0 tâche vivante concernée.
7. Mail à ayadi007 : PRÊT, NON ENVOYÉ (la simulation a été refusée par l'interruption de Nico) — part sur son « envoie ».
