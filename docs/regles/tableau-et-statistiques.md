# Tableau, en-tête et Statistiques : les chiffres affichés

> Sujet ouvert le 28/10/2026 (refonte desktop du Tableau et des Statistiques). Une règle nouvelle de ce sujet
> s'ajoute ICI, jamais dans `CLAUDE.md`. Les règles de LECTURE d'une vente (plateforme normalisée, marge % au
> prix d'achat > 0, « Sans plateforme », tri) restent dans `docs/regles/ventes-et-retraits.md` § 16/10.

## 28/10 — Tableau, en-tête et Statistiques : une seule source pour les chiffres (rapport `docs/enquetes/refonte-tableau-desktop-2810/RAPPORT.md`)
- **Un chiffre = une période NOMMÉE** : `src/utils/tableauStats.js` définit `mois` (du 1er à aujourd'hui), `30j`,
  `3m`/`6m`/`12m` (glissants) et `tout` (seule période où entrent les ventes sans date), en jours de Paris comparés en
  texte. L'en-tête (« 99 ventes en octobre »), le Tableau (mobile et desktop) et les Stats lisent CE module. Avant :
  « 99 ventes ce mois » (mois calendaire) à côté de « 124 ventes · dernier mois » (mois glissant). Le « 1M » des Stats
  mobiles s'appelle désormais « 30 DERNIERS JOURS ».
- **Comparaison à jours égaux** (octobre 1–28 contre 1–28 septembre) ; sous 5 ventes dans la période d'avant, AUCUN
  écart affiché (`comparable()`). Le stock (en ligne, immobilisé, ancienneté) est un état d'aujourd'hui : jamais comparé.
- **Marge : une règle partout** (pondérée, ventes au prix d'achat > 0). Les Stats faisaient une moyenne simple des %.
- **Délai de vente CONSTATÉ** : de la première mise en ligne connue (plus ancien `published_at` des jobs, sinon l'ajout)
  à la vente, articles CRÉÉS dans FillSell seulement ; un article importé d'un dressing est écarté (vraie date de mise
  en ligne inconnue) ; plus de rapprochement par le titre ; rien tant que les jobs ne sont pas lus. Jamais une prévision.
- **Prix affiché** = `cross_post_jobs.price` du dernier job publié avant la vente, sur la plateforme de la vente.
- **Écarté faute de donnée fiable : l'HEURE de vente** (`vendu_le` = midi de remplissage pour les anciennes ventes,
  heure de détection pour un relevé ; `nbHeuresReelles` le compte). Les jours de la semaine, eux, sont fiables.
- **Charge** : aucun appel de plus à l'ouverture ; tout se calcule sur les ventes et l'inventaire déjà chargés et sur
  la lecture « en ligne » existante (`useStockEnLigne`, + la colonne `price`). Mesuré : < 15 ms par période sur le
  compte d'Ornella (715 ventes, 894 fiches, 920 jobs). Selftest : `npm run selftest:tableau-stats`.
- **Affichage desktop** (`src/ecrans/bureau/`, `hooks/useBureau`) : web à partir de 1 024 px seulement ; app native et
  petits écrans gardent l'écran mobile. Écran de démarrage (compte vide) et bandeaux du haut du Tableau inchangés.
