# Session de nuit sans Nico — 18/10 (5 points) — RAPPORT

Heures de Paris. Ordre de travail : 1, 5, 3, 2, 4. Chaque point dit FAIT ET PROUVÉ, FAIT À PROUVER ou PAS FAIT, avec
la preuve ou la raison. Selftests de départ (17/10 23:40) : **345 / 346** (seul rouge : `vinted-origine`, d'avant).

## POINT 1 — MÉMOIRE COMPTE × CATÉGORIE — (en cours)

### La règle
Quand la personne répond ELLE-MÊME à un champ requis qui dépend du RAYON, l'app retient sa réponse pour
utilisateur × compte plateforme × plateforme × catégorie cible × champ (table `memoire_champs_categorie`, RLS) et la
repose seule sur le prochain article du même rayon. Code : `src/publication/moteur/memoireCategorie.js` (règle pure),
`src/utils/memoireChamps.js` (lecture une fois par compte, écriture au clic Publier), écran Publier, questions, lot,
Réglages › Préférences (`src/reglages/MemoireRayons.jsx`). Selftest `memoire-categorie` (54).

Gardes : champ VIDE et REQUIS seulement ; APRÈS la fiche (genre, catégorie Vinted, taille enfant, mot du titre), le
texte et Lens (la mémoire ne joue que si rien de l'article ne décide) ; valeur dans la grille d'aujourd'hui, sinon
ignorée et la question revient ; un titre ou une description qui nomme un AUTRE public la fait taire ; seule une
réponse de la personne (un CHOIX dans la liste) est retenue, au clic Publier, pour les plateformes réellement
envoyées ; une nouvelle réponse remplace l'ancienne ; aucune ligne inchangée réécrite. Visible : la valeur posée
s'affiche dans les questions (« Repris de ta dernière réponse pour « Mode > Vêtements » ») et dans le lot (une carte
par groupe), modifiable d'un geste ; Réglages › Préférences liste les réponses retenues, « Oublier », « Tout oublier ».

`compte` : la boutique quand FillSell la connaît (Vinted multi-boutiques) ; « principal » ailleurs — l'app ne connaît
aucun identifiant de compte Leboncoin ni eBay (un compte connecté par plateforme et par utilisateur).

### La liste exacte des champs, et pourquoi
Mesure : rejeu de toutes les réponses « complete » (usage_logs `champ_requis_bloquant`) sur 60 jours, valeur lue sur le
job publié ; « juste » = la réponse précédente du MÊME compte sur le MÊME rayon était la bonne.

| Plateforme · champ | Ce qu'il dit | Rejeu (juste / rempli) | Verdict |
|---|---|---|---|
| Leboncoin Univers `clothing_type` (Mode > Vêtements : Femme / Maternité / Homme / Enfant) | le public du rayon | 59 / 59 (synonymes Fille/Garçon → Enfant comme au service) | **RETENU** |
| Leboncoin Univers `shoe_type` (Mode > Chaussures) | le public du rayon | 2 / 2 | **RETENU** |
| Leboncoin Univers `accessories_univers` (accessoires, montres et bijoux : Femme / Homme / Enfant / Mixte) | le public du rayon | — (même liste de publics) | **RETENU** |
| eBay Département | le public ; la catégorie eBay est déjà genrée | même valeur sur 97,2 % des articles d'un compte × catégorie (71 articles) | **RETENU** |
| Leboncoin Univers `house_and_garden_type` (Décoration, Arts de la table) | une famille d'OBJETS | 11 / 16 | exclu |
| Leboncoin Produit (`decoration_type`, `*_product`…) | l'objet | 8 / 16 | exclu |
| Leboncoin Genre `leisure_book_genre`, `dvd_movies_style` | le contenu du livre / du film | 0 / 5 | exclu |
| Leboncoin Genre `baby_clothing_universe` (Fille / Garçon / Mixte) | l'enfant de CET article | majorité 50 % | exclu |
| Leboncoin Type (`*_type`, `furniture_category`…), Support (DVD / Blu-ray) | l'objet | majorité 67-85 % | exclu |
| Beebs Âge | l'âge de l'enfant pour cet article | 1 / 2 | exclu |
| Taille, pointure, marque, état, couleur, matière, ISBN, poids, dimensions, colis, prix, titre, description | l'ARTICLE | — | exclus par principe |

La base refuse tout autre champ (CHECK `memoire_champs_categorie_champ_du_rayon`) ; le module se tait aussi si la liste
d'un champ retenu cesse d'être une liste de publics. Ajouter un champ = décision de Nico + migration.

### Mesure « avant » (7 jours au 17/10 23:59)
- `champs_requis_veille()` : 413 questions affichées en 7 j (606 la semaine d'avant) ; Univers Leboncoin 103.
- Questions qui auraient été évitées par la mémoire (rejeu, mémoire = réponse précédente du compte sur le rayon) :
  **69 sur 76** questions des champs retenus (Univers Mode > Vêtements 68 / 73, Chaussures 1 / 3), **0 remplie à tort** ;
  soit 69 / 413 = 17 % de toutes les questions de la semaine. eBay Département : 0 affichage en 7 j (3 « bloqué au clic »).
- Si l'Univers / Produit de Décoration avaient été retenus : 13 remplissages faux sur 32 — c'est pourquoi ils ne le sont pas.
- Mesure « après » : `usage_logs` feature `memoire_categorie` (issues `appliquee`, `modifiee`, `retenue`) et
  `champs_requis_veille()` — à relire vers le 25/10.

### Base
Migration `20261018030000_memoire_champs_categorie.sql` (inverse `supabase/rollbacks/…`). Essai à blanc (transaction
annulée) : 8 contrôles sur 8 — insertion, horodatage serveur, remplacement, champ `taille` refusé par la base, ligne
d'un autre compte refusée (RLS), un autre compte ne voit ni n'efface rien, le propriétaire vide sa mémoire, anon exclu.
**Appliquée le 18/10 à 00:06**, historique réparé (`applied`), table + RLS + 4 règles relues en prod.
