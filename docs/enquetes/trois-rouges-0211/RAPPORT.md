# 02/11 après-midi — trois rouges (gjehly, labrunettedu44, sebastien64310)

Heure de Paris partout. Prod au départ (relue 16:0x) : get-pending-jobs v325, update-job-status v165, ebay-api-worker v105.
Déployé 16:15-16:17 (relu avant/après, verify_jwt inchangés) : **get-pending-jobs v326** (vrai), **update-job-status v166
puis v167** (faux), **ebay-api-worker v106** (faux). Relance : `scripts/reparations/20261102_relances_trois_rouges.sql`
(16:18, sauvegarde `_backup_0211_relances_trois_rouges`, inverse `…_INVERSE.sql`) : 29 tâches (1 Vinted gjehly,
27 republications Leboncoin labrunettedu44, 1 eBay Sébastien).

## 1. gjehly (Business) — 157 Vinted en attente, plus aucun essai après 13:00
- **Faits.** 157 Vinted pending = 80 PROGRAMMÉES (réglage du compte : créneau du soir 19:00-22:00, 8 par jour ; retenues
  « creneau » à chaque poll, normal) + 77 d'un lot créé à 12:58-13:02. 13:00:57 : la première de ce lot fige
  (« onglet de travail vinted : le content script ne répond pas, ni après rechargement puis onglet neuf », pas-de-rouge
  `canal_coupe`, prochain essai 13:05). Journal de get-pending-jobs : 13:07 « 140 job(s) distribué(s), 77 job(s) retenu(s)
  après les autres (plateforme(s) qui figent sur ce poste : vinted) », 14:39 « 96 distribués, 77 retenus (vinted) ».
  Entre les deux, et après, aucun poll : le poste traite son lot (58 Leboncoin, un toutes les 2 min, de 14:41 à ~16:00
  et au-delà) et ne repasse prendre la file qu'au bout.
- **Cause.** Ce n'est pas le tour strict des programmées (v321-v325) : c'est la règle du 25/09 « une plateforme qui fige
  passe après les autres » (`_shared/rotation-figes.js`). Elle retient TOUTES les tâches de la plateforme figée tant que le
  poll sert autre chose — pendant 3 h. Sur un poste qui a toujours du Leboncoin à faire, « après » = « jamais » ; et
  comme le poste ne pollait qu'une fois par lot (~1 h 30), la fenêtre de 3 h n'avait aucune chance de se fermer à temps.
- **Correctif (règle, tous les comptes)** — get-pending-jobs v326 : passé 10 min après le dernier gel, UNE tâche de la
  plateforme figée est servie par poll avec les autres (l'essai) ; une tâche de la plateforme traitée par un poste et
  publiée après le gel lève le gel. Reste inchangé : une seule tâche figée à la fois, rien d'autre → tout part, fenêtre
  de 3 h, republication « deleted » jamais retenue. Selftest `selftest:rotation-figes` (13 contrôles ajoutés, file réelle).
- **Relance.** 3bd3cc17 (erreur, échéance, error_technique effacées). Les 76 autres n'avaient rien à effacer. La fenêtre
  de 3 h s'est fermée à 16:00:57 ; le poste reprendra les Vinted à son prochain poll (fin de son lot Leboncoin).
- **Preuve.** Poll de 16:24:55 : « 78 job(s) distribué(s) » (plus aucune ligne « qui figent »), le lot Leboncoin s'étant
  arrêté sur sa session Leboncoin morte (observée 15:40, « Leboncoin bloque » depuis 16:03 : 56 Leboncoin retenus sans
  tentative consommée — à lui de se reconnecter, rien à voir avec ce correctif). Vinted **publiées 16:35:53**
  (10637271752), 16:44:44, 17:02:13, 17:11:53, 17:14:54, une en cours à 17:20. Honnêtement : ce redémarrage-là vient de
  la fin de la fenêtre de 3 h (16:00:57) et d'un poll arrivé plus tôt ; la règle v326 évite la prochaine famine.

## 2. labrunettedu44 (Gratuit) — 27 republications Leboncoin en boucle sur « adresse introuvable »
- **Faits.** Réglages : « 25bis Rue de la Fontaine aux Bretons 44210 Pornic », ville choisie pour l'annonce « Pornic 44210 ».
  Publication de 13:27 (cf1d28ac) : warnings « ville choisie pour l'annonce (« Pornic 44210 ») » et « "Pornic 44210" →
  suggestion LBC "Pornic (44210)" » — c'est la VILLE qui a été tapée et acceptée. Republications : get-pending-jobs sert la
  rue des Réglages (règle du 01/10) ; le contrôle avant retrait de l'extension la cherche en mode précis et simple →
  aucune proposition → pause ; update-job-status (lot J, 31/10) la requalifiait en « Leboncoin a accepté cette même
  adresse pour tes publications, le blocage vient donc de chez nous », reprise 10 min, 1 h, 3 h — à l'identique.
- **Cause du faux message.** `publicationAvecLaMemeAdresse` comparait `platform_fields.adresse` de la publication (l'adresse
  des Réglages, toujours présente) et non l'adresse que Leboncoin avait acceptée (la ville choisie).
- **Correctif (règle, tous les comptes)** — update-job-status v167, `_shared/lbc-voie-des-reglages.js` :
  1. adresse refusée → écriture suivante, contrôlée avant tout retrait (5 min) : « 25 bis … », puis la rue sans numéro,
     puis la commune de l'annonce si une publication du compte l'a fait accepter ; sinon la pause « Vérifie tes Réglages »
     reste, avec chaque écriture essayée (jamais une commune devinée) ;
  2. les autres republications du compte qui tapent la même rue suivent la même écriture (une réponse de Leboncoin vaut
     pour l'adresse, pas pour la tâche) ;
  3. « Leboncoin a accepté cette même adresse » seulement pour une adresse ACCEPTÉE (ville choisie, commune d'un repli,
     sinon l'adresse tapée). Selftests `lbc-rue-introuvable-0211` (nouveau), `lot-j-3110` (une ligne qui consacrait le faux
     message, réécrite), `lbc-voie-des-reglages`.
- **Relance.** 27 republications (étape captured, pas retirées). La tâche « le prix manque » (needs_user) n'est pas touchée.
- **Constaté en prod juste après (16:20-16:23).** « 25bis … » introuvable → « 25 bis … » introuvable → « Rue de la Fontaine
  aux Bretons 44210 Pornic » : contrôle **ok** ; les sœurs ont suivi ; 83a028df est passée au retrait (étape deleted).
- **Preuve.** 83a028df **republiée 16:35:18** (annonce Leboncoin 3301033548), adresse tapée « Rue de la Fontaine aux
  Bretons 44210 Pornic » → suggestion « Rue de la Fontaine aux Bretons, Pornic (44210) ». Les 26 autres sont pending avec
  cette adresse, étape captured (annonces en ligne), et partent au rythme de la cadence du compte (intouchée).

## 3. sebastien64310 (Business) — eBay « aucune catégorie eBay sûre » (« DVD, cinéma › Cassettes vidéo »)
- **Faits.** Job 35926533, « cassette vhs léon (1994) - jean reno / … / gaumont », mapping de l'app 309 « DVD, cinéma >
  Cassettes vidéo » (il EST dans le mapping). Famille Lens `livres_medias`. eBay ne suggère qu'un rayon (Affiches, posters).
- **Cause.** La garde « famille livres » d'ebay-api-worker exigeait un rayon « Livres… » pour toute fiche `livres_medias`
  — sauf si le texte nomme un support (dvd, vhs…) ET ne nomme pas un livre. La description cite une critique de presse
  (« alterne roman noir et romance ») : « roman » désarmait le support, la cassette était traitée en livre, et faute de
  rayon Livres chez eBay → « aucune catégorie sûre ».
- **Correctif (règle)** — ebay-api-worker v106 : `livres_medias` = livres ET médias ; un rayon média d'eBay (DVD, cinéma ;
  Films, DVD ; Musique, CD, vinyles) est dans la famille quand le TITRE nomme un support. Un livre sans support au titre
  reste gardé « Livres » ; le cas Shigeru Ban (Jouets et jeux) reste refusé. Selftest `ebay-rayon-media-0211`.
- **Relance et preuve.** Relancée 16:18 (ebayCategorieAttente retirée : première passe, jamais « prendre la proposition
  d'eBay ») → **publiée 16:20** en 309 « DVD, cinéma > Cassettes vidéo », annonce eBay 366778844989.
