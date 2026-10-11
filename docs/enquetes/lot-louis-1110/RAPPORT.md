# Lot Louis du 11/10 soir — rapport final

Rédigé le 11/10/2026 vers 18:45 (Paris). Passation d'origine : `PASSATION.md` (même dossier).
Compte de Louis : `faf5021a-479a-4bb3-b3ec-c296770739b7` (pseudo « Amiral », Business).

## Ce qui est servi

| Pièce | État |
|---|---|
| Migration `20261011180000_republication_creneau_suit_le_reglage` | APPLIQUÉE 17:16:28, inscrite (feu vert nommé) |
| Migration `20261011190000_doublons_attribut_distinctif` | APPLIQUÉE 17:44:58, inscrite (feu vert nommé) |
| Fonction `rapprochement` | v18 → **v19** le 11/10 vers 18:00, `verify_jwt: false` lu avant et après ; appels en 200 depuis, aucune erreur |
| OTA | **2.9.84**, canal `production`, build `2026-10-11T16:32:26Z+1dc13d2` |
| Web | Vercel sert `1dc13d2` (`/build.json` 2026-10-11T16:34:19Z) ; entrée en 200 avec `Origin` |
| Git | un seul push, `27f9842..1dc13d2`, HEAD distant = HEAD local |
| Extension | rien de nouveau ; reste à téléverser le zip de la mission précédente : `build\CWS-0.6.110-A-TELEVERSER\fillsell-extension-0.6.110-a3c5aef-cws.zip` |
| Selftests | 272/272 avant le visuel, **273/273** après (séquentiels, un processus à la fois) |

## Point 1 — la republication Vinted de Louis figée depuis 14:15

- **Cause** : `republish_planifiee_sweep` retrouvait la ligne du créneau du jour par son DÉBUT. Louis
  a déplacé la FIN (12–14 h → 17:00 → 23:59) : la ligne `republish_creneaux` 317 (Vinted, @evat) gardait
  fin 14:00, et l'étape « 6ter » coupait tout ce qui dépassait. Dernier job avant le correctif : 12:27:05 ;
  blocage depuis 14:15:01. Défaut né le 08/10 (9307fbf), posé sur la clé « par début » du 19/09 (12e12a9).
- **Correctif** (mig 18) : la ligne du créneau suit le réglage (étape 2ter) ; l'écran « Republication
  automatique » annonce la capacité réelle (`capacite_source`).
- **Preuve en réel, sans aucun geste à la main** : ligne 317 réalignée à 17:18:05 (fin 23:59, 36 prévues).
  Republications Vinted nées de la règle corrigée :

  | job | créé | publié | état |
  |---|---|---|---|
  | b142cd6c | 17:18 | 17:21 | recréée — https://www.vinted.fr/items/10335167434 |
  | 5c26413a | 17:33 | 17:43 | recréée — https://www.vinted.fr/items/10335690104 |
  | f50647ec | 17:48 | 17:51 | recréée — https://www.vinted.fr/items/10335879897 |
  | 1b37cf67 | 18:03 | 18:07 | recréée |
  | 16f1721d | 18:18 | — | question « rayon à choisir » (Enfants › Jeux et jouets s'arrête sur un niveau intermédiaire), posée AVANT tout retrait : annonce intacte |
  | 79178117 | 18:33 | — | en cours |

- **Autres comptes** : aucun touché par CE défaut depuis le 08/10 (mesure de la passation). Comptes sans
  job le 11/10 pour des causes normales : alizeed48 (Chrome absent pendant le créneau), lesforcesdelaudela
  (extension vue le 04/10), mele.marta (vue le 09/10), ornellaracano (activée après son créneau),
  recrutementgroupezk704 (Opla fermée).
- **Non datable** : l'heure du passage de 17:00 à 23:59 n'est journalisée nulle part.

## Point 2 — « Est-ce le même article ? » en boucle

- **Règle** : couleur, nombre, taille ou dimension différents entre deux fiches → la paire est écartée
  d'office, ni rattachement automatique ni question, même photo comprise. En base (mig 19 : garde avant
  insertion `trg_inventaire_doublons_attribut_distinctif`, journal `doublons_ecartes_par_regle`) ET dans
  le moteur (`_shared/rapprochement/texte.js`, `moteur.js` → `rapprochement` v19).
- **Louis** : 18 questions ouvertes → **0** (couleur 4 : 0132395d, 7b74927e, 21209b31, 8d0e1584 ;
  plusieurs exemplaires 14 : fiche vendue, quantité 1, face à une fiche Beebs à 9 994–9 999 exemplaires).
- **Parc** : 179 paires reclassées sur 30 comptes ; questions ouvertes 2 154 → **1 975** (relu à la reprise, ~17:55).
- **Audit des paires que les gens avaient REFUSÉES** (« ce n'est pas le même »), recalculé avec la règle
  en base : 163 sur 564 auraient été écartées sans question (29 %).

  | compte (palier) | refusées | écartées par la règle | motif |
  |---|---|---|---|
  | Glowik (premium) | 209 | 98 (47 %) | couleur |
  | angelofthedeath91 (free) | 121 | 3 (2 %) | — |
  | SPGL 44 (free) | 84 | 14 (17 %) | nombre 11, taille 2, couleur 1 |
  | Louis / Amiral (business) | 75 | 36 (48 %) | couleur |
  | carhoa (free) | 23 | 6 (26 %) | couleur 3, taille 3 |
  | Corinne Basalo (free) | 18 | 1 (6 %) | couleur |

- **Contre-épreuve** (paires que les gens ont confirmées « même article ») : 7 sur 1 082 (1 069
  fusionnées + 13 confirmées) seraient écartées par la règle (0,6 %).

## Ajouté en cours de lot (demande de Nico, 11/10 ~18:00) — deux défauts visuels

1. **Logo texte « FillSell » rogné** (accueil fillsell.app) : un texte en dégradé (`background-clip: text`)
   n'est visible que dans sa boîte et l'italique penche au-delà ; marge de 2 px. Mesuré sur la prod avant
   correctif : 1 à 3 px d'écran du dernier « l » coupés, zooms Windows 100 à 200 %. Règle : marge EN EM
   (≥ .25em) partout où ce logo est peint en dégradé (site en-tête et pied, app, blog, 55 cartes de partage
   régénérées) ; mails : couleur pleine, non concernés. Gardée par `selftest:marque-italique-entiere`.
   **Vérifié en ligne après le déploiement Vercel** : entier sur `/` (en-tête, pied) et `/en/`, 1440 et
   390 px, zooms 100/125/150/200 %.
2. **Bloc « profit / ventes ce mois » décalé** (app, grande largeur) : il se plaçait entre ses voisins.
   Trois groupes (`.tb-left` / `.header-centre` / `.tb-right`), gauche et droite à part égale : centre =
   milieu de l'en-tête = onglet « Lens », à 0 px près de 769 à 1920 px, compteur 31 ou 1000, pastille Pro,
   Business, Premium ou aucune, clair et sombre (l'app n'a pas de thème sombre : rendu identique).
   Mobile (≤ 768 px) : bloc masqué comme avant, rien ne se chevauche.
   Preuve : `node scripts/apercu/capture-entete-marque.mjs` (284 contrôles verts, captures dans
   `screenshots-review/entete-marque/`).
   **Constat PRÉEXISTANT, non corrigé (identique avant/après, mesuré)** : à 320 px avec « Pro », et à
   360–375 px avec « Business » et un compteur à 4 chiffres, la roue des réglages sort de l'écran
   (10 à 65 px). À trancher.

## Restent ouverts (à trancher par Nico, inchangés)

1. Disjoncteur de la republication auto : un échec propre à UN article compte comme une panne du compte
   (`republish_planifiee_sweep` 2bis/3bis). Pas en cause chez Louis le 11/10.
2. Retenue « deleted » sans limite : une republication figée hors ligne retient les autres de sa
   plateforme. Pas en cause chez Louis le 11/10.
3. Rayon Leboncoin changé à la main dans « Ce qui va partir » : le « Produit » répondu est écarté contre
   l'ANCIEN rayon (job 8e5d2ee4, compte de Nico).
4. Deux annonces Leboncoin de test à 999 € retenues par la modération (3286515073, 3286519360) : si
   Leboncoin les valide, les retirer depuis l'app.
5. Roue des réglages hors écran sur très petit écran (ci-dessus).
