# Nuit du 25 au 26/10 — refonte de la publication en lot + « zéro rouge de notre fait » (heure de Paris)

Prompt de nuit de Nico (25/10, 22:00). Ce fichier se remplit point par point ; le résumé pour Nico est en tête à la fin.

## 0. Proxy IPRoyal — FAIT
- Commande **#83578416** (ISP Dedicated, France, 1 IP, 30 jours : la même offre et le même compte qu'au 26/09) prolongée
  le 25/10 vers 22:05 depuis le tableau de bord IPRoyal (session déjà ouverte dans Chrome).
- Payée sur le **solde IPRoyal** (choix de Nico, demandé avant de payer) : **5,40 $** ; solde 16,00 $ → 10,60 $.
- Nouvelle échéance : **25/11/2026 à 11:19 (heure de Paris)** — relue par l'API (`expire_date` 2026-11-25 10:19:21 UTC,
  `extended_history` : la période du 26/09 au 26/10). Renouvellement automatique : toujours coupé (inchangé).

## 1. Refonte de l'étape 2 du lot — MAQUETTES (code de la refonte après la validation de Nico)
- Page **https://fillsell.app/demo/lot** : non listée, noindex, réservée au compte de Nico (toute autre session repart
  sur l'accueil) ; ses 32 articles sont lus avec sa session, les états sont simulés, rien n'écrit ni ne publie.
  Trois propositions (`?p=A`, `?p=B`, `?p=C`), la même feuille d'article pour les trois :
  - **A · La liste** — au lieu d'une grande carte par article, une ligne par question avec ses réponses en puces ;
    un seul « Tout valider » pour les textes ; les prêts repliés.
  - **B · Par question** — les questions rangées par sujet (toutes les tailles, puis les âges…) ; une réponse sert à
    plusieurs articles quand leurs listes sont les mêmes.
  - **C · Une à la fois** — une seule question à l'écran, en grand, avec la photo ; la suivante arrive dès la réponse.
- Banc : `node scripts/apercu/capture-maquettes-lot.mjs <lignes.json>` (lignes lues hors dépôt) — 390 px (2x) et 1280 px,
  contrôles : 32 cases, bilan exact, « Tout valider », feuille, cibles ≥ 44 px, champs ≥ 16 px, aucun débordement,
  aucune erreur de page : tout vert.

### 1b. Les défauts de fond vus sur l'écran de Nico — corrigés à la règle (commit du point 1)
- **Le livre « EAT »** : il A un ISBN, écrit sur sa fiche (« ISBN 9782981413604 », clé valide). La rédaction l'avait
  retiré de la copie, et l'app ne lisait QUE la copie ; puis les photos ont donné un faux numéro (« 9782897763 »,
  rejeté à raison). La question « cette catégorie n'accepte que « Ce livre n'a pas d'ISBN » » venait d'une liste à une
  valeur fabriquée par notre code : « Oui, confirmer » aurait publié sans ISBN un livre qui en a un. Corrigé :
  `resoudreIsbn` lit tous les textes, la fiche d'abord (deux ISBN différents → la question) — app ET serveur
  (get-pending-jobs) ; la ligne ISBN n'est plus traitée comme « la seule valeur acceptée » : elle garde sa vraie
  question (le numéro se tape, ou « Ce livre n'a pas d'ISBN » en un geste). Pour EAT : la question disparaît.
- **La montre G-Shock** : le rayon est le bon. Chez Beebs (et Vinted), la « Taille » d'une montre est le diamètre du
  boîtier (Jusqu'à 30 mm … 47 mm et plus) + « Taille unique ». L'IA y posait une valeur sans source
  (« 39 mm - 42 mm ») dans un canal que beebs.js ne lit pas, et le sélecteur partagé redemandait la taille. Corrigé :
  diamètre écrit (« boîtier 42 mm », « 45 mm de diamètre ») → sa tranche ; sinon « Taille unique », posée sur la copie
  (Vinted et Beebs) ; une taille ne part plus jamais à l'IA (même avec un champ dédié : la bague d'Elodie a reçu
  « 22,6 mm » de la même façon) ; sur Beebs, une valeur dans un canal sauté par l'extension n'est plus une valeur.
- **Le robot aspirateur** : l'arbre Beebs (579 feuilles) n'a AUCUN rayon pour un aspirateur (Petit électroménager =
  5 feuilles de cuisine) : aucune proposition honnête n'existe. Corrigé : sans candidat, la carte dit « Aucun rayon
  Beebs ne correspond à … » et propose « Pas sur Beebs » en un geste (même pour un article qui n'a que Beebs : il sort
  du lot) ; avec des candidats, les 3 premiers en puces ; la recherche vide ne s'ouvre plus d'office.
- **Le téléphone** : la marque était connue (Samsung). La liste « Modèle » relevée chez Vinted est celle d'Apple (le
  champ dépend de la marque, notre relevé ne la porte pas) : 50 iPhone servis à un Samsung. Corrigé : une liste de
  modèles Apple ne se propose qu'à un article Apple ; ailleurs le modèle se tape (l'extension le cherche dans la liste
  de SA marque). Reste : une vraie recherche dans toute la liste Vinted exige de relever les modèles PAR MARQUE
  (extension) — non fait cette nuit. « Espace de stockage » reste une vraie question (aucune source), en puces.
- **Titres coupés** : le titre du texte qui part est un champ de 2 lignes (plus une ligne qui le coupe).
- Selftest neuf `lot-defauts-2610` (36 contrôles) ; `livre-isbn-vinted` suit le nouveau code (43 contrôles).

### 1c. Le design B « Par question » — CODÉ (validé par Nico le 25/10 au soir)
- L'étape 2 du lot, hors envoi : le bilan en haut (prêts · à revoir · annonces, une case par article), UN « Tout
  valider » pour les textes écrits par FillSell (leurs vignettes ouvrent chacune sa feuille ; « Annuler » ensuite),
  puis les questions RANGÉES PAR SUJET (« Taille · Beebs », « Âge · Beebs »…, les plus nombreux d'abord), chacune
  répondue en un geste, en puces (≥ 44 px), par le MÊME bloc que le stepper (`BlocQuestions seulement`) ; la réponse
  commune se range dans son sujet ; « Le même poids pour les N » dans le sujet du poids. Ensuite la Livraison du lot,
  repliée (ouverte d'office en « Saisir le poids »), les refus Depop, les réponses reprises, et les prêts repliés.
  Toucher un article ouvre SA feuille (la carte d'avant : son texte, ses plateformes, « Pas sur … », « Le garder pour
  plus tard »). Pendant l'envoi : l'écran d'avant, inchangé.
- Aucune règle réécrite : les questions sont celles que le moteur compte (`clesQuestions`, exportées par le pilote) ;
  deux tailles = une question (comme le stepper). Dans une ligne, la phrase « Exigé … » répétée sous chaque article
  disparaît ; ce qui informe reste (valeur hors liste, où trouver l'ISBN, valeur lue).
- Garde-fous : un moteur qui lève ne met de côté que SON article (même barrière qu'avant, jamais tout l'écran) ; les
  prêts repliés restent rendus sous leur barrière ; un article à revoir a toujours une ligne (« À vérifier » ouvre sa
  feuille), sauf le texte seul que porte « Tout valider ».
- Preuves : selftest neuf `lot-par-question` (39 contrôles) ; banc `capture-lot-publication` (27 écrans à 390 px,
  2 à 1280 px : bilan, sujets, feuille, textes validés, poids saisi, article cassé) tout vert ; suite complète
  (441 selftests) verte ; `build:essai` OK. Le nombre de questions du lot de Nico avant/après : point 16.

## 12. Valeurs fausses dans les copies stockées — FAIT (ces 5 cas seulement)
- Script `scripts/reparations/20261026_copies_valeurs_fausses.sql` : simulation (transaction annulée) à 23:13, puis
  appliqué à **23:14:42** ; sauvegarde `_backup_2610_copies_valeurs_fausses` (5 copies + 3 fiches) ; inverse
  `20261026_copies_valeurs_fausses_INVERSE.sql`. Garde : chaque ligne devait porter la valeur d'avant attendue.
  | compte | annonce | copie (job source) | avant → après |
  |---|---|---|---|
  | chaouidz | Leboncoin 3294638238 | e7f181c8, `taille` | 16 → 31 |
  | chaouidz | Beebs 34229052 | 29f9116e, `taille` | 16 → 31 (correction tracée) |
  | louis-seller | Beebs 34200707 | ff37632d, `age` (+ fiche) | 8 ans - 12 ans → 16 ans et + |
  | josephinecerni | Beebs 33904993 | f8807f54, `age` (+ fiche) | 8 ans - 12 ans → 16 ans et + |
  | voirememe | Beebs 34174205 | 72d8c9aa, `age` (+ fiche « 8 ans - 12 ans ») | 2 ans - 3 ans → 3 ans - 4 ans |
- Les fiches (âge) : corrigées aussi (l'écran Publier relit la fiche) ; source « manuel » = le seul rang que la fusion
  des attributs laisse passer devant un relevé — « par » et « motif » disent que c'est ce script.
- ⚠️ chaouidz sur Beebs : à la republication, l'extension relit l'annonce et pose d'abord la taille AFFICHÉE (« 16 »).
  La correction est tracée (`correction_tracee`) ; elle passe devant la valeur affichée avec la nouvelle extension.
- Les 26 autres livres de louis-seller : non touchés. Aucune annonce en ligne modifiée, aucun job relancé, aucun mail.
