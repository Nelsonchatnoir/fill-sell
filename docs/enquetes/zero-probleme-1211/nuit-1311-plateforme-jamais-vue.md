# Nuit du 13/11 — Vinted choisi, jamais vu connecté, jamais synchronisé (constat, faits à l'appui)

Compte ff1f879f (inscrit 13/11 01:50:17 Paris par Google, web, Chrome Mac, extension 0.6.186, non Cloud).

## a) Ce qu'il a vu, écran par écran (usage_logs du compte, heures de Paris)
- 01:50:34 parcours d'entrée : choisit Vinted, Leboncoin, eBay. 01:50:40 ouvre la liaison eBay (API reliée).
  Il ne passe PAS par l'étape « Synchroniser » du parcours (aucune ligne releve_demande).
- 01:52:58 Tableau : bandeau Cloud vu, fermé à 01:53:07. 01:54:36 fenêtre des offres (en-tête quota), fermée 3,5 s après.
- 01:57:54 Stock : carte « installe l'extension » vue. 01:58:11 extension 0.6.186 vue (poste 2e7fe385 puis 7b3280a2).
- 01:59:11 première synchro automatique (get-pending-jobs) : Leboncoin SEUL posé → 36 fiches lues, 31 articles créés à 02:00:34.
  02:00 relevé eBay par l'API (0 annonce). 02:08:59 ventes Leboncoin : 14 ventes créées.
- 02:08:16 SEULE tentative Vinted de la nuit : la lecture des VENTES Vinted (alarme quotidienne de l'extension, dans un
  onglet vinted.fr) → HTTP 400. Écrit dans usage_logs (releve_ventes, motif http_400). Rien à l'écran.
- 03:14:06 se reconnecte à FillSell → nouveau poste d235f197 (03:14:22). Dernier signe de l'extension 05:30:22.
- AUCUN appui sur « Synchroniser » de toute la nuit : 0 ligne sync_click (chaque appui en écrit une, refus compris).
- La carte « Synchroniser » du Stock lui montrait : pastille « Vinted — jamais » (grise), Leboncoin et eBay à jour ;
  AUCUN point « Vinted : pas connecté » (les points ne naissent que d'un relevé raté : absente/échec) ; le bouton GRISÉ
  « Tout est à jour, prochaine synchro automatique vers … » de 01:59 à ~02:15 (etatBoutonSynchro ne compte que les
  plateformes « connectées » : Vinted, jamais lu et sans session, en est exclu) ; le détail par plateforme ne listait pas
  Vinted. src/stock/boutonSynchro.js:106-123, src/stock/BlocSynchro.jsx:442-447, src/annonces/etatReleve.js:273.
- Le popup de l'extension, ligne Vinted : « Vérifié il y a N min » + bouton « Vérifier » (popup.js:1081-1085) : la vérité
  serveur (plateformes_verite) rend « inconnue » (aucun relevé, aucun dépôt, sonde null) et le popup affiche l'âge de la
  sonde sans verdict. « Vérifier » relance la même sonde → même 403 → même ligne.
- ⇒ AUCUN message ne lui a dit que Vinted n'était pas connecté. Ni l'app, ni l'extension.

## b) Pourquoi la session Vinted n'a jamais été vue : il n'était PAS connecté à Vinted dans ce Chrome
- Sonde de l'extension (service worker) : GET vinted.fr/api/v2/users/current → 403 à chaque passage (01:58 → 05:22),
  identité jamais lue. Le code traite 403 en « indéterminé » (background.js:15211-15217 : seul un 401 regarde le cookie v_uid).
- Preuve 1 (onglet réel de SON Chrome) : la lecture des ventes, faite DANS un onglet vinted.fr, a reçu 400 à 02:08:16.
- Preuve 2 (mesure du 13/11, visite anonyme d'un Chromium neuf sur vinted.fr, aucun compte) :
  /api/v2/my_orders → 400 {"code":21,"message":"Identifiant requis","message_code":"user_login_required"} ;
  /api/v2/users/current → 403 {"code":106,"message":"Accès refusé","message_code":"access_denied"} ; aucun cookie v_uid.
  C'est EXACTEMENT sa signature (403 sonde + 400 ventes). Le 403 seul ne tranchait pas (anti-robot possible) ; le 400
  « user_login_required » dans un onglet, si.
- Preuve 3 (parc, 3 derniers jours) : comptes dont la dernière lecture des ventes Vinted a RÉUSSI : 94, dont 2 avec une
  sonde 403. Comptes dont la dernière lecture = 400 : 23, dont 17 avec une sonde 403 et 3 seulement avec une identité lue.

## c) Pourquoi aucune synchro Vinted n'a été tentée (trois portes, toutes fermées)
1. Première synchro automatique (get-pending-jobs, _shared/premiere-synchro.js:39) : ne pose QUE les plateformes dont la
   session est `true` → Leboncoin seul ; et elle ne sert qu'UNE FOIS PAR COMPTE (:33, la demande posée est la marque) :
   même connecté plus tard, Vinted n'aurait jamais eu sa première synchro automatique.
2. Relevé automatique quotidien (alarme de l'extension) : refusé sans première synchro réussie (« cron_sans_premiere_sync »,
   règle du 07/08, background.js:16630).
3. Le geste : jamais fait (0 sync_click) — rien à l'écran ne le lui demandait (a).
   (L'ancien planificateur serveur planifier_premiers_releves n'est plus appelé : son déclencheur est détaché.)
→ et la seule tentative Vinted (lecture des ventes, 400) n'a produit aucun message.

## d) Les 3 autres comptes, et le total depuis le 01/10
- 1f95f334 (inscrit 02/11) : Vinted+Depop+eBay+LBC+Beebs ; 7 lectures des ventes Vinted (02/11 → 12/11), TOUTES 400 ;
  sonde 403 ; première synchro auto : Leboncoin seul ; 0 appui. → pas connecté à Vinted dans ce Chrome, jamais dit.
- 7d64bf87 (inscrite 29/10) : Vinted+Beebs ; 6 lectures 400 + 2 lectures 403 (anti-robot) ; sonde 403 ; aucune première
  synchro (aucune session vue nulle part) ; 0 appui. → pas connectée à Vinted dans ce Chrome, jamais dit.
- ed4531e2 (inscrit 18/10, Vinted seul) : CAS DIFFÉRENT — lectures des ventes RÉUSSIES le 18/10 et le 22/10 (2 ventes lues)
  et 2 publications Vinted réussies : il ÉTAIT connecté ; la sonde (403) ne l'a jamais vu → aucune première synchro ; son
  seul appui (18/10 16:23) refusé « extension_hors_ligne » ; le 11/11, lecture 400 (déconnecté depuis).
  (Le même pseudo a un second compte, 16eb79ce, session vue, jamais synchronisé : parcours sauté, extension partie le 26/10.)
- Depuis le 01/10 : 239 comptes ont choisi Vinted et eu l'extension. 48 n'ont jamais eu de relevé Vinted réussi ; 28 n'en ont
  jamais eu un seul TENTÉ (25 sans aucun appui). Parmi ces 28 : 15 sans session jamais vue (10 avec la preuve « pas
  connecté » — que des 400 —, 1 connecté que la sonde ne voyait pas, 4 sans preuve) et 13 avec une session vue mais sans
  synchro (pour la plupart inscrits avant la règle de la première synchro du 26/10).
- Aujourd'hui (extension vue < 7 j), plateformes choisies sans connexion vue : Vinted 10, Leboncoin 13, Beebs 13, Depop 6,
  eBay 3 (prouvés déconnectés) — c'est ce que la correction leur dira.

## La correction (13/11, règle pour toutes les plateformes)
- Une règle unique, `src/plateformes/connexionChoisie.js`, sur la vérité serveur `plateformes_verite` : pour chaque
  plateforme CHOISIE (déclarée, ni écartée, ni fermée ; jamais Opla) — connectée → rien ; jamais vue → « FillSell ne voit
  pas encore ta connexion à X » + « Me connecter » ; prouvée déconnectée → « Tu n'es pas connecté à X » ; connexion vue
  mais bloquée par l'anti-robot → un AUTRE message (jamais « pas connecté ») ; eBay → à relier ; Depop → autoriser ;
  extension jamais vue → un seul message d'installation ; client Cloud → les textes du Cloud (jamais « ordinateur »,
  « Chrome »). Affichée tout de suite : Tableau (« Tes plateformes à connecter »), carte « Synchroniser » du Stock (un
  point par plateforme, plus jamais « Tout est à jour » tant qu'une plateforme choisie n'a jamais été lue), Réglages ›
  Mes plateformes, popup de l'extension (0.6.187 : « Pas encore connecté à FillSell » au lieu de « Vérifié il y a N min »).
- Première synchro automatique par PLATEFORME (plus une seule par compte) : une plateforme choisie, vue connectée et
  jamais relevée reçoit la sienne (get-pending-jobs, `_shared/premiere-synchro.js`).
- Sonde Vinted (0.6.187) : sur un 403, le corps (code 106 `access_denied`) et le cookie `v_uid` disent « pas connecté »
  ou « session vue, bloquée » dans `sonde_motif` ; le sens de `vinted` / `http.vinted` ne change pas (aucun lecteur
  touché). La lecture des ventes en 400 `user_login_required` n'est PAS une preuve suffisante (3 comptes sur 23 étaient
  connectés) : elle ne ferme aucune session.
- Message des synchros en échec : inchangé (empreinte verrouillée). Aucun mail, aucun compte réparé à la main.
- Verrou `selftest:connexion-choisie` : 38 rouges sur 5274cd4 → 60 verts.
