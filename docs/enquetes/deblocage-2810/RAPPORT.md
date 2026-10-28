# 28/10 soir — mission « débloquer tous les utilisateurs » (lots 1 Vinted et 2 Beebs / Depop / eBay / Leboncoin)

Consigne de Nico (28/10 ~21:00) : 14 points, preuve d'abord, déblocage serveur, correctif racine, test réel, commit.
Heures de Paris. Enquêtes en lecture seule menées en parallèle (Vinted 3-4-5, Beebs 8-9-10, Depop/eBay 11-14,
pont mort et bandeau 12-13), correctifs appliqués et prouvés depuis le terminal principal.

## Lot 1 — Vinted

### Points 1 et 2 — marque non posée (publication), État refusé (republication) : UNE cause, chez Vinted
- **Ce n'est pas la 0.6.149** : `git diff 9b634bd 9ca925f -- chrome-extension/content-scripts/vinted.js` est VIDE (la
  0.6.149 ne touche que la lecture d'origine dans background.js). La republication de vincent.armengol `a1642b6a` est
  arrêtée de la même façon en **0.6.148** (13:12), et XEWER aussi en 0.6.148 (12:00 → 13:12).
- **Constat réel** (compte Vinted de Nico, /items/new, 21:15) : Vinted a remplacé ses menus par un composant « bloom ».
  Le déclencheur est `<button id="_r_8_" class="select-root" data-testid="brand-select-dropdown-input">` ; la valeur
  choisie ne vit que dans `<span data-testid="brand-select-dropdown-input--value">` ; `<input class="select-proxy"
  name="brand">` reste VIDE après le choix ; `data-placeholder` tant que rien n'est choisi. Même chose pour Catégorie,
  Taille (testid devenu `category-size-single-grid_chips-input`), État, Couleur, Matériau. Les lignes du menu ont gardé
  leurs identifiants (`brand-<id>`, `#custom-select-brand`, `#empty-brand`, `#condition-<id>`).
- Au clic réel, « Utiliser "Ottordram" comme marque » et « Très bon état » se POSENT (span affiché) : seule notre
  relecture `.value` du bouton lisait « » → « #brand porte «  » » (même pour « Sans marque ») et « le formulaire n'a pas
  accepté État ». Les republications passaient chez les comptes non basculés, et chez les basculés quand la marque partait
  par identifiant (le contrôle d'État les arrêtait ensuite, AVANT tout retrait).
- Bascule progressive chez Vinted : 1 arrêt le 24/10, 1 le 27/10, 34 le 28/10 ; `selector_health publish.dropdown_panel`
  1 ligne/jour → 418 dès le 28/10 12:01 (15 installations).
- **Correctif** `497405d` (extension **0.6.150**) : `valeurChampVinted` / `estMenuVintedBloom` — une seule lecture pour
  l'ancien `<input>` et le bouton bloom, partout (marque, « Sans marque », catégorie et état par identifiant, requis,
  contrôle avant retrait, relecture « commitée ») ; grille de tailles à puces. Selftest neuf `vinted-menus-bloom`.
- **Garde-fou tenu** : aucune autre marque posée en silence (chaîne marque inchangée, seule la relecture change) ;
  chemin de republication inchangé (la marque par identifiant reste) ; aucun État deviné.
- **Preuve réelle** (compte de Nico, menus bloom, extension 0.6.150 non empaquetée) : publication `d994d777` → annonce
  **10576137564** à 21:31:53 (Kiabi / M / Très bon état / Bleu, Bleu clair / 999 €) ; republication `8cd6e3f1` de cette
  annonce → **10576216857** à 21:38:18, identique, l'ancienne en « Page not found ».
- **Relance** (règle de relance : jamais avant le correctif en prod) : `_shared/relance-apres-maj.js`
  `vinted_menus_bloom_marque` (publication, message technique « Le champ Marque n'a pas pu être posé ») et
  `vinted_menus_bloom_grille` (republication `grille_incoherente`, avant retrait) — chaque tâche repart seule, une fois,
  dès que SON poste a un build ≥ 2026-10-28T20:15Z (0.6.150). handler-watch v136 → v138. En attendant, le message dit
  « repartira toute seule dès que ton extension FillSell se sera mise à jour (c'est automatique) — rien à faire » (v138).

### Point 3 — XEWER (jeux vidéo) : pas un défaut de catégorie
- Les 6 republications (`prevol_negatif`) et les publications PES 2009 / suivante (`champ_a_choisir`) sont au rayon
  **3026** (Électronique > Jeux vidéo et consoles > Jeux), le même que ~40 jeux publiés le 27/10 et le 28/10 matin.
  Chaque arrêt liste **« État » vide** alors que la tâche en porte un : c'est la relecture bloom. La liste « Acer Nitro
  Blaze… Atari, Ayaneo » n'est que le début ALPHABÉTIQUE des 48 consoles de Vinted.
- Correctif `2520643` : règles `vinted_menus_bloom_etat_vide_*` (une tâche qui porte un état et que Vinted dirait « État
  vide ») — repartent une fois avec la 0.6.150 ; une vraie question (pas d'état sur la tâche, autre champ seul) n'est
  jamais touchée. Résidu non corrigé (cosmétique) : la question compte 5 libellés pour 3 champs (« Plateforme » +
  « Plateforme de jeu »).

### Point 4 — mele.marta « Gioco PS4 F1 2015 » (page italienne)
- La pose par identifiants exige l'autorisation du serveur (`vinted_ids_actifs`), servie seulement si le PAYS du compte
  est lu. Juste avant le service (13:24-13:25), la sonde users/current rendait « jeton_expire_session_ouverte » →
  `vinted_identite` null ; une publication n'a ni capture ni liste d'états pour dire sa langue → libellés français →
  « Électronique » introuvable parmi « Elettronica… ». Le 24/10 (pays lisible) ses publications passaient par identifiants.
- Correctif `9e2dd2a` : get-pending-jobs (v296) sert `vinted_ids_langues_ouvertes` (langues dont TOUS les pays sont
  ouverts : aujourd'hui « it » ; jamais fr ni en ; rien écrit en base) ; vinted.js pose par identifiants quand
  `<html lang>` en fait partie. Sur page bloom, la pose par identifiants relit désormais `valeurChampVinted` (point 1).

### Point 5 — vincent.armengol « Robert Delavignette. Les Paysans noirs » (capture périmée)
- Capture du 24/10 14:54, servie le 25/10 21:29 (31 h, lot de ~50 et pause anti-robot) → recapture → GET
  item_upload/items **403 anti-robot** → needs_user « Relance » trois fois, puis plus jamais repris (reprise après
  reconnexion plafonnée à 3). L'étape `a_capturer`, elle, réessaie dans 45 min pour le même mur. Annonce en ligne, intacte.
- Correctif `9e2dd2a` (extension) : le type de l'échec remonte (accesRefuse, sessionExpiree, botShield, httpStatus) ;
  403 sans session → connexion demandée ; anti-robot → en file +45 min (règle déjà en vigueur en `a_capturer`), trace
  `capture_echec`, 6 essais au plus.

### Point 6 — pause Vinted LEVÉE à 21:24:59
- Levée avant la preuve réelle parce que le test en avait besoin (get-pending-jobs ne sert aucun job Vinted en pause) et
  parce que c'est sûr pour la 0.6.149 : prouvé en base, chaque arrêt « bloom » se fait AVANT tout retrait ou dépôt.
  La preuve réelle a suivi à 21:31 (publication) et 21:38 (republication).

### Point 7 — relance et reprise de la file
- Points 1, 2, 3 : relance automatique par poste (relance-apres-maj), à la 0.6.150 — jamais avant (même mur).
- Reprise constatée après la levée : republications et publications servies et publiées (nadegemarcelin78 21:25,
  patrick.giry07, remialbertholl, thibault.andrieux…) ; get-pending-jobs distribue (« article par article »).
