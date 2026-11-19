# Reprise — Opus-2, nuit du 19 au 20/11/2026 (heure de Paris)

## Ordres de Nico pour la nuit (dans l'ordre)
1. Cliente Cloud 35ab6f0f (Beebs, 0 publication) : déployer update-job-status puis get-pending-jobs (accord donné, suite
   verte exigée avant chaque déploiement, retour arrière au moindre écart). Preuve en base : plus aucun essai Beebs en
   boucle sur son compte, ses tâches toutes là, aucune annulée.
2. Puis : copie Cloud de l'extension (jamais « CHALLENGE » pour une vérification de l'appareil qui passe seule, jamais
   « Chrome ») ; « Me connecter » qui s'ouvre de lui-même dans l'app (canal de test, puis production après preuve).
3. Puis Butin d'Or (f5fab0e0, Business + Cloud Google) : créneaux impossibles à activer ; vérifier TOUTES les offres
   + Cloud (Stripe, Apple, Google) = droits de la formule de base.
4. Demain matin : UN rapport en clair avec les preuves ; preuve du relevé Beebs de Louis (faf5021a) de la nuit ;
   relecture de la prod (2.9.218, get-pending-jobs 392) ; puis chantier IP (étapes 1 → 6, « Oui, tout »).
Garde-fous : aucune action sur les comptes clients, aucun mail, pas de redémarrage de cloud-2 ni des navigateurs.

## Cause prouvée (35ab6f0f)
- Lecture seule de son onglet Beebs (cloud-2, conteneur fs-nav-35ab…, 172.31.0.2:9223) : session Firebase Google réelle
  (non anonyme, e-mail vérifié), cookies access_token/refresh_token, formulaire rempli. Au clic « Mettre en vente », Beebs
  refuse dans la page (« Vous devez être connecté pour ajouter un produit », erreur racine du formulaire) SANS requête.
- Reproduction sur le Cloud de Nico (même session Google) : tâche 7834f9dd publiée 00:00:32 (annonce 34393573, 999 €) —
  la page envoie POST /fr/listing, succès. Retrait : tâche d50c95b2 (Beebs examinait encore l'annonce à 00:08, le retrait
  part dès qu'elle apparaît — À VÉRIFIER).
- Différence = son compte Beebs (0 annonce, connecté ce soir) que Beebs ne laisse pas vendre ; pas l'extension, pas le Cloud.
- Notre défaut : update-job-status réécrivait ce refus en « refus passager… ta connexion est bonne, rien à faire » (sonde
  « connecté ») → 19+ essais, un toutes les 1 à 2 min ; aucune pause de file ; « Chrome » dans les textes du Cloud.
- « Impossible de joindre nos serveurs » 23:24 : « TypeError: Failed to fetch » à 23:18:52 côté navigateur (journal envoyé
  différé à 23:24:40) ; generate-listing 200 sur les 128 appels de 23:15-23:35 → coupure réseau chez elle.

## Correctifs codés (non commités au moment d'écrire)
- `_shared/session-prouvee.js` refusDeCompteParLaPlateforme ; update-job-status : jamais « bonne session » sur ce refus,
  marqueur `refus_compte`, texte Cloud (texteAttenteSessionCloud / « Me connecter ») ; get-pending-jobs : `refus_compte`
  sans dépôt réussi depuis → toute la file de la plateforme retenue, une tâche-sonde par heure.
- Verrou `selftest:refus-compte-beebs-cloud-1911` (13/13, absent sur HEAD).

## Butin d'Or — relu (lecture seule)
- palier_de = business ; republish_planifiee_etat_multi (émulé avec son jwt) : autorise true, ouverte true sur les 4
  plateformes, configure false. Le serveur AUTORISE : le blocage est côté app (2.9.219 Android) — à reproduire.
