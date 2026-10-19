# La taille unique — 19/10/2026 soir (heure de Paris)

## Ce qui est arrivé à Sébastien (Pro) — relu en base à 22:00

- **Un seul job eBay arrêté sur « Unique »** : la djellaba (job 12854dbb, créé à 20:13:49), rangée par le moteur en
  eBay **« Costumes »** (3001). eBay refuse « Unique » (25129) à 20:36:55. La grille de CE rayon, relue chez eBay à
  20:36:54, porte 48 options (2XS … 8XL, 40 … 68, UK 32 … 50, US 32 … 50) et **aucune taille unique** : la question
  était juste. Sébastien a répondu « 48 » à 20:56, l'annonce est **publiée depuis 20:58:08** (366745645547).
- **Les quatre « Taille unique » eBay du même lot** (robe caftan, blouse poncho, gilet poncho « T.U », robe longue à
  carreaux ; rayons Robes 63861 et Hauts 63862, dont la grille porte « Taille unique ») : **publiées à 20:27:05, 20:29:04,
  20:38:09, 20:38:31**, à leur tour dans la file du lot (20:14 → 20:48), sans arrêt. À l'écran Publier, leur question
  « Taille » a été affichée puis levée par le moteur en 0 s (19:43 → 20:03, `par: moteur`).
- **À 22:00, aucun job eBay de Sébastien n'est ouvert : rien à relancer par handler-watch.** Côté Leboncoin, trois
  copies « Unique » (djellaba, gilet poncho, robe longue) attendent leur tour dans sa file (39 jobs Leboncoin ouverts à
  22:00, partis dans l'ordre) ; leurs sœurs « Unique » sont parties (robe caftan 21:13, blouse 21:43).
- **La correspondance ne manquait pas** : `tailles.js` traduit « Unique », « TU », « Taille unique », « One size »,
  « Universel », « TAILLE_UNIQUE » entre eux depuis le 18/09 (le 22/09 pour « Universel »). Toutes les grilles
  relevées écrivent leur taille unique avec un de ces mots. Vinted : 86 grilles « Taille unique », 2 « One size »,
  1 « Universel ». Beebs : 48 « Taille unique », 13 « Universel », 3 « Taille Unique ». Leboncoin : 2 « Taille
  unique ». Opla : « TAILLE_UNIQUE ». eBay : 122 catégories sur 162 qui ont un aspect « Taille ». Aucune grille n'en
  écrit deux différentes. **En 90 jours, 3 jobs portant une taille unique ont pris une question de taille** : une
  peluche « 59 cm » (12/09), un bonnet « Unique » / « Universel » (19/09, corrigé le 22/09) et la djellaba.
- **Le vrai défaut de la djellaba est le RAYON** : une djellaba n'est pas un costume (le job notait déjà « aucun aspect
  obligatoire de « Costumes » ne peut décrire « djellaba » ») ; eBay proposait « Vêtements traditionnels, du monde ›
  Asie du Sud-Ouest/Moyen-Orient » (155253) dans ses suggestions. **Non corrigé ici — à décider.**

## La règle livrée (pour la règle, toutes plateformes)

`_shared/taille-du-texte.js`, `tailleUniqueDuVendeur`, branchée en tête de `tailleDuTexte` : elle passe donc par les
branchements déjà en place (écran Publier : jugement, job, eBay, carte du rayon ; handler-watch : R5 après R0 → R4).
Aucun appel IA. Le dictionnaire reste celui de `tailles.js` (`memeTaille`), réutilisé et non recopié.

- **Une taille unique écrite par le vendeur devient L'option de taille unique de la grille** de la plateforme et du
  rayon, écrite comme elle l'écrit (« Taille unique », « Taille Unique », « Universel », « One size », « TAILLE_UNIQUE »),
  une seule. Ce qui s'ajoute à `tailles.js` :
  - les écritures qu'il ne lisait pas sur la copie : « T.U », « T. unique », « Taille unique (TU) », « TU / One size »,
    « One size fits all », « OSFA » ;
  - la **copie vide** dont le titre ou la description dit « taille unique », « taille universelle », « T.U », « one
    size », ou « TU » isolé en capitales.
- **La question reste** :
  - quand la grille n'a pas de taille unique (la djellaba en « Costumes ») ;
  - quand une autre taille est dite à côté : « taille 38 », « T:36 », FR, W ou mois, « Taille unique / L », « TU - 36 » ;
  - sur une négation (« pas de taille unique ») ;
  - quand la grille porte deux options uniques différentes (aucune grille relevée n'en a deux).
- **Jamais** :
  - une copie qui porte une autre taille (« M » + « taille unique » : la copie gagne, la règle d'avant joue) ;
  - le mot « unique » seul (« pièce unique ») ou « universel » dans un texte (« adaptateur universel ») ;
  - « TU » suivi d'une majuscule ou après un mot en capitales (« TU Delft », « SI TU AS ») ;
  - une pointure.

## Preuves (rejeu contre la prod d'avant, 7c28985, worktree)

Banc symétrique `scripts/bancs/taille-unique/rejeu-taille-unique.mjs` : avant et après passent par la même fonction,
textes compris. Données (requêtes locales, `*.sql` étant ignoré par `.gitignore`) : `scripts/bancs/tailles-titre/*.sql` (90 j pour les annonces publiées) et
`scripts/bancs/taille-unique/questions-taille-serveur.sql`.

| | Rejouées | Avant | Après | Écarts |
|---|---|---|---|---|
| Questions « Taille » de l'écran, 7 j (tout le parc) | 226 | 99 | **99** | 0 levée, **0 régression** |
| · Beebs / Vinted / eBay / Leboncoin | 179 / 21 / 22 / 4 | 64 / 18 / 14 / 3 | 64 / 18 / 14 / 3 | 0 |
| Questions de taille du serveur (jobs arrêtés), 7 j | 16 reconstruites (39 jobs, 23 sans grille relevée) | 13 tranchées | 13 tranchées | **0** ; djellaba : null → null |
| Annonces publiées 90 j (1 354), tailles servies | 1 047 + 206 eBay | — | — | **0 changée, 0 nouvelle**, 0 job réécrit |

- **Ce que la règle aurait changé en 7 jours : rien.** Aucune des 99 questions restantes ne porte une taille unique que
  la grille du rayon a. Sur 90 jours, **304 fiches sans taille** disent « taille unique » dans leur texte. La règle en
  pose **250**, laisse **6 en doute** (« Robe nuisette taille M (taille unique) », « TU - 36 38 40 », « Botte taille 38
  + genouillère taille unique »…) et écarte les 48 restantes, des « tu » pronoms (« Livre dont tu es le héros »). Un
  seul faux positif relu, « Jauge niveau huile moteur TU pour AX… » (code moteur), sans effet : la règle ne joue que
  dans un rayon dont la grille de taille a une option unique.
- **Banc du moteur RÉEL de bout en bout** (`scripts/apercu/capture-moteur-taille-titre.mjs`, écran Publier en pilote du
  lot, Supabase factice, envoi `spend_coins_and_publish` capturé) : **8/8 cas verts**, dont 4 nouveaux :
  - copie vide + « Taille unique » dans le titre → aucune question, le job part avec « Taille unique » (trace
    `option_du_texte.Taille`) ;
  - « T.U » → « Taille unique » (`taille_saisie` « T.U » gardée) ;
  - « Unique » face à une grille sans taille unique → la question reste, Beebs ne part pas ;
  - « Taille unique / L » → la question reste.
- **Selftests** : nouveau `selftest:taille-unique` (46 contrôles, dont la djellaba rejouée dans handler-watch → aucune
  réponse ; « T.U » eBay → R5 « Taille unique » sur `ebayAspects.Taille` ; Depop « One size »). **Suite complète par
  lots : 377 / 377 joués, chacun une fois, aucun manquant ; 376 verts.** Seul rouge : `messages-cause-vraie`, déjà rouge
  au commit d'avant (7c28985, relu dans un worktree propre : même assertion Kossiwa), sans rapport avec les tailles.
  Les 66 selftests qui chargent la règle ont été rejoués sur la version finale : 65 verts, le même rouge.
  `build:essai` vert. eslint : aucune erreur nouvelle (l'erreur `opts` du banc existait au commit d'avant).

## Livraison

Voir `docs/agents/etat-2026-10-01.md` § 19/10 soir : commit, handler-watch (seule fonction qui importe la règle), OTA
de l'app, web par le push. **Extension non touchée** : elle n'importe pas la règle, il n'y a rien à livrer.

## Choix pris sans Nico

1. Le texte ne remplit que la copie VIDE ; une copie qui porte une autre taille n'est jamais recouverte.
2. « Taille unique (convient M/L) », « TU 38/40 », « Taille unique (52 cm) » = taille unique (une indication de
   coupe). « Taille unique / L » et « TU - 36 » = deux tailles, donc un doute.
3. « TU » n'est lu qu'en capitales, isolé, ni suivi d'une majuscule ni précédé d'un mot en capitales. Un titre tout en
   capitales (« PULL ZARA TU ») garde donc sa question.
4. Pas touché :
   - `ebay-api-worker` : un refus 25129 pose la question avec la grille, et handler-watch y répond (R0, ou R5 pour les
     nouvelles écritures) ;
   - `tailles.js`, partagé avec l'extension ;
   - l'extension.
5. Pas corrigé : le rayon eBay de la djellaba (« Costumes ») et la question « Taille » affichée puis levée en 0 s par
   le moteur sur eBay, qui gonfle le bilan des questions affichées sans rien demander à la personne. Deux sujets à
   décider.
