# Format du contenu du site vitrine — contrat entre gabarits et rédaction (09/10/2026)

Complète `site/README.md` (champs communs, liens `page:`, images `media:`, FAQ, dates).
Ce fichier fixe les TYPES de pages et leurs champs : les gabarits les implémentent, la
rédaction les remplit. Un champ inconnu fait échouer le build : ne rien inventer.

## 0. Décisions de Nico (09/10) qui pèsent sur le format

- Plateformes : Vinted, Leboncoin, eBay, Beebs, Depop. Opla n'existe nulle part (ni données,
  ni texte, ni image).
- Republication automatique : Vinted, Leboncoin, Beebs, Depop (tous paliers, jamais de palier
  écrit à côté). eBay : on ne parle pas de republication. La liste vient de
  `site/donnees/plateformes.yml` (`republication_auto: true`) et s'écrit dans les textes par le
  jeton `{{republication}}` (« Vinted, Leboncoin, Beebs et Depop ») : si la republication Depop
  n'est pas active au GO, UNE ligne de données la retire partout. Ne jamais écrire cette liste
  en dur.
- Aucun chiffre de quota ni de plafond, nulle part (la mécanique `{{quota:…}}` est retirée).
- Logos des plateformes : jamais sur les pages (noms en texte, puces neutres) ; mention de
  non-affiliation dans le pied de page.
- Ton OFFENSIF, ultra vendeur, comparatifs à notre avantage ; seule limite : rien que l'app ne
  fasse au moment de la mise en ligne, aucun dénigrement, aucun faux chiffre.

## 1. Jetons de texte (remplacés au build, dans le corps ET le frontmatter)

| Jeton | FR | EN |
|---|---|---|
| `{{plateformes}}` | Vinted, Leboncoin, eBay, Beebs et Depop | Vinted, Leboncoin, eBay, Beebs and Depop |
| `{{republication}}` | Vinted, Leboncoin, Beebs et Depop | Vinted, Leboncoin, Beebs and Depop |
| `{{nb_plateformes}}` | cinq | five |

Tirés des données (plateformes ouvertes / `republication_auto`). Un jeton inconnu = build rouge.

## 2. Champs communs nouveaux (tous types sauf `article`)

```yaml
surtitre: "Crosslisting Vinted ↔ Beebs"   # petit libellé au-dessus du h1, 3-48 car.
points_cles:                             # 3 à 5 puces « l'essentiel en 10 secondes » sous le chapo,
  - "…"                                  # phrases autonomes, factuelles : ce que les IA extraient
hero_media: "captures/lens-analyse-photo.png"  # facultatif : capture affichée dans un cadre de
                                         # téléphone dans le héros (chemin sous site/medias)
hero_alt: "…"                            # obligatoire si hero_media
cta: inscription                         # inscription | extension | stores (défaut inscription)
etapes:                                  # facultatif : bloc « étapes » numérotées + JSON-LD HowTo
  - titre: "…"                           # 3 à 70 car.
    texte: "…"                           # 20 à 320 car.
    media: "captures/…png"               # facultatif
    alt: "…"                             # obligatoire si media
plateformes_citees: [vinted, beebs]      # facultatif : puces de plateformes (texte) sous le héros
```

## 3. Types

### `accueil` (seulement `accueil.md`)
Le gabarit compose : héros (surtitre, h1, chapo, CTA inscription + badges App Store / Google
Play + lien extension Chrome, `hero_media`), bandeau des cinq plateformes (texte), `points_cles`,
parcours (`etapes`, avec captures), `fonctions` (cartes), `comparaison` (tableau court tiré des
données concurrents), vidéo (si `video: true`), tarifs (tirés de `site/donnees/tarifs.yml`),
FAQ (corps), CTA final. Champs propres :
```yaml
fonctions:                 # 4 à 8 cartes
  - titre: "…"
    texte: "…"             # 20-260 car.
    page: fonctions/lens   # id d'une page (lien)
    media: "captures/…"    # facultatif (+ alt)
    alt: "…"
comparaison:
  concurrents: [stoflow, flowdino, fluf-connect]   # 2 à 4 slugs de site/donnees/concurrents.yml
  criteres: [app_mobile, plateformes, ia_photo, import_synchro, retrait_auto_copies, republication]
video: true
tarifs: true
```
Le corps (Markdown) porte les sections de texte de référence (pour Google et les IA) et la FAQ.

### `guide` (pilier, sécurité, comment ça marche…)
Long format avec sommaire. Champs communs seulement (+ `etapes` pour « comment ça marche »).

### `trajet` (`/crosslisting/<a>-<b>`)
```yaml
trajet: { de: vinted, vers: beebs }      # existe déjà ; les DEUX sens se traitent dans la page
```
Le gabarit ajoute : puces des deux plateformes, « ce que FillSell fait sur ce trajet » (tiré des
données des deux plateformes), lien vers les deux pages plateformes. Le corps porte un tableau
Markdown comparant les deux plateformes (frais, public, catégories fortes, envoi, durée des
annonces…), les conseils propres à ce trajet, la FAQ. Jamais un modèle où seuls les noms
changent : chaque trajet a ses faits propres (fiches `docs/seo/briefs/plateforme-*.md`).

### `plateforme` (`/plateformes/<slug>`)
```yaml
plateforme: vinted
```
Le gabarit ajoute la grille des capacités FillSell sur cette plateforme (publication, à l'unité
et en lot, synchronisation, vente enregistrée seule ou confirmée d'un geste, retrait des copies,
republication automatique) tirée de `plateformes.yml`, et la liste des trajets de cette plateforme.

### `fonction` (`/fonctions/<slug>`)
Champs communs (+ `etapes` si utile). Captures dans le corps (`media:`).

### `comparatif` (`/comparatif/fillsell-vs-<slug>`)
```yaml
concurrent: stoflow
choisir_fillsell: ["…", "…", "…"]        # 2 à 5 profils pour qui FillSell est le meilleur choix
choisir_concurrent: ["…", "…"]           # 1 à 4 profils pour qui l'autre outil convient mieux (honnêteté = crédibilité)
```
Le gabarit ajoute, AVANT le corps : l'avertissement « FillSell est notre produit », le tableau
critère par critère FillSell vs l'outil (valeurs, source cliquable et date de relevé, tirés de
`site/donnees/concurrents.yml`), les deux colonnes « choisis FillSell si / choisis X si », et APRÈS :
le bloc méthode (date, sources, comment on a vérifié, « signale-nous une erreur » →
support@fillsell.app). Le corps : l'analyse, offensive et factuelle. AUCUN fait sur le
concurrent qui ne soit pas dans `concurrents.yml` avec sa source.

### `alternative` (`/alternative/<slug>`)
```yaml
concurrent: vendoo
alternatives: [stoflow, flowdino, fluf-connect, relistly]  # FillSell est toujours présenté en premier par le gabarit
```
Le gabarit : cartes des alternatives (une ligne factuelle + plateformes + prix d'entrée, tirés
des données, source et date), puis le corps.

### `classement` (`/comparatif/meilleures-applications-crosslisting`)
Le gabarit : tableau des critères et pondérations, notes par outil, variantes par profil, et
JSON-LD ItemList, tirés de `concurrents.yml` (section `classement`). Le corps : méthode, analyse
par outil, « le meilleur selon ton cas ».

### `tarifs` (`/tarifs`)
Le gabarit : cartes des paliers tirées de `site/donnees/tarifs.yml` (nom, prix par mois, devise,
ce qui est inclus — JAMAIS un chiffre de quota), JSON-LD SoftwareApplication avec offres. Le
corps : questions de prix (FAQ).

### `glossaire`
Chaque `### Terme` du corps suivi de sa définition → JSON-LD DefinedTermSet. Définition d'abord
en une phrase autonome, puis un exemple.

### `faq` (existe)

### `article` (blog : `src/blog/*.md`, contrat actuel « une ligne par clé »)
`title`, `description`, `date`, `updated` (facultatif), `lang`, `translation`, `faq` (JSON sur UNE
ligne), `og_image` (facultatif). Ton du blog en français : VOUVOIEMENT (articles existants).

## 4. Données (site/donnees/)

- `plateformes.yml` : slug, nom, ouverte, pays et domaines ouverts, `republication_auto`,
  `vente_enregistree_seule` (vinted, ebay), `mode` (extension | api), rôle de l'ordinateur.
- `concurrents.yml` : repris de `docs/seo/briefs/concurrents.yml` (critères, valeurs, sources,
  dates, niveaux, classement). Seule source des faits concurrents sur le site.
  **Langues** : tout texte publié du brief (`valeur`, `categorie`, `nom` et `grille` des critères
  du classement, `nom` et `ordre` des variantes, `raison` des outils hors classement) s'écrit
  soit en chaîne (français), soit en `{ fr: "…", en: "…" }`. Le français reste la base (verdict
  lu dessus) ; une page `/en` affiche l'anglais quand il existe, sinon le français marqué
  `lang="fr"` (revue technique C-11). La ligne FillSell ne porte AUCUN palier à côté de la
  republication : l'import le retire (journalisé), le vérificateur le refuse.
- `tarifs.yml` : paliers Gratuit 0 €, Premium 12,99 €, Pro 29,99 €, Business 59,99 € par mois,
  devise EUR, ce qui est inclus SANS chiffre de quota (fiche de vérité § 10 + décisions de Nico).

## 5. Ton et style (rédaction)

- Pages vitrine : TUTOIEMENT. Blog FR : vouvoiement. EN : « you », direct, natif (pas une
  traduction mot à mot).
- Réponse directe en tête (chapo), puis `points_cles`, puis le détail. Phrases courtes.
- Offensif : verbes d'action, bénéfices concrets (« Une photo. Cinq plateformes. Zéro
  ressaisie. »), comparaisons chiffrées et sourcées à notre avantage.
- Bannis (lexique § 15 de la fiche de vérité + décisions) : job, polling, token, bot, robot,
  « 100 % automatique », « temps réel », « zéro risque », « illimité » sans objet, « publié partout
  en même temps », « retrait automatique partout », « un e-mail à chaque vente », « partenaire
  officiel », « le seul », tout chiffre de quota ou de plafond, tout palier à côté de la
  republication automatique, Opla, Cloud, noms de l'équipe, « FillSell publie pour toi » (c'est
  l'extension qui publie, pilotée depuis le téléphone ; eBay relié : l'API officielle).
- Ventes : enregistrées seules sur Vinted et eBay ; sur Leboncoin, Beebs (et Depop : selon la
  fiche Depop), la personne confirme d'un geste ; les copies prouvées sont retirées ; au moindre
  doute, la question « Déjà vendu ? ».
- L'ordinateur est un atout : le téléphone pilote, l'ordinateur exécute, dans TA session, sans
  jamais te demander tes mots de passe.
- Périmètre daté (« aujourd'hui »), jamais une identité nationale.
