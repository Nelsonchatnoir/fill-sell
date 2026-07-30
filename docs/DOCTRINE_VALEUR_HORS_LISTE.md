# Doctrine « valeur absente de la liste » — les 4 plateformes

Posée le 2026-07-30 après trois occurrences du même défaut en une journée :
Vinted couleur « Argent » (hors palette « Argenté ») → 400 serveur ;
eBay Type « Bottines » (hors liste Bottes/Sandales/…) → champ laissé vide,
job en needs_user alors que le champ accepte la saisie libre ;
Beebs marque hors liste relevée → envoyée quand même.

## La règle, unique

Pour chaque champ à liste, on doit savoir répondre à trois questions, dans
cet ordre :

1. **La plateforme accepte-t-elle une valeur libre ?**
   Oui → on la saisit telle quelle, avec trace (warning) — jamais de blocage
   sur une liste qui n'est qu'une suggestion.
2. **Sinon : existe-t-il un repli explicite ?**
   Normalisation dédiée (palette Vinted), rapprochement `findOptionCascade`
   / `nearestAllowedValue` (tolérant casse/accents/inclusion), ou bac
   générique offert par la plateforme elle-même (« Autre » Beebs). Tout
   repli non exact est tracé (`warnings`, match stage).
3. **Sinon : échec PROPRE, AVANT le dépôt**, avec erreur instrumentée et
   requêtable — jamais un champ vide envoyé au serveur qui produit un refus
   illisible (400 code 99), jamais une valeur inventée.

Corollaire : **qui fait foi ?** Une liste ne bloque que si elle fait foi
(`listeFaitFoi`) : eBay `SELECTION_ONLY`, palette Vinted relevée sur l'API.
Les relevés DOM (Vinted/LBC/Beebs, listes à chargement paresseux, donc
partielles) ne font jamais foi : signalement ⚠, jamais interdiction (doctrine
« liste = suggestion », blocage prod Beebs/Marque du 29/07).

## Où la règle est écrite, par plateforme

### Vinted
- **Couleur** (liste FERMÉE qui fait foi — palette API relevée le 30/07) :
  normalisation à l'insert (`src/utils/vintedColors.js` : libellés exacts,
  variantes « Argent »→« Argenté », scan par mots, 2 max). Rien ne se
  normalise → `platform_fields.color_unmapped` (requêtable) et l'extension
  échoue AVANT dépôt : `error LIKE 'COULEUR INTROUVABLE%'` (vinted.js), avec
  palette relevée dans le message.
- **Matière & co** (listes fermées côté formulaire) : cascade
  `selectClosedOptionSafe`, sinon champ sauté + warning (matière non
  bloquante côté serveur).

### eBay
- Mode par aspect dans le référentiel (`ebay_item_aspects`) :
  `SELECTION_ONLY` = fermé qui fait foi (app : CTA bloqué, sélecteur imposé) ;
  `FREE_TEXT` = ouvert.
- Extension (`ebay.js setSpecificValue`) : chip → toggles → menu avec
  recherche. Valeur hors options : re-scan de la saisie matérialisée, sinon
  **saisie libre validée par Entrée** (2026-07-30, cas « Bottines » — le
  composant « Recherchez ou AJOUTEZ des détails » l'accepte). La relecture de
  `fillSpecificSafe` reste seule juge : valeur non prise → 2e pose → échec
  instrumenté avec dump de la ligne. Jamais pour une taille (`sizeField`,
  listes fermées, garde anti-nombre-nu).
- Un obligatoire resté vide → `computeUnfilledRequired` → needs_user AVANT
  soumission, aspects nommés.

### Beebs
- Panneaux fermés (listes relevées par catégorie, souvent partielles —
  chargement paresseux). Cascade → repli **« Autre »** UNIQUEMENT s'il figure
  dans les options réellement affichées (jamais inventé, jamais pour une
  taille) → sinon champ laissé vide + warning avec options relevées +
  `unfilledRequired` si obligatoire (needs_user avant dépôt).
- Marque : le filet du 30/07 (a0ad69c) trace sans bloquer — la liste relevée
  est notoirement partielle.

### Leboncoin
- Critères = dropdowns fermés, majoritairement facultatifs. Cascade →
  sinon champ sauté + warning portant les options réellement affichées
  (`fillCriterionSafe`). Le dépôt partiel est accepté par LBC ; un critère
  obligatoire manquant ressort du wizard lui-même.

## Instrumentation (requêtes)

```sql
-- Couleurs non normalisées (app)
SELECT platform_fields->>'color_unmapped', count(*) FROM cross_post_jobs
WHERE platform_fields ? 'color_unmapped' GROUP BY 1;

-- Échecs couleur avant dépôt (extension)
SELECT id, error FROM cross_post_jobs WHERE error LIKE 'COULEUR INTROUVABLE%';

-- Champs sautés / hors liste (les warnings des handlers sont persistés dans
-- error, préfixe « Warnings: » ; les obligatoires restés vides dans
-- platform_fields.unfilled_required_fields — cf. completionExtras, background.js)
SELECT id, platform, error FROM cross_post_jobs
WHERE error LIKE '%sans correspondance%' OR error LIKE '%champ sauté%'
   OR error LIKE '%hors des options%' OR error LIKE '%saisie libre validée%';

SELECT id, platform, platform_fields->'unfilled_required_fields'
FROM cross_post_jobs WHERE platform_fields ? 'unfilled_required_fields';
```
