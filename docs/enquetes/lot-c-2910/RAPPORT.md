# Lot C — dernier lot avant le Cloud (29/10, 21:50 → 23:55, heures de Paris)

Consigne de Nico (29/10 21:49) : 6 parties. Audits en lecture seule d'abord (5 en parallèle), puis correctifs, tests
réels sur le compte de Nico (f44b5917, poste « FillSell-Extension-Nico »), déploiements. Livraison : fin du rapport.

## Partie 1 — Récupération de la description d'origine : zéro friction

### 1.1 L'audit (ce qui existait, ce qui marchait, ce qui ne marchait pas)
- **Existait** : l'écran d'attente du 27-28/10 (choix Écrire / Faire rédiger / Attendre après 3 min), les lectures Vinted
  à 3 d'affilée puis une toutes les 8 à 20 s, le réveil de l'onglet gelé (Edge), la lecture de fond (COUPÉE depuis le
  26/10, décision de Nico — inchangé), le « pont_mort » (page qui ne parle plus à l'extension après une mise à jour).
- **Ne marchait pas** (prouvé, `chrome-extension/background.js`) : UN verrou global sans délai maximal
  (`withJobFlowLock`) — la lecture attendait derrière tout dépôt, synchro, relevé, poll ; la demande d'un téléphone n'était
  vue qu'à l'alarme de 2 min ; un échec de l'extension n'arrivait jamais à l'écran (il attendait 3 min sans rien dire) ;
  une annonce supprimée ouvrait le stepper sans un mot ; le battement de présence faisait croire l'ordinateur « libre ».
- **Trouvé pendant l'essai réel** : Vinted ne sert plus le JSON-LD sur une partie de ses pages (annonce 9872357762, 29/10
  22:58 : page 200, titre juste, aucun JSON-LD) → « page_sans_annonce » alors que la description est dans le flux Next.js.

### 1.2 Les chiffres (usage_logs, 23 → 29/10, relus — identiques aux tiens)
| Famille | Nombre | Ce que c'est |
|---|---|---|
| lecture_fond ok | 3 472 (38 comptes) | lectures réussies |
| onglet_indisponible | 1 133 (5 comptes) | **vrai défaut** (onglet gelé, surtout Edge de Petite planète, 26-28/10) — corrigé le 28/10 (0.6.149) ; 0 depuis le 28/10 15:00 |
| introuvable | 430 (7) | **légitime** : annonce supprimée/vendue chez Vinted (404) — désormais dit à l'écran |
| page_sans_annonce | 202 (7) + 115 d'origine (1 compte) | **vrai défaut** : page sans JSON-LD — corrigé (lecture du flux de la page, 0.6.159) |
| antirobot | 12 (3) | légitime (vérification Vinted) ; la pause de 6 h est désormais DITE à l'écran |
| session_a_rafraichir | 5 (1) | légitime, relue après un rechargement |
| lecture_origine_sans_lecteur | 16 (2) | **légitime** : ordinateur éteint / extension trop ancienne |
| action_app_ratee en_attente / abandonnee | 27 (13) / 24 (11) | l'écran sans issue avant 3 min, et aucune étape dite — corrigé |
- **maelyne.lac (29/10 16:46) — l'hypothèse « la lecture n'est jamais revenue » est FAUSSE, preuve** : demandée 16:46:40,
  lue par son PC à 16:47:02 (lecture_fond « demandee », ok, 1,5 s), close 16:47:03 ; description posée sur la fiche
  (8 mots). Sa première synchro était FINIE depuis 16:40:00. « non occupé » parlait du téléphone. Ce qu'elle a vécu après
  : non prouvé (rien n'était tracé côté écran à l'ouverture du stepper — c'est ce que la mesure neuve trace désormais).

### 1.3 Ce qui change (pour tous les comptes) — CLOS
- **La lecture passe devant tout** (extension 0.6.159) : sans le verrou d'abord (GET dans un onglet Vinted vivant, jamais
  une navigation), sinon EN TÊTE de file (avant le flux suivant, et entre deux tâches du poll). Demande d'un téléphone
  vue en 30 s (signal léger), pas à l'alarme de 2 min.
- **L'écran** s'ouvre AU CLIC (« Récupération de ta description… »), dit l'étape vraie (envoyée, ton ordinateur lit,
  ton ordinateur publie/synchronise et ta lecture passe en premier), et sur un échec propose TOUT DE SUITE « Réessayer »,
  « Écrire ma description », « La faire rédiger par FillSell » ; annonce supprimée ou sans texte : dit tel quel + écrire /
  faire rédiger ; sans échec, les deux issues en discret après 45 s. Lue → le stepper s'ouvre directement.
- **Toutes les plateformes** : Vinted (extension), Leboncoin / Beebs / Depop (relevé), eBay (API) passent par le même écran
  et les mêmes issues ; l'état fin (prise / échec) n'existe que pour Vinted (les autres n'ont pas eu une demande en 7 jours).
- **Mesure durable** : usage_logs `recuperation_description` (une ligne par écran) + état sur la demande ;
  requêtes prêtes : `docs/sql/recuperation-description.sql`.
- Migration **20261030090000_lecture_origine_suivie APPLIQUÉE** (essai à blanc 11/11 vert puis ROLLBACK ; md5 avant
  relus = ceux de l'inverse ; `migration repair` fait). Inverse : `supabase/rollbacks/20261030090000_lecture_origine_suivie_INVERSE.sql`.
- Garde-fous tenus : aucune lecture en masse ; aucun verrou de plus pour les files (la lecture prioritaire ne s'insère
  qu'entre deux tâches, et seulement quand une personne attend ; le signal = 1 ligne lue par la clé primaire, 30 s) ;
  le texte du vendeur n'est jamais réécrit (la lecture ne pose que sur une fiche vide).

### 1.4 Essais réels (compte de Nico, extension 0.6.159 posée le 29/10 à 23:03 — `maj_extension copie_non_empaquetee`)
| Situation | Demandée | Prise | Lue | Voie | Résultat |
|---|---|---|---|---|---|
| Téléphone, ordinateur libre (0.6.158) | 22:57:55 | 22:58:19 (+23 s) | — | en tête | « page_sans_annonce » → défaut trouvé (page sans JSON-LD) |
| Même demande après le correctif | — | 23:03:52 | 23:03:57 | en tête | lue, description posée mot pour mot |
| Téléphone, ordinateur libre (0.6.159) | 23:06:52 | 23:07:22 (+30 s) | 23:07:24 (**+31 s**) | sans verrou, 1,5 s | lue |
| Téléphone, ordinateur EN TRAIN de publier (dépôt LBC 23:08:25 → 23:09:20) | 23:08:39 | 23:08:52 (+13 s) | 23:08:53 (**+14 s**) | sans verrou, PENDANT le dépôt | lue |
| **Clic sur « Publier partout » dans l'app web** (2.9.136 servie, extension 0.6.159 dans le même Chrome) — fiche « Robot aspirateur LIEE » 1793009407689003 vidée pour l'essai | 23:36:57,233 | — | 23:36:57,383 | lecteur « ici » | **400 ms** au total (usage_logs `recuperation_description` : issue « lue », lecteur « ici », duree_ms 400, appareil web) ; le stepper « Où publier ? » ouvert directement ; texte reposé = l'original (md5 ff3c012d… identique, repris du relevé Leboncoin de la même annonce) ; stepper quitté, 0 job créé ; fiche remise depuis la sauvegarde |
Avant (0.6.157) : 0 à 2 min d'alarme + 8 à 20 s, et derrière tout dépôt en cours.
- Essai du clic : sauvegarde `_backup_2910_essai_clic_publier`, script `scripts/essais/20261029_test_clic_publier_nico.sql`,
  inverse `…_REMISE.sql` passé à 23:41 (description et attributs remis : vrai / vrai).
- **RESTE** (raison exacte) : l'écran « Récupération de ta description… » lui-même n'a pas été VU en vrai (la lecture a
  pris 400 ms, le stepper l'a remplacé avant la capture) ; la voie « page Vinted » depuis le clic : toutes les fiches
  Vinted actives de ton compte sont aussi sur une autre plateforme, le texte vient donc du relevé (la page Vinted est
  prouvée par les essais de 23:03 → 23:09 ci-dessus) ; Edge (aucun Edge avec
  l'extension sur ton poste) ; annonce supprimée et PC éteint en vrai (prouvés par les selftests `recuperation-description`
  / `attente-sans-lecteur` ; le compte de Nico n'a aucune fiche Vinted sans description dont l'annonce est supprimée) ;
  onglet Vinted fermé en vrai (couvert par `lecture-prioritaire` § 4 et `lecture-page-publique` « réveil »).

## Partie 2 — Bordereaux Vinted : la place et le comportement
- **CLOS (code)** : dans les Ventes, UNE ligne (« 3 bordereaux à imprimer », puis « 1 commande à expédier · 2 colis en
  route ») qui ouvre la page « À expédier » (design inchangé). Clôture seulement sur l'état lu chez Vinted (300/310
  expédiée). Suivi « En route » jusqu'à « Reçu par l'acheteur » (400), bordereau gardé tant que sa copie vit ; l'extension
  0.6.159 suit les commandes livrées jusqu'à la vente finalisée (450). Réglage « Bordereau automatique » respecté.
- Preuve de la détection sur le compte d'Ornella (mécanique existante, relue) : 23640381528 vendue le 27/10 14:23:43 →
  bordereau 14:32:31 → expédiée lue le 28/10 12:36:03 (envoi 300) → sortie de « à expédier ».
- **RESTE** : la preuve « une vente de bout en bout » sur TON compte ou celui d'Ornella avec l'écran neuf exige une vraie
  vente Vinted et un vrai envoi — ton compte n'a aucune commande (0 en base) ; à faire à la prochaine vente (toi).
  Tes Ventes en vrai (2.9.136, 23:43) : aucune ligne de bordereaux — juste, 0 commande en cours sur ton compte.
- **RESTE — trouvé au contrôle final** : Ornella a **16 commandes Vinted « à expédier »** (état Vinted 230, vendues du 22/10
  21:23 au 26/10 14:45) **inchangées depuis le 26/10** (maj_le 14:00 → 14:53), + 1 du 29/10. Son extension tourne
  (0.6.157, vue à 23:38). La relecture n'écrit jamais une ligne inchangée : la base ne permet PAS de savoir si Vinted les
  montre encore « à expédier » ou si leur détail n'est jamais relu — **non prouvé**. Indice : sa veille du 28/10 =
  84 passages pour 86 requêtes (le détail de 5 commandes par passage en demanderait plus). Si elles sont parties, sa
  ligne dira à tort « 17 commandes à expédier ». Question pour Ornella : ces commandes sont-elles envoyées ? Puis, si
  oui, correctif à la racine (tracer la date de dernière lecture de chaque commande pour le prouver).

## Partie 3 — Précision de Lens
- **Causes (lues dans le prompt et le code)** : la phrase multi-photos annonçait « face, DOS, étiquette » ; aucune règle
  « ne décris que le visible » (seulement pour les attributs) ; aucun vocabulaire du textile ; un logo d'entreprise lu
  comme « de sport » ; et le rayon Leboncoin : `candidatsParMot("Veste de sport")` = une seule candidate, « Loisirs > Sport
  & Plein air », la famille Lens « mode » n'étant pas lue hors Beebs.
- **Prompt seul : PAS suffisant** (banc) : Haiku 4.5 + prompt corrigé écrit encore « logo brodé sur la poitrine et le dos »,
  « coupe-vent nylon », « doublure molleton » sur la polaire, « doudoune » sur une veste adidas.
- **Correctif** : prompt v2026-10-29 + modèle **Haiku 5.5** (effort low ; retour à Haiku 4.5 sans redéploiement :
  `insert into coin_config(key,value) values ('lens_scan_haiku45',1)`) + rayon : une fiche Lens « mode » n'a plus de
  candidate hors vêtements sur Leboncoin, Vinted, Beebs.
- **Coûts mesurés (banc)** : Haiku 4.5 0,049-0,058 $ / scan ; **Haiku 5.5 0,024 $** ; Sonnet 5.5 0,063 $ (pas mieux sur
  les marques). Quotas Lens inchangés.
- **Banc réel 25 articles avant/après** : `scripts/bancs/lens/README.md` (+ résultats bruts). Polaire : avant « Veste RATP
  … » (capuche, sport, dos) → après « Veste polaire noire mixte, logo RATP brodé », logo sur la poitrine seulement, « une
  poche zippée », rien sur le dos. Marques : C.P.E., Philips, HP, Karrimor, Kiabi, Naf Naf, Promod, H&M, Nike, Columbia,
  adidas, Bethesda (après la règle « éditeur = marque ») gardées ; « Fusalp » et « MIAMI » (fausses) disparues.
- **RESTE (dit tel quel)** : VTech non donnée (logo illisible pour Haiku 5.5), Casio rendu « G-Shock » (la gamme) ;
  PEGI lu dans la description (« Classification PEGI 18 visible ») ; ISBN : aucune photo du banc ne le montre (le banc
  ne peut pas le prouver ; la règle ISBN du serveur est inchangée).

## Partie 4 — Leboncoin : la recherche de marque — CLOS
- **Cause PROUVÉE en réel** (ton Chrome, dépôt ouvert dans un onglet visible, quitté « sans enregistrer ») : la liste des
  1 503 marques Mode est DANS la page (aucun appel réseau à la frappe : seul clarity.ms) ; dans la fenêtre de travail
  minimisée, la liste filtrée n'est pas dessinée → « 1 enfant, texte vide ».
- **Correctif à la racine** (0.6.159) : la marque est posée par son IDENTIFIANT via le gestionnaire du composant
  (`onValueChange("zara")` → champ « Zara », formulaire `clothing_brand = zara`), décision inchangée (notre marque exacte,
  sinon « Autre »), pré-rempli que l'article nomme toujours gardé, repli = la voie d'avant.
- **Preuve réelle** : dépôt **3297910134** (999 €, titre « pull col rond femme », SANS marque dans le titre) → journal du job
  « marque: « Zara » posée par son identifiant Leboncoin (zara, liste de 1503 marques, formulaire « zara ») », page
  publique « Marque : Zara » ; **retiré** à 23:10 (job delete « deleted »), file remise en pause.

## Partie 5 — Vérifications
- **tiblancdeshaut (Johan DÉSIRÉ, Pro) — c'est lui, libellé JUSTE.** Les 11 republications Vinted (créées 15:12 → 16:51)
  portent toutes `annulee_dans_la_file {par: "app (Ta file)", le: 2026-10-29 17:01:08}` : UN geste « Annuler » dans « Ta
  file » de l'app, sur ses sessions (Chrome du Mac), suivi 8 s plus tard de la mise en pause de sa file (usage_logs
  file_pause 17:01:16). Constat à côté : son planificateur créait une republication toutes les ~9 min pendant la
  restriction (jusqu'au 09/11), chacune retenue sans débit (hors_quota, 0 Pépite) ; la cadence est la tienne — à décider.
- **boncoin59300 — OUI, elle paie deux fois (aujourd'hui)** : Google Play Premium acheté le 26/10 à 09:54
  (`checkout_issue` google « reussi », produit app.fillsell.premium.standard, fin de période 26/11 09:53, aucune
  résiliation reçue) ET Stripe Premium `sub_1UVwuU…` créé le 29/10 à 18:14:42, facture F4HSPMF0-0092 **payée 12,99 € à
  18:15:20**, active, prochain prélèvement le 29/11. Rien résilié, rien remboursé. Seul compte dans ce cas (relu en base).
  Règle corrigée : le paiement web refuse désormais un 2e abonnement au même palier (rien créé chez Stripe).

## Partie 6 — Prérequis techniques du Cloud — CLOS
- **Prise atomique** : existait (trois RPC, FOR UPDATE / SKIP LOCKED / compare-and-swap) avec UN trou : deux exécutants
  d'un MÊME poste prenaient le même job. `prendre_job` (migration **20261030100000 APPLIQUÉE**, service_role seulement) :
  une transaction, seulement depuis « pending ». **Preuve de concurrence** (Postgres 17 jetable,
  `scripts/cloud/preuve-prendre-job-concurrente.mjs`) : 200 jobs × 16 connexions × 4 postes → 0 double ; ancien chemin
  même poste → le trou se voit (50 doubles) et prendre_job le ferme (0) ; extension + Cloud en même temps → 0 double ;
  arrêt utilisateur et lecture d'origine gardés. Les 3 RPC de l'extension : md5 inchangés.
- **Connexions chiffrées** : `cloud_coffre` (AES-256-GCM, clé hors base) existait ; ajouté le trousseau (rotation de clé
  sans rien rendre illisible), test vert. Restent à toi : le sel `cloud_empreinte_sel`, la sauvegarde de `COFFRE_CLE`.
- Rien ne change pour les utilisateurs de l'extension.

## Livraison
- **Push** : accepté (`8558ee5..6e59937`, 23:31) ; le second push (ce rapport) suit. Aucun garde-fou n'a refusé.
- **Commits** : `7209be3` (lot C, code + docs), `6e59937` (EXTENSION_LAST_COMMIT recalé, 0.6.157 inscrite publiée).
- **Date** : le lot a d'abord été daté « 30/10 » par erreur ; tout est redaté au 29/10 (heure relue en base). Les deux
  migrations gardent leur numéro (`20261030…`, appliquées) et le « (30/10) » de leurs commentaires, tels qu'appliqués.
- **Extension 0.6.159 PRÊTE** : `build\CWS-0.6.159-A-TELEVERSER\fillsell-extension-0.6.159-6e59937-cws.zip` (seul dans son
  dossier ; BUILD_ID `2026-10-29T22:28:02Z+6e59937`, 594 600 octets, sha256 `2a00c1cc…ef20`). Elle contient tout ce
  qu'avait la 0.6.157 (construite au-dessus). La 0.6.157 est SERVIE (6 comptes ont tourné des tâches sous
  `40dcb82 · v0.6.157`, dernière 22:52:56) : inscrite dans ALREADY_PUBLISHED, son dossier rangé dans
  `build/anciens-zips/PUBLIEE-SERVIE-2910-CWS-0.6.157`. EXTENSION_MIN_BUILD non touché. Ton poste : copie propre posée
  (`C:\Users\nicol\FillSell-Extension-Nico`, code identique à l'essai — seul le BUILD_ID change ; sauvegarde
  `build/anciennes-extensions-nico/FillSell-Extension-Nico-SAUVEGARDE-0.6.159-8558ee5-dirty-20261029-2330`).
- **OTA 2.9.136** : canal production relu 2.9.135 → **2.9.136** (23:30), build `2026-10-29T22:29:37Z+6e59937`. Web :
  `build.json` = `2026-10-29T22:31:45Z+6e59937`, script d'entrée 200 avec `Origin`.
- **Fonctions** (version et verify_jwt relus avant / après) : lens-analysis v112 → **v114** (true) ; create-checkout-session
  v58 → **v60** (true). (v113 / v59 déployées à 23:22, redéployées à 23:27 depuis l'arbre commité après la correction des
  dates — commentaires et version du prompt seulement.) OPTIONS 200 sur les deux.
- **Migrations** : `20261030090000_lecture_origine_suivie` et `20261030100000_prendre_job_atomique` appliquées + repair ;
  inverses dans `supabase/rollbacks/`.
- **Réparations / essais de données** (toutes sur le compte de Nico, sauvegarde + inverse) :
  `_backup_2910_essai_clic_publier` ↔ `scripts/essais/20261029_test_clic_publier_nico{,_REMISE}.sql` (remis) ;
  `_backup_3010_essai_lecture_origine` (nom de table gardé) ↔ `scripts/essais/20261029_test_lecture_origine_nico{,_REMISE}.sql` ;
  dépôt LBC 3297910134 ↔ `scripts/essais/20261029_test_lbc_marque_identifiant_nico{,_RETRAIT}.sql` (retiré 23:10).
- **Contrôle final (23:32 → 23:45)** : stock **ROUGE 0** (blanc 23 lignes / 8 comptes, file 492 / 14, orange 839 / 33) ;
  **0 job en processing** ; au plus 1 job par fiche × plateforme × action dans l'heure (aucune boucle de jobs) ; 2
  demandes de lecture ouvertes, celles de comptes dont l'ordinateur est éteint depuis le 22 et le 23/10 (extensions
  492f753 et 4098342) — elles partiront à leur retour. **Boucle du poll** : ton poste 7 appels en 20 min ; la boucle
  connue (postes 0.6.146 → 0.6.155) s'arrête au passage en 0.6.157 — prouvé sur cecibo2011 (1 353 → 1 441 appels / 10 min
  sous 0.6.153 de 22:30 à 23:10, puis 5) et lespetitesannonces (≈ 245 → 6) ; chaowx1305 et doriane-henri bouclent
  encore (≈ 285 / 10 min, 0.6.153) jusqu'à la mise à jour de leur Chrome.
- **Selftests** : suite complète 496 — 0 rouge (avant le commit) ; les 13 du lot rejoués verts après la correction des
  dates ; serveur-cloud 19/19 + simulation 5/5.

## En bref
| Partie | État |
|---|---|
| 1. Description d'origine | **CLOS** (règle, extension, écran, mesure ; clic réel 400 ms, téléphone 14 – 31 s) — l'écran d'attente pas vu à l'œil (lecture trop rapide), Edge non testé |
| 2. Bordereaux | **CLOS côté code** ; **RESTE** : la vente de bout en bout (aucune commande sur ton compte) et les 16 commandes d'Ornella figées depuis le 26/10 (question ci-dessus) |
| 3. Lens | **CLOS** (Haiku 5.5 + règle du visible, 0,024 $/scan) ; RESTE : VTech, Casio → « G-Shock » |
| 4. Leboncoin marque | **CLOS** (identifiant, dépôt réel prouvé puis retiré) |
| 5. Vérifications | **CLOS** (tiblancdeshaut : c'est lui ; boncoin59300 : paie deux fois — rien remboursé, à toi) |
| 6. Cloud | **CLOS** (prendre_job + preuve, coffre à trousseau) ; RESTE à toi : sel, sauvegarde de COFFRE_CLE |
| Toi | téléverser la **0.6.159** (« Envoyer pour examen ») ; décider pour boncoin59300 et pour la cadence de tiblancdeshaut |
