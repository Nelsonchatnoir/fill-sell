P5 — Leboncoin « Élément introuvable : input[type="file"] » (compte 2f7275hb8p / 9ed8b331, job 3048003c, 15/11/2026)
Diagnostic en lecture seule : aucun fichier suivi modifié, rien écrit en base, rien déployé. Heures de Paris.

VERDICT
- Cas PONCTUEL : c'est une course d'affichage dans un onglet de travail caché, pas un parcours Leboncoin cassé.
  Sur 30 jours : 10 dépôts touchés pour environ 9 400 jobs Leboncoin (0,1 %), sur 8 comptes. Aucun job n'est resté
  bloqué : 9 sur 9 sont passés au premier nouvel essai automatique.
- Le vrai défaut chez nous, c'est le MESSAGE. Pas-de-rouge ne connaît pas ce brut et le classe « motif inconnu »,
  d'où « On ne sait pas encore pourquoi ». Une personne a annulé sa publication 8 minutes après ce message.
- Correctif du message : la fonction serveur update-job-status seule, sans nouvelle extension.
  Durcissement du handler (facultatif) : il demande une nouvelle version de l'extension (0.6.192).

1) DÉROULÉ DU JOB 3048003c (« Polaire Patagonia femme – Taille M – Gris », Mode > Vêtements, publication)
- Poste : PC, Chrome. handler_build = « 2026-11-10T14:10:14Z+ba13a51 · v0.6.186 », sans « -cloud ».
  profiles.extension_build porte le même build. La 0.6.191 n'est pas encore sur le Chrome Web Store
  (zip build/CWS-0.6.191-A-TELEVERSER prêt).
- 22:10:12 : job créé.
- 22:12:22.7 : première passe servie (lbc_envois[0]).
- 22:12:53.8 : étape « photos » relayée. Le titre est tapé et la catégorie est passée sans erreur.
- 22:12:56.6 : échec. Le brut est « Élément introuvable: input[type="file"] (même après avance du wizard paginé) ».
  Relevé at_end :
  - URL https://www.leboncoin.fr/deposer-une-annonce, fill_step photos ;
  - fenêtre de travail dédiée (window_id 181257526) MINIMISÉE, sans focus ;
  - onglet inactif (caché), ni « discarded » ni « frozen », tab_status complete ;
  - diagnostic_page_lbc ABSENT (voir point 3).
- 22:12:57.3 : update-job-status fait passer l'échec par pas-de-rouge. Résultat : motif inconnu_reprise, verdict
  reprise, nouvel essai à +15 min. Message affiché : « La publication n'a pas abouti. Rien n'a été publié. On ne sait
  pas encore pourquoi : on refait un essai tout seuls. » (archivé dans erreurs_archivees).
- 22:14:57 : la publication suivante du même compte (0ecf37e2, Polo Ralph Lauren, Mode > Vêtements) part normalement
  dans la MÊME fenêtre minimisée.
- 22:28:19 : deuxième passe servie. Relevé at_start à 22:28:26 : même fenêtre 181257526, toujours minimisée,
  onglet inactif, même URL.
- 22:28:39 : photos lues (20 gratuites, 4 envoyées).
- 22:29:08 : dépôt confirmé (« Votre annonce est publiée », adsubmit 201, ad_id 3310461653).
- 22:29:14 : published.
=> Pas de captcha, pas de connexion perdue, pas de page différente. Même URL, même fenêtre, mêmes conditions, et
   l'essai suivant passe, comme le job voisin 2 minutes plus tard.
Anomalie non expliquée : seulement 2,8 s entre l'étape photos et la fin, alors que la sonde dure 6 s. L'horodatage de
l'étape est l'heure de réception par le service worker, qui a pu la recevoir en retard. Cela ne change pas la
conclusion.

2) PONCTUEL OU VRAI DÉFAUT — tous les comptes, 30 jours (requêtes q3, q5, q9, q10, q14)
Sont comptés les jobs qui portent ce brut, dans error, error_technique, erreurs_archivees ou un autre champ.

Job       compte    action     version  rayon                          fenêtre     onglet   photos→fin  issue
d9f70ed7  a3002ab6  republish  0.6.152  Électronique>Téléphones        minimisée   caché    6,0 s   remise en ligne au nouvel essai (puis close pour une autre raison)
80a54a24  d87570eb  publish    0.6.161  Mode>Vêtements                 minimisée   caché    9,1 s   ANNULÉE par la personne (« Ta file ») 8 min après, avant le nouvel essai
15bad4ca  3f91c02e  republish  0.6.166  Loisirs>Vélos                  minimisée   caché    6,1 s   publiée au nouvel essai
172f5610  010ff35b  republish  0.6.178  M&J>Électroménager             plein écran caché    23,5 s  publiée au nouvel essai
62cd7d69  010ff35b  republish  0.6.179  M&J>Décoration                 normale     caché    41,7 s  publiée
dda34463  010ff35b  republish  0.6.179  M&J>Décoration                 normale     actif*   7,1 s   publiée au nouvel essai
2d118cae  229c7b07  republish  0.6.183  Loisirs>Livres                 minimisée   caché    6,6 s   remise en ligne au nouvel essai (puis close pour une autre raison)
dd706951  010ff35b  republish  0.6.186  M&J>Arts de la table           plein écran caché    23,1 s  publiée au nouvel essai
1e2fa7fe  f8a94c06  publish    0.6.186  Mode>Vêtements                 minimisée   caché    6,0 s   publiée au nouvel essai
3048003c  9ed8b331  publish    0.6.186  Mode>Vêtements                 minimisée   caché    2,8 s   publiée au nouvel essai (22:29)
dd58c22f  8a7f95d5  republish  0.6.179  Immobilier>Locations           —           —        —       contrôle avant retrait (pré-vol) « illisible » ; job clos car l'annonce avait disparu (cas à part)
(* onglet actif, mais dans une fenêtre normale sans focus.)

Lecture du tableau :
- Volume : 3 882 publications (98 comptes) et 5 491 republications (74 comptes) Leboncoin en 30 jours.
  10 dépôts touchés, plus 1 pré-vol, soit environ 0,1 %. 8 comptes, dont 010ff35b qui compte pour 4 jobs.
- Issue : aucun job n'est resté en échec à cause de ce motif.
  - 9 sur 9 nouveaux essais ont réussi du premier coup.
  - 1 job a été annulé par la personne avant son nouvel essai (80a54a24, avec le message « On ne sait pas »).
  - Le pré-vol dd58c22f est un sujet à part : Immobilier > Locations, aucun dépôt de ce rayon réussi en 30 jours.
- Version : de 0.6.152 à 0.6.186. Ce n'est pas lié à une version.
- Rayon : 3 cas Mode > Vêtements sur 1 648 publications de ce rayon en 30 jours. Ce n'est pas lié à un rayon.
- Page : toujours /deposer-une-annonce, à l'étape photos. Jamais d'onglet déchargé ou gelé, jamais de connexion
  perdue, jamais d'anti-robot. Ce n'est pas une nouvelle page Leboncoin : aucune vague, un cas tous les deux jours
  environ du 29/10 au 15/11, et la page standard passe avant et après.
- Ce qui distingue les échecs : l'onglet de travail était CACHÉ dans 9 cas sur 10. Mais 3 175 publications sur
  3 882 démarrent aussi onglet caché. C'est donc une condition nécessaire, pas suffisante : c'est une course.
- Ce que disent les durées entre l'étape photos et la fin :
  - environ 6 s dans 6 cas : une seule sonde de 6 s, puis ni le champ photos ni un bouton « Continuer », donc
    abandon immédiat ;
  - 23 à 42 s dans 3 cas : un « Continuer » a été trouvé et cliqué, sans faire apparaître les photos.
- Mécanisme : il est déjà documenté dans le handler (leboncoin.js:6788-6792). Chrome bride les minuteries d'une page
  cachée à 1 par seconde, puis 1 par minute après 5 minutes. Nos attentes tournent dans un worker et ne sont pas
  bridées. Mais l'apparition du bloc photos après le choix de la catégorie dépend des minuteries de Leboncoin, elles,
  bridées. C'est la même famille que le correctif du 15/11 sur le bloc catégorie (84a8d8f, 0.6.191, compte f8a94c06),
  et ce compte figure aussi ici (1e2fa7fe, le même jour).

Fragilités du handler (constat, aucune n'est la cause d'un blocage) :
- chrome-extension/content-scripts/leboncoin.js:3069-3072, avec advanceWizardTo à leboncoin.js:5688-5689
  (en 0.6.186 : l.3068-3071 et l.5421-5422).
  Après UNE sonde de 6 s, s'il n'y a ni champ photos ni « Continuer », la ligne « if (!btn) return null; » abandonne.
  Il n'y a ni attente supplémentaire ni fenêtre rendue visible. Le geste ONGLET_TRAVAIL_VISIBLE existe pourtant depuis
  la 0.6.191 (background.js:1622), mais il ne sert qu'à la catégorie (leboncoin.js:4006).
- leboncoin.js:214 (reponseEchecInterne) : la photographie de page (diagnostiquerPageLbc) n'est jointe que si l'échec
  survient avant toute étape ou sur une erreur de code. Ici l'étape est « photos », donc aucun relevé pour ces
  11 cas. On ne peut pas trancher entre « bloc photos pas encore affiché » et « clic de la suggestion de catégorie
  sans effet ».

3) CORRECTIF PROPOSÉ (feu vert de Nico requis)
A. Message vrai : serveur seul (update-job-status), aucune nouvelle extension.
- Où : supabase/functions/_shared/pas-de-rouge.js.
  - Ajouter une signature à côté de PHOTOS_RE et PANNEAU_RE (l.299-302) :
    platform === "leboncoin" && /Élément introuvable:\s*input\[type="file"\]/i
  - Ajouter la branche juste après PANNEAU (l.1122-1126), donc AVANT le motif inconnu (l.1297-1316). C'est ce motif
    inconnu qui écrit aujourd'hui « On ne sait pas encore pourquoi » (l.1304-1307).
- Sortie : même budget (3 reprises), même délai (15 min, via espacer). Aucune cadence n'est touchée.
  - Reprise, motif « lbc_photos_non_affichees ».
  - Publication : « Leboncoin n'a pas affiché l'ajout des photos à temps sur la page de dépôt : rien n'a été publié.
    On refait un essai tout seuls dans quelques minutes, rien à faire de ton côté. »
  - Republication avant retrait : même phrase, avec rienTouche(action, pf) (« Rien n'a été touché, ton annonce est
    intacte. »).
  - Budget épuisé : needs_user, source « relancer » (gardée pour la compatibilité avec relance-apres-maj, règle
    lbc_pages_avant_photos). Message : « Leboncoin n'a pas affiché l'ajout des photos sur la page de dépôt, à
    plusieurs essais : rien n'a été publié. Tu peux relancer d'un clic ci-dessous ; si ça bloque encore, écris-nous,
    on regarde avec toi. »
- Déploiement : classerEchec n'a qu'un seul appelant, update-job-status/index.ts:4607. On déploie donc
  update-job-status seule, en lisant version et verify_jwt avant et après.
  La republication déjà retirée garde son propre message (_shared/republication-hors-ligne.js:110), inchangé.
- Annexes conseillées, dans le même lot :
  - _shared/cause-blocage.js:169 range ce texte en « echec_inexplique » pour ops-digest. Ajouter avant une ligne
    « photos_non_affichees » (ORIGINE.NOUS), puis redéployer ops-digest.
  - Traduction anglaise dans src/utils/messagesServeur.js. Sans elle, une app réglée en anglais affiche la phrase
    française telle quelle. Déploiement web.

B. Durcissement : nouvelle version de l'extension (0.6.192), décision de Nico.
- À l'étape photos, si rien n'est là (ni champ ni « Continuer »), attendre jusqu'à 20 s.
- Page encore cachée après 4 s : envoyer ONGLET_TRAVAIL_VISIBLE (raison « photos_leboncoin »), sur le modèle de
  attendreBlocCategorieLbc (leboncoin.js:3988-4018).
- À l'échec, joindre diagnostiquerPageLbc() : à leboncoin.js:214, ajouter le cas etapeCourante === "photos".
- Avec la 0.6.191 seule, ce cas n'est couvert que si l'étape catégorie a déjà rendu la fenêtre visible.

Selftest « verrou » proposé : scripts/lbc-photos-non-affichees-selftest.mjs (npm run selftest:lbc-photos-non-affichees)
- Les 3 vraies publications (80a54a24, 1e2fa7fe, 3048003c), avec le brut exact, essais=1 et reprises 0 puis 1,
  doivent donner :
  - reprise, statut pending, motif lbc_photos_non_affichees, 15 min ;
  - un message SANS « On ne sait pas encore pourquoi », qui contient « photos » et « Rien n'a été publié » ;
  - aucun vocabulaire de développeur (MOTIFS lus dans _shared/vocabulaire-developpeur.ts).
- Avec reprises=3 : needs_user, source « relancer », sans « On ne sait pas ».
- Pour une republication avant retrait : le message dit « ton annonce est intacte ».
- Non-régression :
  - le même brut sur Vinted ou Beebs ne prend pas ce motif ;
  - Beebs « #input-pictures » reste beebs_formulaire_photos ;
  - un autre brut Leboncoin reste inconnu_reprise.
- Rouge avant, mesuré sur HEAD 33147cb avec .tmp-terminal/p5/essai-classer.mjs :
  - publish, reprises 0 et 1 : inconnu_reprise et « On ne sait pas encore pourquoi » ;
  - reprises=3 : inconnu_relancer.
  Vert après le correctif.
- Avant le commit : selftests du sujet (pas-de-rouge, cause-blocage, messages-serveur-anglais, relance-apres-maj),
  puis la suite complète.

ANNEXE — requêtes (toutes en --read-only), fichiers dans C:\Users\nicol\fill-and-sell\.tmp-terminal\p5\
- q1 : jobs Leboncoin du compte depuis le 14/11 (3048003c : créé 22:10:12, publié 22:29:14, v0.6.186).
- q2 : platform_fields complet de 3048003c (work_window_state, erreurs_archivees, pas_de_rouge, lbc_depot).
- q3 / q5 / q9 : les 11 jobs Leboncoin de 30 jours qui portent « wizard pagin », avec leurs traces et l'état fenêtre
  et onglet à la fin.
  Filtre : platform='leboncoin' AND created_at > now()-30 j AND (error ILIKE '%wizard pagin%' OR
  platform_fields::text ILIKE '%wizard pagin%').
- q8 : 80a54a24, arret_utilisateur 2026-11-01T12:30:19Z « app (Ta file) », next_action_after prévu à 12:37:40Z.
- q10 : dénominateur sur 30 jours.
  publish : 3 882 jobs, 98 comptes, 3 131 publiés, 3 175 démarrés onglet caché.
  republish : 5 491 jobs, 74 comptes, 3 960 publiés.
- q12 : usage_logs du compte de 22:05 à 22:35. Build ba13a51, keep_awake demandé à 22:10 et relâché à 22:30.
- q13 : profiles.extension_build = 2026-11-10T14:10:14Z+ba13a51.
- q14 / q15 : Mode > Vêtements, 1 648 publications en 30 jours ; Immobilier, 2 jobs, 0 publié.
