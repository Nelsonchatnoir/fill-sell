# Lot B — promesses XEWER, le texte du vendeur, paugues, zéro rouge (29/10/2026, soir)

Consigne de Nico (29/10 ~18:30) : 4 parties (promesses à XEWER avant le 01/11, le texte du vendeur jamais réécrit,
la preuve « compte business » de paugues, zéro rouge). Heures de Paris. Enquêtes menées en parallèle (lecture seule),
correctifs écrits par lots indépendants, intégrés, testés et livrés depuis ce terminal. Livraison : fin du rapport.

**Push** : un seul push de tout le lot (code, docs, essais) sur `main`, après ce rapport. **Extension à téléverser : la
0.6.157** (la 0.6.156, envoyée un temps dans la conversation, est remplacée — voir 4.4).

## Partie 1 — promesses à XEWER (formulations exactes retrouvées dans Gmail)
Les promesses ne sont écrites nulle part dans le dépôt : elles sont dans les réponses de Nico citées par les mails de
XEWER (`xxewwer@gmail.com`, fils « ta suggestion de publication programmée ») — 21/09 15:42, 26/09 18:33, 02/10 18:54,
26/10 14:02, 27/10 18:41. Mot pour mot (27/10) :
- « le titre, la description et le prix ne se remplissent plus d'office. Tu écris directement les tiens, et si un jour
  tu veux un coup de main, un bouton te permet de les faire générer par l'IA, champ par champ. » (26/10 : « Ce sera un
  réglage, pour que chacun choisisse sa façon de travailler. »)
- « aller directement à la création de l'annonce après l'analyse, sans repasser par la fiche d'estimation. Ceux qui
  aiment consulter l'analyse pourront toujours le faire. »
- « tu enregistres une fois ton propre modèle (ta structure de titre, ta structure de description, les infos que tu
  mets toujours, ta façon de présenter l'état), et FillSell s'en sert à chaque annonce, en le combinant avec l'analyse
  des photos, les infos détectées et ce que tu dictes au micro. »
- « ta logique de prix fera partie de tes consignes. Vente rapide à prix attractif, prix du marché ou prix plus haut
  pour attendre le bon acheteur, c'est toi qui choisis ta ligne, et l'estimation la suivra. »
- Plus anciennes, déjà tenues : programmation des publications (D4, 26/10), âge Beebs par le PEGI (D1), colis Leboncoin
  par défaut (D2), 20 photos dont 5 lues par l'analyse (26/09), « Marquer comme vendu » (02/10), « quand un article a
  déjà votre texte, il part tel quel » (21/09) — cette dernière ne tenait PAS pour un texte tapé à la création (partie 2).

- **1.1 Titre, description, prix facultatifs — CLOS.** Réglages › Rédaction et consignes IA : « FillSell écrit tout »
  (défaut, rien ne change) / « J'écris, FillSell m'aide champ par champ » (`redaction.a_la_demande`). À la demande, les
  trois champs restent vides — depuis Lens aussi (le titre et le prix du scan ne remplissent plus rien, trou du D3 du
  26/10). Un bouton par champ, dans les deux modes et les deux peaux : « ✨ Générer avec l'IA » / « ✨ Estimer avec l'IA ».
  Champ rempli → feuille « Remplacer ta description ? » (ton texte / la proposition, « Garder mon texte » par défaut).
  Gardes à l'envoi : « Titre à écrire », « Prix à donner », « Description à écrire » (ou le bouton) ; un titre vide ne
  repart plus avec celui de FillSell sans le dire. Quotas : une proposition passe par generate-listing comme une
  rédaction d'aujourd'hui (même article sous 24 h = gratuit, `spend_coins_for_generate`).
- **1.2 Lens → l'annonce — CLOS.** « Créer l'annonce » (et « Ouvrir l'annonce dès la fin de l'analyse », sur le viseur
  et dans Réglages) ouvre directement l'écran des champs, pré-rempli (photos dans l'ordre, marque, modèle, état,
  catégorie, attributs, annonces rédigées, note et prix d'achat du viseur) ; « Voir l'analyse » y ramène sans rien
  perdre. Rien n'est publié sans le geste. « Ajouter au stock seulement » garde le parcours d'avant. Pas d'enchaînement
  automatique sur un article vendu, un échec, ni une identification incertaine (choix de prudence, à valider).
- **1.3 Consignes — CLOS.** Dictée vérifiée d'abord : elle manquait sur 16 champs de texte libre (titre, description,
  lot, questions, ajout au stock, modale « Modifier », messagerie, support, consignes) → `BoutonDictee` partout
  (ajoute, jamais ne remplace) ; doublon du micro Lens sur le web corrigé. Consignes : ton, structure des titres, format
  des descriptions, présentation de l'état, à toujours mentionner, à éviter — propres au compte, appliquées à chaque
  rédaction (scan et écran de publication), jamais sur un texte tapé. La note dictée du viseur et la « précision » de
  l'écran de publication entrent enfin dans la rédaction (`notes` n'était lu nulle part).
- **1.4 Stratégie de prix — CLOS.** « Vente rapide, prix attractif / Prix du marché / Prix plus haut, attendre le bon
  acheteur » (`redaction.strategie_prix`, défaut marché) : la borne de la fourchette du marché, dans le résultat Lens,
  le prix proposé par le scan (fiche et écran) et « Estimer avec l'IA » ; dite avant la publication (« Prix estimé selon
  ta stratégie : vente rapide » / « Ta stratégie de prix : … Un prix que tu tapes n'est jamais changé »).
- **1.5 Écran Lens — CLOS.** Viseur, résultat, chargement, échec, quota atteint et historique refaits (maquettes
  validées) ; logos des plateformes en orbite autour du bouton photo (coupée si « réduire les animations ») ; aucune
  fonction perdue (photo, galerie, 20 photos dont 5 lues, note dictée, identification, quotas, reprise d'un scan coupé,
  vente). Historique : 20 derniers scans (`lens_scans`, lecture bornée), rouvrables. Clair seulement (l'app n'a pas de
  thème sombre) : `color-scheme: light` pour qu'un téléphone en mode sombre ne l'altère pas. Contrôlé à 360, 375 et
  430 px (banc local, aucun débordement). Corrigé au passage : la reprise d'un scan terminé ne posait pas l'article du
  scan (publier ensuite créait une seconde ligne d'inventaire).
- **Bordereaux bêta Leboncoin / Beebs / eBay (mail du 27/10, XEWER a dit oui le 29/10 à 16:15) — RESTE (lot C)** :
  aucun drapeau ne l'ouvre — `bordereaux_ouverts_pour` les ferme pour tous hors Vinted, bêta comprise. Décision et
  chantier : Nico, lot C.

## Partie 2 — le texte du vendeur n'est jamais réécrit
- **Cause PROUVÉE** (paugues, « Jazz man » 1793117541271, 27/10) : la fiche est créée au Stock à 17:12:23 avec son
  titre et sa description, SANS marqueur (la création n'en posait jamais : `App.jsx` addItem, modale, Lens, vocal). Les
  quatre décideurs (generate-listing, l'écran, `texteDeLaFiche.js`, `contenu-fiche.js`) exigeaient un marqueur ou une
  origine de relevé → « notre brouillon » : generate-listing (17:12:36, texte_vendeur_titre=false,
  texte_vendeur_description=false) a réécrit titre et description (gabarit Vinted : « Envoi rapide et soigné ! 🎨✨
  #peinture #acrylique #jazz… »), elle a retouché ce texte dans l'écran, et la retouche a été recopiée sur la fiche
  (marqueur « manuel » à 17:12:44) → job = stock (ce que Nico a vu), son texte d'origine perdu (aucun historique).
  Mesure sur 30 jours : 56 fiches tapées à la main (15 comptes), 21 titres réécrits (8 comptes), 11 descriptions du stock
  remplacées par la copie de l'IA (paugues 10, lohanobert59 1), 4 annonces parties avec le texte de l'IA. XEWER : ses
  textes restent les siens, mais l'état qu'il écrivait (« bon état ») était remplacé à l'envoi par celui de la fiche
  (Mario Kart Wii 1793095499602, Tony Hawk's Downhill Jam 1793116418631 : le drapeau était lu à l'ouverture de l'écran).
- **La règle corrigée, pour tous** (`src/utils/sourceDuTexte.js`, une seule règle app + serveur) : sur une fiche du
  stock, tout texte sans marque de FillSell (lens, vocal, ia) est celui du vendeur ; marqueurs posés à la naissance
  (manuel, lens, vocal) ; un texte « manuel » n'est plus touché (ni marque retirée du titre, ni mots retirés) ; à l'envoi,
  le texte du vendeur se lit sur la fiche relue et sur la retouche. L'IA n'écrit que dans un champ vide ou sur demande
  (partie 1.1). La règle du 21/09 tient à la publication (contenu-fiche.js inchangé : aucune annonce déjà en ligne
  réécrite en masse — les textes perdus ne sont pas reconstituables sans preuve de ce qu'avait tapé le vendeur).
- **Preuve réelle (ton compte, 29/10 ~19:40) — CLOS** : fiche 1793300100000 créée comme l'ajout au Stock le fait
  désormais (marqueurs « manuel »), description tapée avec retours à la ligne, guillemets et « en bon état », publiée sur
  Vinted (999 €, rayon 5564, question « Pour qui ? » répondue comme l'app) → annonce **10587366165** ; page publique relue
  (curl) : description **IDENTIQUE octet pour octet**, titre « TEST FillSell 999 ne pas acheter - Jazz man boutons ».
  Retirée (job 08dd44ec deleted, page 404), ta file remise en pause. Scripts : `scripts/essais/20261029_test_texte_
  vendeur_vinted_nico*.sql`. 
- **Banc (le vrai écran, faux serveur, 29/10 20:01–20:03) — 11 parcours sur 11 verts, dans les deux peaux** : la fiche
  du Stock est montée comme StockTab le fait (Vinted, 999 €) ; le faux generate-listing rend TOUJOURS la copie de l'IA
  (le pire cas). Fiche sans marqueur (tapée avant le correctif) et fiche « manuel » : titre et description passés à
  `spend_coins_and_publish` **octet pour octet** (retours à la ligne et ligne vide compris), étiquette « Ton texte ».
  Témoin « lens » (notre brouillon) : la copie de FillSell, étiquetée « Écrite par FillSell, relis-la ». Fiche rouverte
  alors qu'une copie de l'IA est déjà enregistrée (le cas des 56 fiches d'avant) : le texte de la fiche, 0 appel à
  generate-listing. Aucune écriture du titre ni de la description sur la fiche. Vu au passage (hors sujet, à regarder) :
  sans resolve-categorie, le repli par mot range une peinture dans « Outils et accessoires de peinture › Pinceaux ».

## Partie 3 — paugues : la preuve « compte business »
- **Source précise** : table `usage_logs`, `feature = 'releve_ventes'`, `metadata.motif =
  'compte_non_individual_business'` — **6 lignes, du 19/10 à 19:39:19 au 29/10 à 13:40:07**, déclencheur `cron`, builds
  492f753, 7b08e45, 9b634bd, f567f2e. Écrites par l'extension de **SON Chrome** (son seul poste, b2101271…,
  `extension_postes`) : `chrome-extension/background.js:19313` appelle `GET
  https://api.leboncoin.fr/api/account/v2/members/me/account` avec le jeton Leboncoin de l'onglet de SA session
  (`localStorage.luat`) et écrit `compte_non_individual_${account.type}` — « business » est la valeur que Leboncoin a
  répondue, recopiée telle quelle. Ce n'est pas dans extension_sessions, platform_settings ni platform_fields : d'où
  l'absence vue par Nico. Aucun navigateur de mon côté : la lecture est faite chez elle.
- **Rectifié** : le lot A datait la preuve « depuis le 21/10 » (c'est le 19/10) et citait « owner.type pro sur son
  annonce (16/10) » — aucune trace en base, page publique non relisible d'ici (403 anti-robot) : NON PROUVÉ, retiré du
  rapport du lot A. La preuve restante (la session de SON compte) suffit : le correctif reste.
- **Durci** (garde-fou « jamais le circuit pro sans preuve lue chez Leboncoin pour SON compte ») : au mur « Valider et
  payer », l'extension lit désormais TOUJOURS le type de la session qui dépose ; une lecture « individual » l'emporte sur
  la preuve du serveur et sur le formulaire pro (`decisionMurProLbc`, extension 0.6.157) ; type, heure et source
  (`session` | `serveur` | `formulaire`) gardés dans `lbc_depot`.
- **Comptes basculés depuis le correctif (29/10 17:49) : UN SEUL** — paugues.contact, job 93548ae4 « Lanterne marine
  Stern » (29/10 17:57, adsubmit 3297762677, `ecran_options_payant_pret`). Comptes que la même preuve désigne pro
  (usage_logs, 45 jours) mais qui n'ont touché aucun mur depuis, donc rien basculé : batix-pilotage (2 postes),
  boitellealexia, contact.grizstyle, famouus-x3 (2 postes), locolutins, recrutementgroupezk704, s.mussard07, sebimsn10.
  Pour un compte à deux postes, la lecture à la session qui dépose (0.6.157) tranche.

## Partie 4 — zéro rouge
Méthode : `docs/sql/controle-stock-zero-rouge.sql` (dernier état article × plateforme depuis le 18/09, comptes à
extension vue en 7 jours ; file qui avance en 24 h = « file » ; ordinateur éteint > 12 h = orange ; restriction de compte
= blanc). Avant les correctifs (29/10 ~19:00) : 7 failed, 60 needs_user, 3 processing, 6 retraits en attente, 121
publications et 1 185 republications en attente.
- **4.1 mele.marta — CLOS (cause : nous ; mapping juste).** Le rayon était le bon (3026 Électronique › Jeux vidéo et
  consoles › Jeux, accepté 51 fois en 30 jours, dont son propre F1 2015 du 24/10) : sa page Vinted est en ITALIEN et son
  poste (0.6.149) descendait par libellés français → fausse question « Vinted ne propose pas « Électronique » ». Règle :
  langue jugée sur les racines du catalogue, pose par identifiants avant toute question, jamais « ne propose pas » sur
  une page étrangère, question de racines étrangères ≠ rayon refusé. Le job passe en pause « mise à jour » (message
  neutre, question retirée) et repart une fois seul quand son poste a la 0.6.153+. ⚠ Une fiche jumelle « Gioco PS4 - F1
  2015 » est déjà en ligne (10508032318) : deux fiches = deux exemplaires, à lui demander (jamais une fusion).
- **4.2 tiblancdeshaut — CLOS.** Le sac Michael Kors et le pantalon de ski avaient été déposés AVANT le retrait du sweat,
  vus par un relevé après (aucun relevé du 26/10 12:21 au 28/10 08:15). Règle : une candidate vue avant le retrait
  (listes « Mes annonces » de nos dépôts Beebs, date de mise en ligne Leboncoin), confirmée par un autre job d'une autre
  fiche, ou rattachée à une autre fiche, est écartée — jamais rattachée. Le sweat est revenu seul (34261432, 29/10 18:32).
- **4.3 jocabroc8 — RESTE (Leboncoin ; la personne).** Dépôt réel (adsubmit 201, id 3296909529, « Votre annonce est
  publiée », 28/10 11:54), absent de 5 relevés complets → refus de la modération Leboncoin, motif dans le mail que
  Leboncoin lui a envoyé. Rien de notre fait trouvé (même rayon et mêmes critères que ses assiettes Wasmuël acceptées le
  23/10 ; 1 dépôt jamais en ligne sur 82 en 14 jours). Le « dépôt du 29/10 14:11 à 4 tentatives » est un autre article
  (Ridgway e2a32d4f), publié au 5e essai (3297689730). Aucune relance (même contenu, même refus).
- **4.4 boncoin59300 — CLOS pour la marque fausse ; RESTE : la recherche de marque muette, et le motif des refus.**
  Défaut PROUVÉ : la marque Leboncoin est un champ de recherche ; le pré-rempli que Leboncoin devine était gardé et dit
  « hors liste » sans recherche (« Vintage Dressing » posé sur le manteau « Fourrures D.S Paris »). Mesuré : la
  recherche par frappe n'a JAMAIS répondu en production (594 recherches, 0 marque trouvée).
  **Essai réel n° 1 (ton compte, 0.6.156, 20:26, dépôt 3297848873)** : la frappe de « Jordan » a VIDÉ le champ, la
  recherche est restée muette (menu « 1 enfant, texte vide »), « Nike » — que le titre nomme — n'a pas pu être remis :
  annonce partie SANS marque, là où la 0.6.155 gardait « Nike » (≈ 123 dépôts en 14 jours, 12 comptes, passaient par ce
  chemin). La 0.6.156 n'a donc PAS été livrée. Règle corrigée (0.6.157) : un pré-rempli que l'article NOMME reste, sans
  aucune frappe ; un pré-rempli que l'article ne nomme pas (marque devinée, règle P8 du 15/10) : notre marque tapée, puis
  « Autre » ; recherche muette → champ vide, jamais la marque devinée. **Essai réel n° 2 (0.6.157, 20:47, dépôt
  3297858252)** : « pré-rempli LBC "Nike" CONSERVÉ — l'article nomme « Nike » », aucune frappe, dépôt confirmé (201,
  « Votre annonce est publiée »). Les deux annonces retirées. RESTE : faire répondre la recherche (le diagnostic dit
  désormais l'état de l'onglet ; piste non prouvée : liste virtualisée non dessinée dans un onglet en arrière-plan) —
  d'ici là, « Jordan » n'est jamais posé à la place d'un « Nike » que l'article nomme. Motif des deux refus : non prouvé
  (manteau en renard = animal sauvage, interdit par Leboncoin depuis le 21/09/2023 : cause la plus probable). Aucune
  relance sans le motif.
- **4.5 Dépôts Beebs « fantômes » — CLOS (refus Beebs prouvé ; notre règle corrigée).** Les trois dépôts sont ARRIVÉS chez
  Beebs (numéros 34200634, 34200711, 34198358 lus en vérification juste après le clic), puis retirés de la vérification
  sans mise en ligne (louis : ~3 min) ; index public et pages : absents. Défaut : deux juges ; le SQL jugeait « jamais en
  ligne » sur le compteur de l'INDEX (précédent Polly : jugée absente, en ligne le 28/10). Migration
  **20261029200000 appliquée le 29/10 à 20:10 sur ton feu vert** (corps relu en prod juste avant : md5 6ea3fdf3… =
  celui de l'essai ; après : a9538270…) : la seconde boucle ne conclut « jamais en ligne » que sur une lecture qui a vu
  TOUTE la page, ou deux constats 404 du numéro exact à 6 h d'écart, 7 jours au moins après la dernière vue « en
  vérification », jamais à 500 € ou plus ; sinon `pas_encore_visible`, jamais « refusée ». Le message dit les deux
  heures constatées (« en vérification à … le …, n'y était plus à … le … »). Essai à blanc 24/24 ; inverse :
  `supabase/rollbacks/20261029200000_beebs_un_seul_juge_jamais_en_ligne_INVERSE.sql` (corps d'avant + suppression des
  trois fonctions neuves). Aucune copie achetable : les 6 numéros des points 4.5 et 4.9 sont absents de l'index public
  de Beebs (lu à 18:47).
  Assassin's Creed (XEWER) est vendu sur eBay depuis le 23/10 : rien à faire. louis : pas de recréation d'office.
- **4.6 XEWER, 10 jeux refusés — CLOS (refus Beebs prouvé ; notre faute : la relance à l'identique).** Rayon, âge (PEGI),
  état, prix, photos : identiques à ses jeux acceptés. Constat chiffré (pas une cause prouvée) : 0 sur 87 en ligne avec
  « Jeu testé aujourd'hui, le … et fonctionnel », 35 sur 42 sans ; le seul du lot du 29/10 sans cette phrase (Pirates des
  Caraïbes, 1bcdf638) est en ligne (34260368). Règle : un refus prouvé ne se relance plus à l'identique (« Change
  d'abord le texte, les photos ou le rayon »). Aussi : « xbox » seul n'est plus « Xbox Series » sur Beebs.
- **4.7 doriane-henri — CLOS (pas un blocage).** Ses tâches sont PROGRAMMÉES par son réglage (18:30–19:15, 10 par jour,
  une à la fois ; le plafond compte les annonces, une plateforme = une annonce) : à 15:23 le créneau était fermé ; le soir,
  10 parties de 18:32 à 19:14, puis plafond atteint (relu à 20:45 : 100 tâches en attente, 28 articles, toutes « programmée »,
  aucune erreur, extension 0.6.153 vue à 20:45:20) → ~10 jours à ce rythme. Les 19 « publiées » de 18:28 = un relevé. Risque latent corrigé : la
  marque « programmée servie » n'est posée que sur la tâche réellement rendue.
- **4.8 ornellaracano — RESTE (geste : compte de test).** Garde de boutique : son Chrome est sur @luciatrendyshop, les 4
  articles sont sur @ornella-vend (472079) ; 3 captures 404 « mauvaise boutique ». Ouvrir @ornella-vend sur vinted.fr dans
  le Chrome de ce poste : elles partent seules.
- **4.9 Retraits Beebs — CLOS pour nos règles ; Dayane RESTE (mur Beebs).**
  - **Dayane (recrutementgroupezk704), 34083555 — RESTE (Beebs).** En vérification depuis le 30/09 (relevé du 29/10 à
    16:54) : ni visible ni achetable, et Beebs ne permet pas de supprimer une annonce en vérification. Blanc. ⚠ L'état
    de prod du lot A attendait sa clôture « par la page » (404) : FAUX, rectifié dans `docs/agents/etat-2026-10-01.md`.
  - **sebastien64310, 34219819 — CLOS.** Jamais mise en ligne par Beebs ; la garde de 7 jours la clôt seule (après le
    30/10 vers 10:09). Défaut trouvé et corrigé : le filet qui réarme un retrait revu EN LIGNE exigeait une fiche
    « vendu » ; sa fiche est supprimée (inventaire_id vide) → jamais réarmé si Beebs la publiait tard = double vente
    possible. **Migration 20261029201000 appliquée le 29/10 à 20:10 sur ton feu vert** (md5 avant 0756d52c…, après
    15f9ba27…) : sans fiche, la vente se prouve par SA ligne de ventes (même compte, autre plateforme, non annulée, née
    à ± 2 min de l'armement du retrait). Essai à blanc 11/11 ; inverse :
    `supabase/rollbacks/20261029201000_beebs_rearmer_retrait_vente_sans_fiche_INVERSE.sql`.
  - **josephinecerni, 33911382 — CLOS côté règle, la clôture se fera seule.** FillSell a ENVOYÉ la suppression le 26/10
    au soir ; la preuve exigeait « Mes annonces » lue en entier, impossible sur son poste (0.6.150). Règle : après une
    suppression envoyée, les constats « page 404 » d'après l'envoi comptent (deux à 6 h d'écart), sans consommer d'essai
    (update-job-status v156, extension 0.6.157). Clôture constatée : non encore (à vérifier au prochain check).**
- **4.10 famouus-x3 — CLOS (légitime).** Vraie restriction Vinted jusqu'au 05/11, lue sur /selling-restriction le 29/10 à
  10:19 ; « capture incomplète » n'était qu'une trace sur un job reparti. Défaut corrigé : la sortie de restriction passe
  désormais par les paliers (10 par jour, une toutes les 45 min) au lieu de tout lancer le 06/11 à 00:05.
- **4.11 Postes non mis à jour — CLOS (pas leur Chrome, pas nous pour ceux-là).** abenjemaa, labouquinerie85, bigfoutte09 :
  éteints depuis le 28/10 au soir, AVANT que la 0.6.152 soit servie (29/10 ~00:15) ; chaowx1305 et tiblancdeshaut à jour
  à leur retour. Défaut de notre mécanisme trouvé ailleurs (2189c4d8) : une republication retenue par le serveur
  bloquait la mise à jour sans fin — corrigé (0.6.157). ⚠ Trouvé en plus : une BOUCLE de poll (postes 0.6.146 → 0.6.155,
  jusqu'à 913 appels/h au lieu de ~30 ; 6 763 appels de get-pending-jobs entre 18:45 et 19:45) — corrigée dans la 0.6.157 (déjà dans la 0.6.156, jamais téléversée).
- **Contrôle final** : 29/10 à 20:48:58, après les tests réels (`docs/sql/controle-stock-zero-rouge.sql`) : **ROUGE 0** —
  blanc 24 lignes (9 comptes), file 525 (15), orange 835 (30). Aucun job en `processing` (0 à 20:49), aucun `failed`
  créé depuis 20:00, mele.marta 2fd83d73 en pause neutre « mise à jour » (`build_min_requis`). Boucle du poll : ton poste
  (0.6.156 puis 0.6.157) ≈ 6 lectures en 9 min ; le parc (postes 0.6.146 → 0.6.155) reste à ~1 200 – 1 400 appels de
  get-pending-jobs par 10 min (20:20 → 20:50) jusqu'à la 0.6.157 servie par le Chrome Web Store. Selftests : suite
  complète 493, zéro rouge (20:41).

## Livraison
- **Extension — LE zip à téléverser** (seul dans son dossier) :
  `C:\Users\nicol\fill-and-sell\build\CWS-0.6.157-A-TELEVERSER\fillsell-extension-0.6.157-40dcb82-cws.zip`
  (BUILD_ID `2026-10-29T19:41:53Z+40dcb82`, 591 350 octets, sha256 `514f2b8554139c60bf9bd5efc714d7c24c0639edb0e89717bfb31ad6e2d11dda`),
  envoyé aussi dans la conversation. Anciens zips : 0.6.155 → `build/anciens-zips/JAMAIS-SERVIE-REMPLACEE-PAR-0.6.156-CWS-0.6.155/`
  (servie à aucun compte : seul ton poste la portait) ; 0.6.156 (96793d4, envoyée à 20:2x puis retirée : la marque
  Leboncoin) → `build/anciens-zips/JAMAIS-TELEVERSEE-REMPLACEE-PAR-0.6.157-CWS-0.6.156/`. Ton poste : 0.6.157 depuis
  20:44:16 (copie posée 20:42, sauvegardes 0.6.155 et 0.6.156 dans `build/anciennes-extensions-nico/`).
  Geste à toi : téléverser ce zip sur la fiche du Chrome Web Store, puis « Envoyer pour examen ».
- **OTA 2.9.135** : canal production relu 2.9.134 à 20:22, envoi 20:23, relu **2.9.135** ; build `2026-10-29T19:22:37Z+c09c9d2`.
- **Fonctions déployées** (version et verify_jwt relus avant et après, 20:21) :
  beebs-lien v15 → **v16** (verify_jwt false) · ebay-api-worker v99 → **v100** (false) · generate-listing v125 → **v126**
  (true) · get-pending-jobs v301 → **v302** (true) · handler-watch v147 → **v148** (false) · lens-analysis v111 → **v112**
  (true) · ops-digest v42 → **v43** (false) · update-job-status v155 → **v156** (false). verify_jwt inchangé partout.
- **Migrations** (feu vert nommé de Nico, appliquées à 20:10 par `db query --linked -f` + `migration repair --status applied`) :
  `20261029200000_beebs_un_seul_juge_jamais_en_ligne` (trancher_publications_sans_lien md5 6ea3fdf3… → a9538270…, trois
  fonctions neuves) et `20261029201000_beebs_rearmer_retrait_vente_sans_fiche` (retraits_beebs_rearmer_revus md5 0756d52c…
  → 15f9ba27…). Sauvegardes du corps lu en prod : `scripts/essais/2026102920*_avant.sql` ; inverses :
  `supabase/rollbacks/20261029200000_beebs_un_seul_juge_jamais_en_ligne_INVERSE.sql`,
  `supabase/rollbacks/20261029201000_beebs_rearmer_retrait_vente_sans_fiche_INVERSE.sql`.
- **Réparations de données** : aucune. **Mails** : aucun. **Stripe** : rien.
- **Tests réels sur ton compte (999 €, tous retirés)** : Vinted 10587366165 (texte tapé octet pour octet) ; Leboncoin
  3297848873 (0.6.156, marque partie vide → correctif) ; Leboncoin 3297858252 (0.6.157, « Nike » que l'article nomme CONSERVÉ, aucune frappe) ; Scripts : `scripts/essais/20261029_test_*_nico*.sql`.
  Ta file est remise en pause après les retraits ; les fiches de test restent dans ton stock (les supprimer = ton geste).
- **Selftests** : suite complète 493, **zéro rouge** (20:03 → 20:12 avant la 0.6.156, puis 20:32 → 20:41 avec la 0.6.157) ;
  lint : aucune erreur neuve dans les fichiers touchés ; banc 11/11.
- **Commits** (sur main) : 2d09632 (code du lot), 96793d4, c09c9d2 (2.9.135), b000942 (0.6.157), f2ca67c, 40dcb82 et le commit de ce rapport.

## Ce qui RESTE (le reste est CLOS)
- **Toi** : téléverser la 0.6.157 sur le Chrome Web Store (« Envoyer pour examen ») — c'est elle qui arrête la boucle du
  poll sur tout le parc et porte les correctifs d'extension du lot (Vinted en langue étrangère, marque et compte pro
  Leboncoin, constats 404 Beebs, mise à jour non bloquée).
- **4.4** : la recherche de marque Leboncoin muette (piste à prouver) ; motif des refus de boncoin59300 (son mail).
- **4.3** : motif du refus de jocabroc8 (le mail de Leboncoin, à lui demander).
- **4.8** : Ornella ouvre @ornella-vend sur vinted.fr dans le Chrome du poste.
- **4.9** : Dayane 34083555, en vérification chez Beebs (mur Beebs) ; Joséphine : clôture seule à constater.
- **4.1** : mele.marta, deux F1 2015 — une question à lui poser (jamais une fusion).
- **Lot C** : bordereaux bêta Leboncoin / Beebs / eBay pour XEWER (aucun drapeau ne les ouvre aujourd'hui).
- **À regarder** : le repli par mot sans resolve-categorie (une peinture rangée dans « Pinceaux », vu au banc).

## Ce qu'on peut dire à chaque compte (partie 4)
- **mele.marta** : « Ton jeu était dans le bon rayon (Elettronica › Videogiochi e console › Giochi). FillSell cherchait les
  noms français sur ta page Vinted en italien : c'est corrigé. Ne choisis rien : ta publication repartira seule dès que ton
  extension sera à jour. As-tu deux exemplaires de F1 2015 ? Un est déjà en ligne sur ta boutique. »
- **tiblancdeshaut** : « Ton sweat GAP est revenu sur Beebs le 29/10 à 18:32. La question citait par erreur ton sac Michael
  Kors et ton pantalon de ski, déjà en ligne : c'était notre erreur, la règle est corrigée. Rien à faire. »
- **jocabroc8** : « Leboncoin a bien reçu tes 2 assiettes octogonales le 28/10 à 11:54 mais ne les a jamais mises en ligne :
  c'est un refus de sa modération, dont le motif t'a été envoyé par mail. Peux-tu nous le transférer ? Rien n'est vendu,
  l'article reste dans ton stock. »
- **boncoin59300** : « Leboncoin a reçu tes annonces du 26/10 (manteau et Air Jordan MA2) sans les mettre en ligne : refus
  de sa modération, motif envoyé par mail — peux-tu nous le transférer ? Nous avons corrigé la marque : FillSell ne
  laisse plus une marque devinée par Leboncoin (« Vintage Dressing » sur ton manteau). Pour le manteau, sache que
  Leboncoin n'accepte plus les fourrures d'animaux sauvages : c'est peut-être le motif. »
- **louis-seller** : « Beebs a bien reçu tes annonces « T-shirt Kiabi 10 ans » et « Maillot de bain Ariel 8 ans » le 20/10
  (n° 34200634 et 34200711), puis les a retirées de sa vérification quelques minutes plus tard sans les mettre en ligne —
  Beebs ne dit pas pourquoi. Rien n'est vendu ; pour réessayer, change d'abord les photos ou le titre. »
- **XEWER** : « Ce n'est ni la catégorie ni les champs : Beebs a refusé ces 10 jeux sans motif. Un constat : depuis le 1er
  octobre, aucune des 87 annonces dont la description dit « Jeu testé aujourd'hui, le … et fonctionnel » n'a été mise en
  ligne par Beebs, contre 35 sur 42 sans cette phrase. Essaie sur deux jeux en la retirant. Ton Assassin's Creed
  Chronicles s'est vendu sur eBay le 23/10 : rien à retirer sur Beebs. Et tes textes partent désormais mot pour mot, état
  compris. »
- **doriane-henri** : « Ta file n'est pas bloquée, elle suit ta programmation : 18 h 30 – 19 h 15, 10 annonces par jour,
  une plateforme comptant pour une annonce, une à la fois. Le 29/10, 10 sont parties de 18:32 à 19:14 ; la suite reprend
  chaque jour à 18 h 30 (tes 100 annonces en attente, 28 articles, prennent une dizaine de jours à ce rythme). Pour aller
  plus vite, augmente le nombre par jour ou coupe la programmation dans Réglages › Publication programmée. »
- **ornellaracano** : « Tes 4 republications attendent ta boutique @ornella-vend : ton Chrome est ouvert sur
  @luciatrendyshop. Ouvre @ornella-vend sur vinted.fr dans Chrome, elles partiront seules. »
- **recrutementgroupezk704 (Dayane)** : « Ton jean Levi's 511 est vendu. Sur Beebs, son annonce (n° 34083555) est en
  vérification depuis le 30/09 : ni visible ni achetable, et Beebs ne permet pas de la supprimer pendant sa vérification.
  Si Beebs la met en ligne, FillSell la retire aussitôt. Tu peux aussi demander à Beebs de la supprimer. »
- **sebastien64310** : « Ta jupe Alain Manoukian, vendue sur Vinted le 25/10, n'est pas en vente sur Beebs : Beebs ne l'a
  jamais mise en ligne (n° 34219819). FillSell clôt le retrait tout seul — rien à faire. »
- **josephinecerni** : « Ton mini short H&M vendu sur Vinted a bien été retiré de Beebs par FillSell le 26/10 au soir. La
  confirmation se fera toute seule quand ton extension sera à jour. »
- **famouus-x3** : « Vinted a restreint ton compte jusqu'au 05/11 : il refuse tout ajout et toute modification. Tes annonces
  sont intactes ; les republications repartiront seules après, au rythme normal. »
- **tiblancdeshaut, abenjemaa, chaowx1305, labouquinerie85, bigfoutte09** : « Ton extension se met à jour toute seule dès que
  ton ordinateur est allumé avec Chrome ouvert : rien à faire. »
- **paugues.contact** : « Ton compte Leboncoin est un compte professionnel (Leboncoin le dit à chaque lecture de tes ventes
  depuis le 19/10). Hors forfait, Leboncoin fait payer le dépôt : FillSell prépare l'annonce jusqu'à « Valider et payer »,
  sans jamais payer à ta place. Et ce que tu tapes part désormais mot pour mot : nous ne réécrivons plus tes textes. »
