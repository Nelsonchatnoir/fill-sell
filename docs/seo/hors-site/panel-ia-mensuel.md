# Panel IA mensuel : les questions à reposer aux IA, le protocole, la grille et la ligne de base (09/10/2026)

> Chantier SEO/GEO, partie hors site. Rédigé le **2026-10-09** (soir).
> **Préparation seulement** : aucune question n'a été posée pour ce document, aucun compte ouvert,
> aucune connexion. La ligne de base vient du relevé du 09/10 (14:45-15:25, heure de Paris) :
> `docs/seo/etat-des-lieux/05-reponses-ia.md`.
> Qui lance le panel : **Nico**, ou un agent **avec son accord**, dans le Chrome de Nico. Tout compte à
> créer (Perplexity, Microsoft) est un **geste de Nico**.

---

## 0. L'essentiel

1. **But** : savoir, chaque mois, si les assistants d'IA citent FillSell quand on leur demande un outil
   de crosslisting, à quel rang, **à partir de quelles sources**, et s'ils le décrivent juste.
2. **Ligne de base du 09/10/2026** : ChatGPT cite FillSell sur **1 question type sur 10** (Q5, 4e sur 4) ;
   les Aperçus IA de Google sur **0 sur 9** (pas d'Aperçu en Q9). FillSell est **1er** chez les deux
   dès que la question nomme « Vinted, Leboncoin, eBay et Beebs » (C2). Perplexity, Copilot et Gemini
   n'ont rien répondu ce jour-là ; Claude (claude.ai) n'a pas été testé.
3. **Deux paniers** : le **noyau** (les 13 questions du 09/10, mot pour mot, pour comparer d'un mois à
   l'autre) et un panier **étendu** (13 questions nouvelles : Depop, Beebs, republication, sécurité des
   comptes, alternative à Crosslist, anglais).
4. **Même protocole chaque mois** : même jour (le 9, ou le jour ouvré suivant), même créneau
   (14:30-16:30, Paris), même poste en France, mode **sans personnalisation** de chaque assistant, une
   conversation neuve par question, **la question collée telle quelle**, aucune relance, aucun pouce.
5. **Ce qu'on relève** : réponse obtenue ou non, outils cités dans l'ordre, rang de FillSell, sources
   citées (URL), page de fillsell.app citée ou non, exactitude, erreurs (Opla, homonyme, plateformes).
6. **Indicateur principal** : « FillSell cité sur N questions du noyau sur 10 », assistant par
   assistant. Indicateur GEO : « réponses qui citent une page de fillsell.app ».
7. Premier relevé suivant : **lundi 9 novembre 2026**.

---

## 1. Les assistants, et comment les interroger sans personnalisation

| Assistant | Adresse | Mode à utiliser | Ce que le mode garantit (source) | État au 09/10 (rapport 05) | Compte |
|---|---|---|---|---|---|
| **ChatGPT** | https://chatgpt.com | **Chat temporaire**, option **« Non personnalisé »** choisie **avant** le premier message ; recherche web laissée en automatique | sans mémoire, sans instructions personnalisées, sans plugins ; le choix ne se change plus une fois la conversation lancée (aide OpenAI, https://help.openai.com/en/articles/8914046, contenu lu par la recherche le 09/10 ; la page répond 403 en direct) | **réponses obtenues**, modèle affiché `gpt-6` | le compte de Nico, comme le 09/10 (même condition = série comparable) |
| **Aperçus IA de Google** (+ **Mode IA**) | https://www.google.fr/search?q=…&hl=fr&gl=fr (questions FR) ; `…&hl=en&gl=fr` (questions EN) | **fenêtre de navigation privée, non connecté**, consentement « Tout refuser » ; relever l'Aperçu IA, puis l'onglet **Mode IA** | non connecté = aucun historique de compte (la localisation par adresse IP reste) | **9 Aperçus sur 10 requêtes** ; le 09/10, Chrome était **connecté** à un compte Google (personnalisation possible, non mesurée) | aucun |
| **Gemini** | https://gemini.google.com | **Discussion temporaire** | « Temporary Chats » : pas de personnalisation, réponses génériques, hors historique, gardées 72 h (https://blog.google/products/gemini/temporary-chats-privacy-controls/, annonce d'août 2025, lue par la recherche le 09/10) | **aucune réponse** : la question n'est jamais partie (fenêtre Chrome en arrière-plan) | compte Google de Nico ; **fenêtre au premier plan** |
| **Perplexity** | https://www.perplexity.ai | mode **Incognito** (fil non gardé dans l'historique) | d'après des guides tiers : fils incognito hors historique, expirés sous 24 h (aide Perplexity non relue) | **aucune réponse** : « Inscrivez-vous et répétez votre demande » | **compte dédié au panel, créé par Nico** (sinon : pas de mesure) |
| **Claude** | https://claude.ai | **chat incognito**, recherche web activée | « Starting an incognito chat won't use Claude's existing memory » ; hors historique (aide Claude, https://support.claude.com/en/articles/11817273 et https://support.claude.com/en/articles/12260368, lues par la recherche le 09/10) | **non testé** (seul l'outil de recherche de Claude a servi de témoin, § 6) | compte de Nico ou compte dédié |
| **Microsoft Copilot** | https://copilot.microsoft.com | compte dédié, **« Personnalisation et mémoire » désactivé** (Paramètres › Compte › Confidentialité) | d'après Microsoft, l'option éteinte fait oublier les mémoires des conversations (https://support.microsoft.com/en-us/microsoft-copilot/microsoft-copilot-privacy-controls, lu par la recherche le 09/10) | **aucune réponse** : connexion exigée ; `bing.com/copilotsearch` : page vide | **compte dédié, créé par Nico** ; à défaut, relever le **Bing classique** (`https://www.bing.com/search?q=…&setlang=fr&cc=FR`), index dont se sert Copilot |

Notes :
- **Google en France** : les Aperçus IA et le Mode IA sont ouverts en France depuis le **22/07/2026**
  d'après la presse (https://www.journaldugeek.com/2026/07/27/mode-ia-cest-quoi-ce-nouvel-onglet-deploye-discretement-par-google/ ;
  https://siecledigital.fr/2026/06/30/google-va-bouleverser-la-recherche-en-france-avec-ses-resumes-ia-des-cet-ete/,
  lus par la recherche le 09/10 ; aucune annonce officielle de Google relue). Le Mode IA n'a **pas** été
  relevé le 09/10 : pas de ligne de base, première mesure en novembre.
- La même presse rapporte un réglage Search Console qui permet d'**exclure** un site des fonctions
  génératives : **ne jamais l'activer pour fillsell.app** (ce serait se retirer des Aperçus IA).
- **Rupture de méthode notée** : à partir de novembre, Google se relève **non connecté**. Le 09/10, il
  l'était. Pour mesurer l'écart une fois, poser en novembre Q1, Q2 et C1 **dans les deux modes**.
- Les comptes dédiés ne servent qu'au panel : aucun historique, aucune autre question, aucun lien
  avec FillSell dans le profil.

---

## 2. Le protocole, pas à pas

**Avant**
1. Date : le **9 du mois** (ou le jour ouvré suivant), **14:30-16:30**, heure de Paris. Poste et
   connexion de Nico (adresse IP en France).
2. Noter dans le journal du mois (§ 5.3) ce qui a changé depuis le dernier relevé : site en ligne ou
   non, fiches stores modifiées, binaires publiés, Depop ouverte (D1), décision Cloudflare sur les
   robots d'IA (`PLAN.md` § 1.2), nouvelles pages publiées.
3. Ouvrir un dossier `docs/seo/mesures/panel-ia/AAAA-MM/` (grille, textes des réponses, captures).

**Pour chaque assistant, chaque question**
4. Ouvrir une **conversation neuve** dans le mode du § 1 (pour ChatGPT : choisir « Non personnalisé »
   **avant** de taper).
5. **Coller la question exacte** du § 3 (copier depuis ce fichier : accents, ponctuation et casse
   compris), sans rien ajouter (ni « réponds en français », ni contexte).
6. Ne **rien** relancer, ne cliquer sur aucune suggestion, ne donner **aucun** avis (pouce, note) :
   chaque geste peut entraîner le modèle ou modifier la suite.
7. Attendre la fin de la réponse. Relever (§ 4) : texte intégral copié dans `reponses/<assistant>-<id>.md`,
   capture d'écran pleine page dans `captures/`, puis la ligne de la grille.
8. Sources : relever **toutes** les sources citées (liens rattachés à une phrase) ; pour ChatGPT,
   ouvrir aussi le panneau « Sources » et noter si une page FillSell figure parmi les sources **lues
   mais non citées** (le 09/10, la fiche App Store et la fiche Chrome Web Store étaient lues sans être
   retenues).
9. Google : noter si un Aperçu IA apparaît ; s'il apparaît, les outils dans l'ordre et les cartes de
   sources (domaine et date affichée) ; puis les **10 premiers résultats naturels** (domaines) ; puis
   l'onglet **Mode IA** avec la même question (outils, sources).

**Tirages**
10. **Un tirage** par question et par assistant (comme le 09/10).
11. **Trois tirages** pour trois questions sentinelles, sur ChatGPT et Google seulement : **Q1**, **Q7**
    et **Q8** (§ 3.1). Les réponses changent d'un tirage à l'autre : trois tirages disent si un « cité »
    ou un « absent » est stable.

**Après**
12. Calculer les indicateurs (§ 5.1), écrire le résumé du mois (§ 5.2), comparer au mois précédent.
13. Aucune donnée personnelle dans le dossier : pas d'adresse e-mail, pas de nom de compte, pas de
    capture de la barre latérale (historique d'autres conversations).

Durée estimée : noyau sur 6 assistants (78 réponses) ≈ 3 h ; panier étendu sur ChatGPT et Google
(26 réponses + Mode IA) ≈ 1 h 30. **Panier étendu sur les 4 autres assistants : un mois sur trois**
(novembre, février, mai…).

---

## 3. Les questions

### 3.1 Noyau — les 13 questions du 09/10, à reposer mot pour mot

Ne jamais les reformuler : c'est la série de comparaison. « Page qui devrait être citée » = la future
URL de fillsell.app (`PLAN.md` § 3) qui répond à la question ; elle sert à lire l'indicateur GEO une
fois le site en ligne.

| id | Question (texte exact) | Langue | Page qui devrait être citée | Sentinelle |
|---|---|---|---|---|
| Q1 | quelle application pour faire du crosslisting en France ? | FR | https://fillsell.app/comparatif/meilleures-applications-crosslisting · https://fillsell.app/crosslisting | **oui** |
| Q2 | comment publier une annonce sur Vinted et Leboncoin en même temps ? | FR | https://fillsell.app/blog/cross-listing-vinted-leboncoin | |
| Q3 | crossposting Vinted eBay | FR (requête courte) | https://fillsell.app/crosslisting/vinted-ebay | |
| Q4 | meilleure app pour revendeur Vinted | FR | https://fillsell.app/plateformes/vinted · https://fillsell.app/comparatif/meilleures-applications-crosslisting | |
| Q5 | outil multi-publication seconde main | FR | https://fillsell.app/crosslisting | |
| Q6 | alternative à Vendoo en France | FR | https://fillsell.app/alternative/vendoo · https://fillsell.app/comparatif/fillsell-vs-vendoo | |
| Q7 | comment éviter la double vente entre Vinted et Leboncoin | FR | https://fillsell.app/fonctions/ventes-et-retraits · https://fillsell.app/blog/vendre-meme-article-vinted-leboncoin-ebay-beebs | **oui** |
| Q8 | best crosslisting app for Vinted | EN | https://fillsell.app/en/compare/best-crosslisting-apps · https://fillsell.app/en/platforms/vinted | **oui** |
| Q9 | crosslist Vinted and eBay | EN | https://fillsell.app/en/crosslisting/vinted-ebay | |
| Q10 | Vendoo alternative Europe | EN | https://fillsell.app/en/alternatives/vendoo | |
| C1 | application crosslisting Vinted Leboncoin | FR (contrôle) | https://fillsell.app/blog/cross-listing-vinted-leboncoin · https://fillsell.app/ | |
| C2 | quelle application pour publier en une fois sur Vinted, Leboncoin, eBay et Beebs ? | FR (contrôle) | https://fillsell.app/ · https://fillsell.app/plateformes/beebs | |
| C3 | ChatGPT et assistants : « FillSell avis : que vaut cette application ? » · Google : « FillSell avis » | FR (marque) | https://fillsell.app/ · https://fillsell.app/faq | |

Q1 à Q10 font le score « N sur 10 ». C1 à C3 se lisent à part.

### 3.2 Panier étendu — à partir du 9 novembre 2026 (pas de ligne de base au 09/10)

| id | Question (texte exact) | Langue | Ce qu'elle mesure | Page qui devrait être citée | Condition de lecture |
|---|---|---|---|---|---|
| E1 | quelle application pour vendre sur Vinted et Depop en même temps ? | FR | Depop | https://fillsell.app/crosslisting/vinted-depop · https://fillsell.app/plateformes/depop | « FillSell absent » ne compte qu'**après** l'ouverture de Depop (D1, `03c` § 2.2) |
| E2 | comment transférer mes annonces Vinted sur Beebs ? | FR | faille n° 1 (rapport 06-FR) | https://fillsell.app/crosslisting/vinted-beebs | — |
| E3 | application pour republier automatiquement ses annonces Vinted et Leboncoin | FR | republication | https://fillsell.app/fonctions/republication | — |
| E4 | les outils de crosslisting sont-ils autorisés sur Vinted ? | FR | récit « interdit / bannissement » (Margeo, Aperçu IA Q8) | https://fillsell.app/securite-des-comptes | noter ce que la réponse dit des règles de Vinted |
| E5 | quelle alternative à Crosslist pour vendre sur Vinted en France ? | FR | Crosslist arrête Vinted pour les nouveaux (02/10/2026) | https://fillsell.app/alternative/crosslist | — |
| E6 | quelle IA pour créer une annonce Vinted à partir d'une photo ? | FR | Lens, la plus forte demande d'outil (« chatgpt vinted ») | https://fillsell.app/fonctions/lens | — |
| E7 | qu'est-ce que FillSell ? | FR | entité, homonyme dropshipping (fillsell.com), Opla, plateformes | https://fillsell.app/ | toute confusion avec l'homonyme = erreur à noter |
| E8 | quelle est la meilleure application de crosslisting en France en 2026 ? | FR | classement | https://fillsell.app/comparatif/meilleures-applications-crosslisting | — |
| E9 | is there a crosslister for Vinted and Leboncoin? | EN | trajet en anglais | https://fillsell.app/en/crosslisting/vinted-leboncoin | — |
| E10 | Crosslist alternative for Vinted sellers in the EU | EN | faille datée du 02/10 | https://fillsell.app/en/alternatives/crosslist | — |
| E11 | how to sell on Leboncoin in English | EN | anglophones en France | https://fillsell.app/blog/sell-on-leboncoin-in-english | — |
| E12 | what is FillSell? | EN | entité en anglais | https://fillsell.app/en | — |
| E13 | best app to crosslist Vinted and Depop in Europe | EN | Depop en anglais | https://fillsell.app/en/crosslisting/vinted-depop | après D1, comme E1 |

Règle : une question étendue ne remplace jamais une question du noyau. Si une question étendue
devient inutile, elle sort du panier étendu ; le noyau ne bouge pas.

---

## 4. La grille de relevé

Une ligne par **question × assistant × tirage**. Fichier : `docs/seo/mesures/panel-ia/AAAA-MM/grille.tsv`
(tabulations ; une valeur multiple se sépare par « ; »).

En-tête à copier :

```
date	heure	assistant	mode	modele_affiche	recherche_web	id_question	langue	tirage	reponse_obtenue	raison_si_non	apercu_ia	outils_dans_l_ordre	nb_outils	fillsell_cite	rang_fillsell	sources_citees	page_fillsell_citee	store_fillsell_cite	fillsell_lu_non_retenu	exactitude	erreurs	reserves	concurrents_en_tete	id_conversation	capture	notes
```

| Colonne | Valeurs | Règle |
|---|---|---|
| `date`, `heure` | `2026-11-09`, `14:42` | heure de Paris |
| `assistant` | `chatgpt`, `google_apercu`, `google_mode_ia`, `gemini`, `perplexity`, `claude`, `copilot`, `bing_classique` | |
| `mode` | ex. `temporaire_non_personnalise`, `prive_non_connecte`, `incognito` | celui du § 1 |
| `modele_affiche` | ex. `gpt-6` | tel que l'interface l'affiche ; vide si rien |
| `recherche_web` | `oui`, `non`, `inconnu` | ChatGPT Q9 du 09/10 : `non` |
| `id_question` | `Q1`… `C3`, `E1`… `E13` | |
| `tirage` | `1`, `2`, `3` | 2 et 3 : sentinelles seulement |
| `reponse_obtenue` | `oui`, `non` | `non` + `raison_si_non` : `inscription`, `connexion`, `envoi_bloque`, `pas_d_apercu`, `erreur` |
| `apercu_ia` | `oui`, `non`, vide | Google seulement |
| `outils_dans_l_ordre` | `MULTX; Relistly; FLUF Connect; FillSell` | **ordre d'apparition dans la réponse** ; méthodes manuelles notées `manuel` |
| `nb_outils` | entier | |
| `fillsell_cite` | `1` ou `0` | `1` si le nom FillSell (ou fillsell.app) apparaît comme outil recommandé ou décrit |
| `rang_fillsell` | entier, vide si absent | rang dans `outils_dans_l_ordre`, `manuel` exclu |
| `sources_citees` | URL sans paramètres, `; ` | liens rattachés à une phrase de la réponse |
| `page_fillsell_citee` | URL ou vide | page de fillsell.app parmi les sources citées |
| `store_fillsell_cite` | `cws`, `app_store`, `play`, vide | fiche de store FillSell citée |
| `fillsell_lu_non_retenu` | `cws`, `app_store`, `play`, `site`, vide | si visible (ChatGPT : panneau Sources) |
| `exactitude` | `2`, `1`, `0`, vide | **2** : plateformes, rôle de l'extension et de l'ordinateur justes ; **1** : en partie ; **0** : faux (homonyme, Opla, plateformes inventées) ; vide si FillSell absent |
| `erreurs` | codes : `opla`, `homonyme`, `depop_avant_ouverture`, `plateformes_manquantes`, `prix_faux`, `quota_cite`, `dit_interdit`, `dit_officiel`, `ancien_texte` (miroir type mwm.ai) | plusieurs : `; ` |
| `reserves` | texte court | ex. « peu d'avis », « ordinateur nécessaire », « 6,5/10 » |
| `concurrents_en_tete` | les 3 premiers outils hors FillSell | pour suivre qui occupe la place |
| `id_conversation`, `capture` | identifiant ou nom de fichier | les chats temporaires ne se rouvrent pas : la capture fait foi |

---

## 5. Les indicateurs et le résumé du mois

### 5.1 Calcul

| Indicateur | Calcul | 09/10/2026 |
|---|---|---|
| **I1 — Citation, noyau** | par assistant : nb de Q1-Q10 où `fillsell_cite = 1` / nb de Q1-Q10 où `reponse_obtenue = oui` (Google : où `apercu_ia = oui`) | ChatGPT **1/10** ; Aperçus IA **0/9** ; Gemini, Perplexity, Copilot : **aucune réponse** ; Claude : **non mesuré** |
| **I2 — Rang** | rang médian de FillSell quand il est cité (noyau) | ChatGPT : **4** (Q5, sur 4 outils) |
| **I3 — Part de voix** | citations de FillSell / total des outils cités, Q1-Q10, par assistant | ChatGPT : **1 / 29** ; Aperçus IA : **0 / 36** (comptés sur les listes du § 6) |
| **I4 — Contrôles** | C1, C2 : cité ? rang ? | C1 : ChatGPT non, Aperçu IA **3e/5** ; C2 : ChatGPT **1er**, Aperçu IA **1er** |
| **I5 — Marque** | C3 : verdict ou note donnés, réserves | ChatGPT : **« 6,5/10, trop peu évaluée »** ; Google : pas d'Aperçu, ScamDoc 25 % et annonce de test Leboncoin dans les résultats |
| **I6 — Sources propriétaires** (GEO) | nb de réponses (noyau + étendu) qui citent une page de fillsell.app ; laquelle ; est-ce la « page qui devrait être citée » ? | fillsell.app cité comme source : ChatGPT **C2** (accueil) ; Google C1 : blog **1er en résultat naturel** |
| **I7 — Stores comme source** | nb de réponses qui s'appuient sur une fiche de store FillSell | ChatGPT Q5 (CWS), C2 (App Store), C3 (3 stores) ; Aperçus IA C1, C2 (CWS) |
| **I8 — Exactitude** | moyenne de `exactitude` sur les réponses qui citent FillSell ; liste des `erreurs` | Aperçu IA C2 cite encore **Opla** ; le témoin WebSearch décrit FillSell d'après un **ancien** miroir (mwm.ai : voix, 20 articles, Depop) |
| **I9 — Étendu** | I1 et I6 sur E1-E13 | pas de base |

Comptage I3 du 09/10 (listes du § 6, Q1-Q10, outils nommés seulement, « méthode manuelle » exclue) :
ChatGPT 3 + 1 + 3 + 4 + 4 + 4 + 0 + 3 + 3 + 4 = **29** mentions d'outils, dont 1 pour FillSell (Q5) ;
Aperçus IA 4 + 3 + 4 + 7 + 5 + 4 + 2 + 3 + 4 = **36** (pas d'Aperçu en Q9 ; « Crosslist ou Sell the
Flip » compté 2, « Vinteer (+ Resell Track) » compté 2), dont 0 pour FillSell. Le rapport 05 n'a gardé
que les listes, pas les textes : c'est un **ordre de grandeur**, à recompter sur les textes intégraux
à partir de novembre.

### 5.2 Le résumé du mois (gabarit, 10 lignes)

```
Panel IA du AAAA-MM-JJ (14:30-16:30, Paris) — protocole hors-site/panel-ia-mensuel.md
1. I1 noyau : ChatGPT x/10 (mois précédent y/10) · Aperçus IA x/n · Mode IA x/n · Gemini · Perplexity · Claude · Copilot
2. I4 contrôles : C1 … · C2 …
3. I5 marque (C3) : verdict …, réserves …
4. I6 pages fillsell.app citées : … (attendues : …)
5. I8 erreurs : … (Opla / homonyme / Depop / plateformes / prix)
6. Concurrents en tête : …
7. Sentinelles (3 tirages) : Q1 …/3 · Q7 …/3 · Q8 …/3
8. Étendu : …
9. Ce qui a changé depuis le dernier relevé (journal) : …
10. Actions proposées : …
```

### 5.3 Journal des événements (à tenir dans le dossier du mois)

Une ligne datée par changement qui peut expliquer un mouvement : mise en ligne du site ; décision
Cloudflare sur GPTBot, ClaudeBot, CCBot ; fiches stores modifiées ; binaires publiés ; Depop ouverte
(D1) ; republication automatique Depop (D2) ; nouvelle page publiée (URL) ; citation obtenue dans un
comparatif tiers (`hors-site/cibles-editoriales.md`) ; nouveaux avis sur un store (`hors-site/vrais-avis.md` § 7).

---

## 6. Ligne de base détaillée du 09/10/2026

Source : `docs/seo/etat-des-lieux/05-reponses-ia.md` (§ 2, § 3, annexe). Un seul tirage par question.
ChatGPT : modèle `gpt-6`, chat éphémère non personnalisé, recherche web automatique (sauf Q9).
Google : google.fr, `hl=fr`, navigateur **connecté** à un compte Google.

| id | ChatGPT : outils dans l'ordre | FS | Aperçu IA de Google : outils dans l'ordre | FS |
|---|---|---|---|---|
| Q1 | FLUF Connect, MULTX, Relistly | non (fiche App Store **lue, non retenue**) | StoFlow, Crosslist, TradyList, SyncListing | non |
| Q2 | méthode manuelle, puis Reposter | non (fiche CWS **lue, non retenue**) | Redrip, Reposter, TradyList, puis méthode manuelle | non |
| Q3 | Relistly, List Perfectly, SyncListing (réponse en anglais) | non | Listelf, TradyList, « Crosslist ou Sell the Flip » | non |
| Q4 | ResellTrack, Bleam, VintedCRM, Refind | non | Restockr, OptiSell, Bleam, Dotb, Vinteer (+ Resell Track), Souk | non |
| Q5 | MULTX, Relistly, FLUF Connect, **FillSell** | **oui, 4e/4** (source : fiche CWS) | FlowDino, Vintex, Resell-io, Repost, DressKare | non |
| Q6 | StoFlow, Relistly, DressKare, Margeo | non | DressKare, StoFlow, Crosslist, List Perfectly | non |
| Q7 | méthodes manuelles ; « certains outils » sans nom | non | méthode manuelle, puis Redrip, StoFlow | non |
| Q8 | Relistly, StoFlow, List Perfectly | non | Crosslist, Vendoo, Crosslisting Wizard | non |
| Q9 | Crosslist, Vendoo, List Perfectly (**sans recherche web**) | non | **pas d'Aperçu IA** | non (absent des 8 premiers résultats) |
| Q10 | Relistly, StoFlow, List Perfectly, Vendoo | non | Crosslist, List Perfectly, Reclaim, FLYP | non |
| C1 | Redrip, Reposter, MULTX, Listed AI | non (fiche CWS lue, non retenue) | StoFlow, Reposter, **FillSell**, FlowDino, Redrip | **oui, 3e/5** ; blog FillSell **1er** en résultat naturel |
| C2 | **FillSell** (« Mon premier choix »), FlowDino | **oui, 1er** | **FillSell**, FlowDino, Listed AI | **oui, 1er** (décrit « ainsi qu'Opla ») |
| C3 | FillSell connu ; verdict « 6,5/10 », « trop peu évaluée » | marque | pas d'Aperçu ; résultats : App Store, Play, ScamDoc 25 %, annonce de test Leboncoin | marque |

Autres assistants le 09/10 :

| Assistant | Résultat |
|---|---|
| Perplexity | aucune réponse (« Inscrivez-vous et répétez votre demande », 2 essais, 14:45) |
| Copilot | aucune réponse (page « Se connecter » ; `bing.com/copilotsearch` vide après 28 s) |
| Bing classique (proxy de Copilot), C1 | fillsell.app/blog/cross-listing-vinted-leboncoin **3e** ; fillsell.app/blog/vendre-meme-article-vinted-leboncoin-ebay-beebs **9e** ; margeoapp.com 2e |
| Gemini | aucune réponse (envoi bloqué, fenêtre en arrière-plan) ; la barre latérale du compte montrait d'anciens titres « FillSell : dropshipping / print on demand » (homonyme) |
| Claude (claude.ai) | non testé |
| Témoin : outil de recherche de Claude (index US) | décrit FillSell d'après **mwm.ai, ancienne version** (voix, 20 articles gratuits, « Depop ») ; rien sur Beebs ni Leboncoin ; signale l'homonyme Shopify |

Concurrents les plus cités le 09/10 : chez ChatGPT, **Relistly** et **StoFlow** (6 questions sur 10
chacun), List Perfectly (4), MULTX et FLUF Connect (2) ; chez Google, StoFlow, Crosslist, DressKare,
TradyList, Redrip, Reposter, FlowDino.

---

## 7. Lire un résultat, et ce qu'il déclenche

| Si le panel montre… | Cause probable | Où agir |
|---|---|---|
| FillSell absent mais sa fiche « lue, non retenue » | vocabulaire de la fiche (« Achat Revente », « Cross-post »), peu d'avis | `hors-site/fiches-stores.md`, `hors-site/vrais-avis.md` |
| Opla dans une description | fiches App Store et Play non corrigées, ou cache d'un miroir | `fiches-stores.md` § 2 ; relire le miroir mwm.ai le mois suivant |
| Homonyme dropshipping (fillsell.com) | entité mal rattachée | JSON-LD `Organization` + `sameAs` des trois stores (`ARCHITECTURE.md`), nom unifié (`fiches-stores.md` § 6) |
| « Trop peu évaluée », « peu d'avis » | preuve sociale | `vrais-avis.md` (binaires, R1) |
| « Interdit par Vinted », « risque de bannissement » sans nuance | récit installé (Margeo, Aperçu IA Q8) | page `/securite-des-comptes` ; message factuel à Margeo (`cibles-editoriales.md` § 6.2) |
| Pages concurrentes « X vs Y » citées, pas les nôtres | format gagnant chez les IA | pages `/comparatif/...` et `/alternative/...` (`PLAN.md` § 3) |
| Une page de fillsell.app citée sur une **autre** question que prévu | bonne nouvelle, ou page mal ciblée | noter ; ajuster le maillage |
| Depop attribué à FillSell **avant** D1 | ancien texte de miroir | ne rien publier sur Depop avant D1 ; vérifier les fiches |

---

## 8. Limites

- Un tirage = une photographie ; les sentinelles (3 tirages) donnent une idée de la stabilité, pas une
  statistique.
- Les réponses dépendent du modèle du jour (noté), de la localisation (IP en France) et, pour Google,
  du compte (non connecté à partir de novembre : rupture notée).
- Perplexity et Copilot exigent un compte : sans compte dédié, pas de mesure (Bing classique en repli).
- Les modes « sans personnalisation » sont décrits par les éditeurs ; leurs garanties ne sont pas
  vérifiables de l'extérieur.
- Le rapport 05 n'a gardé que les listes d'outils, pas les textes complets : les parts de voix de la
  ligne de base sont des ordres de grandeur.

---

## Annexe — Sources (toutes lues le 2026-10-09)

- Ligne de base : `docs/seo/etat-des-lieux/05-reponses-ia.md` (relevé du 09/10, 14:45-15:25).
- Pages à faire citer : `docs/seo/PLAN.md` § 3.
- ChatGPT : https://help.openai.com/en/articles/8914046 (403 en direct ; contenu lu par la recherche).
- Gemini : https://blog.google/products/gemini/temporary-chats-privacy-controls/ (lu par la recherche).
- Claude : https://support.claude.com/en/articles/11817273 ; https://support.claude.com/en/articles/12260368 (lues par la recherche).
- Perplexity : guides tiers seulement (https://joindeleteme.com/ai-privacy-settings/perplexity-privacy-settings-guide/) ; aide officielle non relue.
- Copilot : https://support.microsoft.com/en-us/microsoft-copilot/microsoft-copilot-privacy-controls (lu par la recherche).
- Google en France : https://www.journaldugeek.com/2026/07/27/mode-ia-cest-quoi-ce-nouvel-onglet-deploye-discretement-par-google/ ;
  https://siecledigital.fr/2026/06/30/google-va-bouleverser-la-recherche-en-france-avec-ses-resumes-ia-des-cet-ete/ (lus par la recherche).
