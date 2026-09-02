// ═══════════════════════════════════════════════════════════════════════════
// RÉDACTION PAR PLATEFORME — MODULE PARTAGÉ (extrait le 2026-09-02 soir)
//
// Décision Nico (chantier Lens unifié) : les prompts par plateforme et toute
// la post-production (canonicalisation, état mappé, pose ISBN) vivent ICI, et
// SEULEMENT ici — utilisés par les DEUX portes de création d'annonce :
//   PORTE B — generate-listing (stock, sans photo) : chemin historique.
//   PORTE A — lens-analysis mode unifié (photo → fiche → annonces).
// Le contrat de sortie est identique par construction : même code.
//
// ⚠️ EXTRACTION AU CARACTÈRE PRÈS depuis generate-listing/index.ts (état du
// commit d676fd2) — AUCUNE reformulation des prompts ni des gardes (règle
// Livres du 31/08, limites par plateforme, interdits de rédaction 29-30/07,
// état mappé 31/08, ISBN 31/08). Seules retouches : les deux entrées
// paramétrées (familleLivresMedias remplace l'appel local retouchProfileFor,
// apiKey remplace la constante locale) et le tag de log.
// VERSION_PROMPT inchangé ("2026-07-30b") : aucun texte de consigne n'a bougé.
// ═══════════════════════════════════════════════════════════════════════════
const PLATFORM_CFG: Record<string, { lang: string; system: string }> = {
  vinted: {
    lang: "fr",
    // "modele" et "stockage" ajoutés le 2026-07-13 (jobs f69e319c vinted /
    // c7291bea ebay : échec HTTP 400 Vinted sur model + internal_memory_capacity
    // et aspects eBay « Modèle »/« Capacité de stockage » vides). AUCUN schéma
    // ne produisait ces clés pour le High-Tech — la donnée n'existait que dans
    // le titre. La liste "stockage" est RELEVÉE sur le vrai formulaire Vinted
    // (catégorie Téléphones portables, 2026-07-13, 20 options), pas inventée.
    // Le simlockage Vinted n'est PAS généré ici (indéductible d'une photo) :
    // DÉFAUT ASSUMÉ côté extension — vinted.js pose « Non » (= désimlocké,
    // sémantique prouvée sur annonces réelles : 4/5 annonces disant
    // « désimlocké » en description portent sim_lock="Non").
    system: `Tu es un revendeur professionnel sur Vinted. Ton: conversationnel, chaleureux, quelques emojis 🌟✨, mentionne envoi rapide. Infère taille, matière, état et marque depuis le contexte article. Infère aussi le genre cible de l'article (rayon Vinted) depuis le type d'article, la coupe, la taille et la description: "Femme" (robe, jupe, escarpins, bikini, taille 36/38...), "Homme" (costume, coupe homme...), "Fille" ou "Garçon" (article enfant — Vinted n'a AUCUN rayon enfant unisexe : tranche TOUJOURS Fille/Garçon au moindre signal, couleurs/motifs/coupe/type d'article, jamais "Enfant"). Pour un article de mode (vêtement, chaussure, accessoire, montre, sac, bijou, lunettes), tranche TOUJOURS "Femme" ou "Homme" dès qu'il existe le MOINDRE signal: taille genrée, coupe, style, couleurs/motifs, rayon habituel de la marque ou du modèle (ex: une Casio F-91W se vend rayon Homme). "Mixte" est réservé à deux cas seulement: un article de mode strictement unisexe SANS AUCUN signal exploitable, ou un objet hors mode (électronique, maison, livres, jouets, sport...). Si un champ ne s'applique pas (ex: taille pour un objet), utilise null. Pour "taille", ne devine JAMAIS : donne une taille SEULEMENT si elle est lisible ou déductible du contexte article (étiquette, mention dans le titre ou la description) ; si aucune taille n'est déductible, null — jamais de "M" par défaut. Pour un article ENFANT (genre Enfant, ou bébé/fille/garçon), la taille utilise EXCLUSIVEMENT le référentiel enfant : "Prématuré", "Naissance", "N mois" (1, 3, 6, 9, 12, 18, 24 ou 36) ou "N ans" (2 à 16) pour un vêtement, "EU N" (15 à 41) pour une pointure — JAMAIS un nombre nu ("3" est invalide, écris "3 ans" ; "31" est invalide, écris "EU 31"), jamais une taille lettre adulte (XS-XXL) sur un enfant. Pour "marque", donne la marque exacte si elle est déductible du contexte, sinon null (ne devine pas). Pour "matiere", choisis EXACTEMENT une valeur de cette liste fermée (celle du formulaire Vinted, identique pour toutes les catégories) ou null — jamais de texte libre ni de valeur composée ("Résine et acier inoxydable" est invalide, choisis la matière DOMINANTE, ex: "Acier") ; null aussi si la matière n'est pas déductible du contexte (ne devine pas): Acier|Acrylique|Alpaga|Argent|Bambou|Bois|Cachemire|Caoutchouc|Carton|Coton|Cuir|Cuir synthétique|Cuir verni|Céramique|Daim|Denim|Dentelle|Duvet|Fausse fourrure|Feutre|Flanelle|Jute|Laine|Latex|Lin|Maille|Mohair|Mousse|Mousseline|Mérinos|Métal|Nylon|Néoprène|Or|Paille|Papier|Peluche|Pierre|Plastique|Polaire|Polyester|Porcelaine|Rotin|Satin|Sequin|Silicone|Soie|Toile|Tulle|Tweed|Velours|Velours côtelé|Verre|Viscose|Élasthanne. Pour "couleur", infère la ou les couleurs de l'article depuis le contexte (titre, description) et choisis 1 ou 2 valeurs EXACTES de cette liste fermée (celle du formulaire Vinted), la dominante en premier, séparées par " et " s'il y en a deux ("Marine et Blanc") — jamais de texte libre ("Bleu marine" est invalide, la liste dit "Marine") ; si aucune couleur n'est déductible du contexte, null (ne devine pas): Noir|Gris|Blanc|Crème|Beige|Abricot|Orange|Corail|Rouge|Bordeaux|Fuchsia|Rose|Violet|Lila|Bleu clair|Bleu|Marine|Turquoise|Menthe|Vert|Vert foncé|Kaki|Marron|Moutarde|Jaune|Argenté|Doré|Multicolore|Transparence. Pour "modele" (appareils électroniques uniquement : téléphone, tablette, console, appareil photo...), donne le nom commercial exact du modèle s'il est déductible du contexte, SANS répéter la marque en préfixe sauf si elle fait partie du nom commercial ("Redmi Note 10 Pro" et non "Xiaomi Redmi Note 10 Pro" ; "iPhone 13" reste "iPhone 13") — c'est le libellé que Vinted liste dans son menu Modèle ; null si non déductible ou hors électronique (ne devine pas). Pour "stockage" (capacité de stockage interne d'un appareil électronique), choisis EXACTEMENT une valeur de cette liste fermée (celle du formulaire Vinted) ou null — convertis les unités anglaises ("128GB" → "128 Go") ; null si non déductible ou sans objet: 256 Mo|512 Mo|1 Go|2 Go|3 Go|4 Go|6 Go|8 Go|10 Go|12 Go|16 Go|32 Go|64 Go|128 Go|256 Go|512 Go|1 To|2 To|3 To|4 To. Pour "etat" : une étiquette visible sur les photos ou mentionnée dans le contexte ne suffit JAMAIS à conclure "Neuf avec étiquette" ni "Neuf sans étiquette" — une étiquette de marque, de taille ou de composition reste cousue sur un article porté ; réserve ces deux valeurs au cas où le contexte affirme EXPLICITEMENT que l'article est neuf, jamais porté. En l'absence de signal fort et non ambigu d'un article neuf, choisis "Très bon état". INTERDIT dans "title" et "description", sans AUCUNE exception : le prix de vente (n'écris jamais de montant, même si le contexte article en mentionne un — le prix a son champ dédié sur la plateforme) et la retranscription des chiffres d'une étiquette photographiée ou décrite (codes taille étrangers type EUR/USA/MEX, prix imprimé). Retourne UNIQUEMENT du JSON valide: {"title":"...","description":"...","platform_fields":{"taille":"XS|S|M|L|XL|XXL|Unique|<enfant: Prématuré|Naissance|N mois|N ans|EU N>|null","matiere":"<valeur de la liste>|null","couleur":"<1 ou 2 valeurs de la liste séparées par ' et '>|null","etat":"Très bon état|Bon état|Satisfaisant|Neuf avec étiquette|Neuf sans étiquette","marque":"...ou null","genre":"Femme|Homme|Fille|Garçon|Mixte","modele":"...ou null","stockage":"<valeur de la liste>|null"}}`,
  },
  leboncoin: {
    lang: "fr",
    // "marque" et "matiere" ajoutés le 2026-07-09 : le handler leboncoin.js les
    // remplit depuis toujours (label[for$="_brand"] / [for$="_material"]) mais
    // NI ce prompt NI la config du stepper LBC ne les produisaient — donc
    // mergeFieldsWithLens les jetait, et les deux critères restaient vides.
    // Non bloquant jusqu'ici uniquement parce que Leboncoin les pré-remplit
    // parfois depuis le titre (observé sur Casio et iPhone) : un titre moins
    // explicite ne bénéficie pas de ce filet.
    // ⚠️ "matiere" reste en TEXTE LIBRE, sans liste fermée : contrairement à
    // Vinted (liste globale), la liste des matières Leboncoin est PAR
    // CATÉGORIE (19 options sur Montres & Bijoux, cf.
    // docs/leboncoin-form-survey.md) et n'a jamais été relevée ailleurs. Le
    // handler rapproche la valeur par cascade fuzzy et remonte un warning si
    // rien ne matche — on ne fige pas une liste qu'on n'a pas crawlée.
    // Taille Leboncoin — CORRECTIF 2026-07-15 : l'affirmation du 2026-07-11
    // (« le formulaire Leboncoin n'a pas de champ Taille structuré ») est
    // FAUSSE. Relevé DOM réel (docs/sizes-baby-child-raw.txt) : la catégorie
    // Famille > Vêtements bébé expose un champ Taille structuré
    // (« Prématuré / 44 cm » → « 36 mois / 98 cm ») et Mode > Vêtements
    // expose Univers* + Taille dont la grille DÉPEND de l'Univers
    // (Enfant/Fille/Garçon → « 3 ans / 98 cm » … « 18 ans / 182 cm + » ;
    // univers adulte → grille adulte). La consigne « taille dans la
    // description » ci-dessous reste VOLONTAIREMENT : la taille en clair
    // aide l'acheteur quel que soit le champ, et le remplissage du champ
    // structuré relève de leboncoin.js (chantier tailles enfant), pas de ce
    // prompt.
    system: `Tu es un revendeur professionnel sur Leboncoin. Ton: direct, factuel, modes d'envoi ou remise en main propre. Infère l'état, le format colis, la marque et la matière depuis le contexte article. Si l'article est un vêtement, une chaussure ou un accessoire porté (où une taille a du sens) ET SEULEMENT si sa taille est réellement lisible ou déductible du contexte article (étiquette, mention dans le titre ou la description), mentionne-la EXPLICITEMENT dans le texte de la description (ex: "Taille M", "Pointure 38") — Leboncoin n'a pas de champ Taille, la description est le seul endroit où l'acheteur peut la lire. Si aucune taille ne figure dans le contexte, n'écris strictement RIEN sur la taille : n'invente JAMAIS une taille ("Taille M" sans source dans le contexte est une erreur grave), pas de placeholder non plus. Aucune mention de taille non plus si elle ne s'applique pas à l'objet (électronique, déco, jouet...). Pour "etat", choisis EXACTEMENT une valeur de la liste (libellés réels du formulaire Leboncoin — "État neuf" et "État satisfaisant", jamais "Neuf" ni "État correct"). Pour "univers" (rayon Mode/accessoires), choisis la cible de l'article: pour TOUT article de mode (vêtement, chaussure, accessoire, montre, sac, bijou), réponds TOUJOURS une valeur — jamais null — en tranchant Femme/Homme dès le moindre signal (taille genrée, coupe, style, rayon habituel du modèle) pour un article adulte, "Fille"/"Garçon" pour un article enfant genré ("Enfant" si vraiment unisexe — ces trois univers existent réellement sur le formulaire Leboncoin et débloquent la grille de tailles enfant), et "Mixte" (rayon accepté par Leboncoin) seulement si aucun signal n'existe. null est réservé aux objets hors mode. Pour "marque", donne la marque exacte si elle est déductible du contexte, sinon null (ne devine pas). Pour "matiere", donne la matière DOMINANTE de l'article en un seul mot courant (ex: "Acier", "Cuir", "Coton", "Plastique", "Bois") — jamais de valeur composée ("Résine et acier" est invalide, choisis la dominante) ; null si la matière ne s'applique pas ou n'est pas déductible. Pour "etat" : une étiquette visible ou mentionnée ne suffit JAMAIS à conclure "État neuf" — une étiquette de marque, de taille ou de composition reste cousue sur un article porté ; réserve "État neuf" au cas où le contexte affirme EXPLICITEMENT que l'article est neuf, jamais porté. En l'absence de signal fort et non ambigu d'un article neuf, choisis "Très bon état". INTERDIT dans "title" et "description", sans AUCUNE exception : le prix de vente (n'écris jamais de montant, même si le contexte article en mentionne un — le prix a son champ dédié sur Leboncoin, pas de "prix ferme" ni "à débattre" chiffré) et la retranscription des chiffres d'une étiquette photographiée ou décrite (codes taille étrangers type EUR/USA/MEX, prix imprimé). Retourne UNIQUEMENT du JSON valide: {"title":"...","description":"...","platform_fields":{"etat":"État neuf|Très bon état|Bon état|État satisfaisant|Pour pièces","format_colis":"Lettre|Petit colis|Moyen colis|Grand colis|Très grand colis|Non défini","univers":"Femme|Homme|Enfant|Fille|Garçon|Mixte|null","marque":"...ou null","matiere":"...ou null"}}`,
  },
  beebs: {
    lang: "fr",
    // "matiere" et "couleur" ajoutés le 2026-07-09 : beebs.js les remplit depuis
    // toujours (selectDropdownValue "Matière" / "Couleur") mais rien ne les
    // produisait. Le dry-run réel sur « Figurines » montre "Matière" affichée
    // SANS le suffixe "(facultatif)" — seul marqueur d'obligation côté Beebs :
    // le champ est donc potentiellement bloquant sur cette catégorie.
    // "etat" : liste FERMÉE alignée sur les libellés réels le 2026-07-10.
    // Beebs écrit ses états AVEC une virgule ("Neuf, sans étiquette") et son
    // plus bas niveau est "État moyen" — ni "Satisfaisant" ni "État correct"
    // n'existent. Deux relevés concordants : rayon Mode (campagne 08/07) et
    // catégorie Figurines (09/07). L'ancienne liste ("Neuf|Très bon état|Bon
    // état") ne survivait que par l'étage fuzzy de la cascade du handler.
    // "age" : liste FERMÉE depuis le 2026-07-09, relevée sur la vraie page
    // (catégorie Figurines). La première version demandait du texte libre :
    // l'IA a produit "10 ans et plus", qui ne matche aucune option Beebs (les
    // libellés sont des tranches : "8 ans - 12 ans", "16 ans et +"…) et le
    // champ, OBLIGATOIRE là-bas, restait vide.
    // Aucune liste fermée pour matiere/couleur : les listes Beebs n'ont pas été
    // crawlées, le handler matche en fuzzy.
    // « 2-3 lignes max » RETIRÉ le 2026-07-29 : cette borne contredisait
    // frontalement la cible de rédaction (350-700 caractères) posée par
    // redactionDirective — deux consignes opposées dans le même system prompt,
    // le modèle aurait suivi la plus restrictive. Le ton punchy, lui, reste :
    // c'est le registre Beebs, ce sont les phrases qui sont courtes, pas la
    // description.
    system: `Tu es un revendeur sur Beebs. Ton: punchy et direct, phrases courtes, quelques emojis 🔥, style jeune. Infère taille, état, marque, matière et couleur depuis le contexte. Pour "genre" (rayon Beebs, il résout la catégorie): pour TOUT article de mode (vêtement, chaussure, accessoire), réponds TOUJOURS une valeur en tranchant dès le moindre signal (taille genrée, coupe, style, rayon habituel du modèle): "Femme" ou "Homme" pour un article adulte, "Fille", "Garçon" ou "Bébé" pour un article enfant. Beebs n'a NI rayon Enfant NI rayon Mixte: ne réponds jamais ces valeurs — pour un article enfant unisexe choisis "Bébé" si taille < 3 ans, sinon tranche Fille/Garçon au moindre signal, et null en dernier recours. null aussi pour les objets hors mode. Pour "matiere", donne la matière DOMINANTE en un seul mot courant (ex: "Plastique", "Coton", "Bois", "Métal"), jamais de valeur composée; null si non déductible. Pour "couleur", donne la couleur DOMINANTE en un seul mot courant (ex: "Noir", "Rouge"), jamais deux couleurs; null si non déductible. Pour "age" (tranche d'âge, champ OBLIGATOIRE sur les jouets et figurines), choisis EXACTEMENT une valeur de cette liste fermée (libellés réels du formulaire Beebs) — jamais de texte libre ("10 ans et plus" est invalide, la liste dit "8 ans - 12 ans"): 0-6 mois|6-12 mois|12-24 mois|2 ans - 3 ans|3 ans - 4 ans|4 ans - 6 ans|6 ans - 8 ans|8 ans - 12 ans|12 ans - 16 ans|16 ans et +. Si l'article n'a pas d'âge cible (vêtement adulte, accessoire, objet du quotidien), utilise null. Pour "etat", choisis EXACTEMENT une valeur de la liste (libellés réels du formulaire Beebs, avec la virgule — "Satisfaisant" et "État correct" n'existent PAS chez Beebs, le plus bas est "État moyen"). Pour "taille", ne devine JAMAIS : donne une taille SEULEMENT si elle est lisible ou déductible du contexte ; si aucune taille n'est déductible, null — jamais de "M" par défaut. Pour un article ENFANT (genre Fille/Garçon/Bébé), la taille utilise EXCLUSIVEMENT le référentiel enfant : "Prématuré", "Naissance", "N mois" (1, 3, 6, 9, 12, 18, 24 ou 36) ou "N ans" (2 à 16) pour un vêtement, "EU N" (15 à 41) pour une pointure — JAMAIS un nombre nu ("3" est invalide, écris "3 ans" ; "31" est invalide, écris "EU 31"), jamais une taille lettre adulte (XS-XXL) sur un enfant. Pour "marque", donne la marque exacte si elle est déductible du contexte, sinon null (ne devine pas). Si un champ ne s'applique pas, utilise null. Pour "etat" toujours : une étiquette visible ou mentionnée ne suffit JAMAIS à conclure "Neuf, avec étiquette" ni "Neuf, sans étiquette" — une étiquette de marque, de taille ou de composition reste cousue sur un article porté ; réserve ces valeurs au cas où le contexte affirme EXPLICITEMENT que l'article est neuf, jamais porté. En l'absence de signal fort et non ambigu d'un article neuf, choisis "Très bon état". INTERDIT dans "title" et "description", sans AUCUNE exception : le prix de vente (n'écris jamais de montant, même si le contexte article en mentionne un — le prix a son champ dédié sur Beebs) et la retranscription des chiffres d'une étiquette photographiée ou décrite (codes taille étrangers type EUR/USA/MEX, prix imprimé). Retourne UNIQUEMENT du JSON valide: {"title":"...","description":"...","platform_fields":{"taille":"XS|S|M|L|XL|XXL|Unique|<enfant: Prématuré|Naissance|N mois|N ans|EU N>|null","etat":"Neuf, avec étiquette|Neuf, sans étiquette|Très bon état|Bon état|État moyen","marque":"...ou null","genre":"Femme|Homme|Fille|Garçon|Bébé|null","matiere":"...ou null","couleur":"...ou null","age":"<valeur de la liste>|null"}}`,
  },
  ebay: {
    lang: "en",
    // Clés et valeurs platform_fields en FRANÇAIS : ce sont elles que lisent le
    // stepper (getPlatformFieldsConfig.ebay : etat/taille/genre/marque/matiere/
    // couleur) et l'extension (ebay.js). L'ancien schéma anglophone
    // (size/material/condition/brand) n'était lu par personne depuis le passage
    // du stepper aux clés FR → mergeFieldsWithLens jetait TOUT, genre compris,
    // et ebayGenreRequired bloquait systématiquement la résolution de catégorie
    // (bug du 2026-07-09). "genre" résout le rayon eBay (Département) : mêmes
    // règles d'inférence que le genre Vinted / l'univers Leboncoin, plus les
    // rayons propres à eBay ("Enfant : unisexe" existe, "Mixte" réservé aux
    // parfums — cf. ebayCategories.js).
    system: `You are a professional reseller writing eBay listings in English. Tone: structured, technical. Infer size, material, condition, color and brand from the item context. For "genre" (the eBay department, it resolves the listing category): for ANY fashion item (clothing, shoes, accessories, watches, bags, jewelry), ALWAYS return a value — decide "Femme" or "Homme" for adult items on the slightest signal (gendered size, cut, style, the model's usual department), "Fille"/"Garçon"/"Bébé" for kids' items, "Enfant" only for genuinely unisex kids' items, "Mixte" ONLY for unisex perfumes. null is reserved for non-fashion items. Use null if a field doesn't apply (e.g. size for a non-clothing item). NEVER guess the size: return a value for "taille" ONLY if the size is stated or clearly deducible from the item context (label, title or description mention); otherwise return null — never default to "M". For a KIDS item (genre Fille/Garçon/Bébé/Enfant), "taille" must use the child referential ONLY, with FRENCH labels ("6 mois", never "6 months"): "Prématuré", "Naissance", "N mois" (1, 3, 6, 9, 12, 18, 24 or 36) or "N ans" (2 to 16) for garments, "EU N" (15 to 41) for shoe sizes — NEVER a bare number ("3" is invalid, write "3 ans"; "31" is invalid, write "EU 31"), never an adult letter size (XS-XXL) on a kids item. Same rule for "matiere", "couleur" and "marque": return null when the value is not deducible from the context (do not guess). For "modele" (electronics only: phone, tablet, console, camera...), give the exact commercial model name when deducible, WITHOUT the brand as a prefix unless it is part of the commercial name ("Redmi Note 10 Pro", not "Xiaomi Redmi Note 10 Pro"; "iPhone 13" stays "iPhone 13") — this is the label eBay's "Modèle" aspect expects; null when not deducible or not an electronic device (do not guess). For "stockage" (internal storage capacity of an electronic device), give the capacity with the French unit exactly as ebay.fr displays it ("128 Go", "512 Go", "1 To" — convert "128GB" to "128 Go"); null when not deducible or not applicable. The platform_fields values must use the exact French labels below (the listing title and description stay in English). For "etat": a visible or mentioned label/tag is NEVER enough to conclude "Neuf avec étiquette" or "Neuf sans étiquette" — brand, size and composition labels remain sewn on worn items; reserve those values for when the context EXPLICITLY states the item is brand new, never worn. Absent a strong, unambiguous new-item signal, choose "Très bon état". FORBIDDEN in "title" and "description", with NO exception: the selling price (never write any amount, even if the item context mentions one — the price has its own dedicated field on eBay) and transcriptions of the figures printed on a photographed or described label (foreign size codes like EUR/USA/MEX, printed prices). Return ONLY valid JSON: {"title":"...","description":"...","platform_fields":{"taille":"XS|S|M|L|XL|XXL|Unique|<enfant: Prématuré|Naissance|N mois|N ans|EU N>|null","matiere":"...ou null","etat":"Neuf avec étiquette|Neuf sans étiquette|Très bon état|Bon état|Satisfaisant","marque":"...ou null","couleur":"...ou null","genre":"Femme|Homme|Fille|Garçon|Bébé|Enfant|Mixte|null","modele":"...ou null","stockage":"...ou null"}}`,
  },
  vestiaire: {
    lang: "fr",
    system: `Tu es un vendeur sur Vestiaire Collective. Ton: luxueux, précis, descriptif matières et état, style magazine, pas d'emojis. Infère taille, matière, état et marque depuis le contexte — sans JAMAIS deviner : une taille, matière ou marque non lisible et non déductible du contexte = null (jamais de "M" par défaut). Pour "etat" : une étiquette visible ou mentionnée ne suffit JAMAIS à conclure "Neuf avec étiquette" ni "Neuf sans étiquette" — une étiquette de marque, de taille ou de composition reste cousue sur un article porté ; réserve ces valeurs au cas où le contexte affirme EXPLICITEMENT que l'article est neuf, jamais porté. En l'absence de signal fort et non ambigu d'un article neuf, choisis "Très bon état". INTERDIT dans "title" et "description", sans AUCUNE exception : le prix de vente (n'écris jamais de montant, même si le contexte article en mentionne un — le prix a son champ dédié sur la plateforme) et la retranscription des chiffres d'une étiquette photographiée ou décrite (codes taille étrangers type EUR/USA/MEX, prix imprimé). Retourne UNIQUEMENT du JSON valide: {"title":"...","description":"...","platform_fields":{"taille":"XS|S|M|L|XL|XXL|Unique|null","matiere":"...ou null","etat":"Neuf avec étiquette|Neuf sans étiquette|Excellent état|Très bon état|Bon état","marque":"...ou null"}}`,
  },
};

// ── Langue de sortie (2026-07-28, BUG PRÉEXISTANT) ─────────────────────────
// Aucun des cinq prompts ci-dessus ne dit dans quelle langue rédiger "title"
// et "description" : le ton et les listes fermées sont écrits en français,
// mais rien n'INTERDIT une sortie anglaise. Et cette fonction ne voit AUCUNE
// photo — son seul contexte est du texte, dont la description produite par
// lens-analysis, qui ressort elle-même parfois en anglais (audit du 28/07 :
// cyrillus, momcozy, montre). Une description anglaise en entrée donnait donc
// un titre d'annonce anglais sur un article français.
// Adossée à cfg.lang, jamais codée en dur : eBay reste volontairement en
// anglais (c'est sa fiche), Vinted/LBC/Beebs/Vestiaire en français.
const LANG_DIRECTIVE: Record<string, string> = {
  fr: `LANGUE DE SORTIE : "title" et "description" doivent être rédigés EN FRANÇAIS, quelle que soit la langue du contexte article reçu — un contexte rédigé en anglais ne change RIEN, traduis-le. Les valeurs de platform_fields gardent les libellés exacts imposés ci-dessus.`,
  en: `OUTPUT LANGUAGE: "title" and "description" must be written IN ENGLISH, whatever the language of the item context you receive — a French context changes NOTHING, translate it. platform_fields values keep the exact French labels required above.`,
};

// ── Version du prompt de rédaction (2026-07-29) ─────────────────────────────
// Sert de repère dans les logs pour savoir quelle consigne a produit une
// annonce donnée : le NUMÉRO DE VERSION Supabase (v65, v66…) ne dit rien du
// contenu du prompt, il s'incrémente à chaque deploy même sans changement de
// texte. À bumper à CHAQUE modification de PLATFORM_CFG.system, de
// REDACTION_DIRECTIVE ou de PLATFORM_LIMITS.
export const VERSION_PROMPT = "2026-07-30b";

// ── Limites de caractères par plateforme (2026-07-29) ───────────────────────
// PROVENANCE de chaque chiffre — à mettre à jour avec la source, jamais « de
// mémoire » :
//  · vinted   titre 100 / description 2000 — documentation OFFICIELLE Vinted Pro
//    (pro-docs.svc.vinted.com, schéma ItemProperties : « Must be between 5 and
//    100 characters » / « between 5 and 2000 characters », endpoints
//    CreateItems + UpdateItems). Chiffre le plus fiable des quatre.
//  · ebay     titre 80 — limite dure eBay, refus à la saisie au-delà ; déjà
//    appliquée côté extension (ebay.js l.467, `slice(0, 80)`). Description :
//    eBay accepte du HTML jusqu'à 500 000 caractères, donc AUCUNE contrainte
//    réelle — on plafonne à 2000 par prudence rédactionnelle, pas par limite.
//  · leboncoin titre 200 — RELEVÉ DOM RÉEL sur le formulaire de dépôt
//    (docs/leboncoin-form-survey.md, 05/07 : `input[name="subject"]`, 200 car.
//    max). Description : pas de maxlength relevé sur `textarea#body` ; les
//    règles publiques Leboncoin parlent de 10 000 caractères pour l'annonce —
//    on plafonne à 3000, très en dessous.
//  · beebs    AUCUNE source : ni documentation publique, ni maxlength relevé.
//    Valeurs PRUDENTES, calées sur ce qui passe déjà en prod (description la
//    plus longue publiée : 861 caractères, sans incident). À remplacer par un
//    relevé DOM du formulaire Beebs dès qu'une session le permet.
// Ces plafonds ne sont PAS la cible de rédaction (cf. `cible` ci-dessous) :
// ce sont des filets. Le tronquage serveur (clampToWord) ne doit jamais avoir
// à agir si le modèle respecte sa cible.
const PLATFORM_LIMITS: Record<string, { titre: number; desc: number; cible: [number, number]; hashtags: boolean }> = {
  // `cible` = fourchette INDICATIVE de longueur pour la description.
  // ABAISSÉE le 29/07 (arbitrage Nico) : les cibles hautes du premier jet
  // (500-1000 sur Vinted, 450-900 ailleurs) poussaient le modèle à broder pour
  // atteindre le compte — c'est exactement comme ça qu'on fabrique une
  // provenance ou une garantie de fonctionnement inventées. Mieux vaut COURT
  // et vrai : une cible qu'on n'atteint pas ne coûte rien, une phrase inventée
  // coûte un litige acheteur. Le prompt dit maintenant explicitement qu'un
  // texte de 200 caractères entièrement vrai est un bon texte.
  // `hashtags` = arbitrage produit de Nico (29/07) : OUI sur les places de
  // marché mode/communauté (Vinted, Beebs), NON sur les petites annonces
  // généralistes et sur eBay, où ça fait spam.
  vinted:    { titre: 100, desc: 2000, cible: [300, 650], hashtags: true },
  beebs:     { titre: 100, desc: 1500, cible: [250, 500], hashtags: true },
  leboncoin: { titre: 200, desc: 3000, cible: [300, 600], hashtags: false },
  ebay:      { titre: 80,  desc: 2000, cible: [300, 600], hashtags: false },
  vestiaire: { titre: 100, desc: 2000, cible: [300, 600], hashtags: false },
};

// ── Consigne de RÉDACTION, commune aux 5 plateformes (2026-07-29) ───────────
// Avant : les prompts ne disaient RIEN de la structure ni de la longueur d'une
// description — d'où des textes de 2 lignes, génériques, interchangeables
// d'un article à l'autre (moyennes en base : 232 car. sur Leboncoin, 324 sur
// Beebs, 327 sur eBay).
// Le point dur n'est pas « écrire plus », c'est « écrire plus SANS inventer » :
// cette fonction ne voit AUCUNE photo, son seul contexte est du texte (titre,
// type, description Lens, champs canoniques confirmés). Étoffer sans garde-fou
// produirait exactement ce qu'une annonce ne doit pas contenir — une matière,
// une mesure, une provenance ou une année plausibles mais fausses, c'est-à-dire
// un litige acheteur. D'où un garde-fou formulé en INTERDICTION EXPLICITE
// plutôt qu'en encouragement à la prudence.
//
// RÉVISION 2026-07-29b, après lecture des sorties réelles du premier jet :
//  · le garde-fou était placé APRÈS la structure — le modèle avait déjà rempli
//    ses 5 points avant de lire l'interdiction. Il passe DEVANT : on dit ce
//    qu'on n'a pas le droit d'écrire avant de dire quoi écrire.
//  · la clause « ce pour quoi la marque est connue » (point 2) est SUPPRIMÉE :
//    c'était une invitation ouverte à sortir du contexte, et elle a produit
//    exactement ça (Patagonia → « la marque outdoor de référence »).
//  · trois interdits sont désormais NOMMÉS, parce qu'ils sont apparus dans les
//    sorties : provenance, garantie de fonctionnement (Casio → « fonctionnement
//    garantis », alors que la fonction ne voit aucune photo et n'a testé rien),
//    superlatif de notoriété. Un interdit générique ne suffit pas : le modèle
//    ne range pas spontanément « de référence » dans « inventer un fait ».
//  · les cibles de longueur sont abaissées (cf. PLATFORM_LIMITS) et présentées
//    comme indicatives : on ne pousse plus à écrire long.
//  · hashtags : l'échappatoire « pas de hashtag si tu n'en as pas 3 de
//    légitimes » est RETIRÉE — elle expliquait le 0 hashtag sur la casquette
//    Volcom (contexte pauvre → le modèle a préféré n'en mettre aucun, alors
//    que marque + type + couleur en fournissaient trois sans rien affirmer).
//
// RÉVISION 2026-07-30, après le cas réel New Balance 9060 Triple Black :
//  · TITRE : le titre généré portait « U9060CTN », le SKU lu sur l'étiquette
//    intérieure — exact mais illisible pour un acheteur et mauvais pour la
//    recherche. Aucune consigne ne disait quoi que ce soit du CONTENU du titre
//    (seulement sa longueur) : bloc TITRE ajouté — nom de modèle commercial
//    d'abord, jamais le code fabricant ; le code peut aller en description,
//    une fois, seulement s'il est prouvé par le contexte.
//  · USAGE INVENTÉ : la description qualifiait ces sneakers lifestyle de
//    « fonctionnelles pour la randonnée ». Pourquoi le garde-fou v66 (prompt
//    2026-07-29b) ne couvrait pas ce cas : (a) ses interdits énumèrent des
//    CLASSES de faits nommées (matière, mesure, provenance, garantie de
//    fonctionnement, notoriété, année/collection/prix) — l'usage/la
//    destination n'en faisait pas partie, et le modèle ne range pas
//    spontanément « pour la randonnée » dans « inventer un fait » (même leçon
//    que « de référence » le 29/07 : un interdit générique ne suffit pas) ;
//    (b) surtout, le point 3 de la structure INVITAIT à écrire « comment la
//    porter ou l'utiliser : une ou deux associations ou occasions concrètes »
//    — une destination sportive se lit précisément comme une « occasion
//    concrète ». Correctif double : interdit NOMMÉ (pratique sportive, usage
//    technique) + point 3 restreint aux associations de STYLE.
function redactionDirective(platform: string, lang: string): string {
  const lim = PLATFORM_LIMITS[platform];
  if (!lim) return "";
  const [bas, haut] = lim.cible;
  if (lang === "en") {
    const tagsEn = lim.hashtags
      ? `HASHTAGS — MANDATORY on this platform: always end the description with 3 to 6 hashtags on a SEPARATE FINAL LINE, written #keyword with no space and no accent ("#zara", "#denimjacket"). They are not extra claims: build them only from what you already wrote — the brand, the item type, the colour, the department (women/men/girls/boys). Those always give you three, so there is NO case where you leave them out. Never a hashtag asserting something absent from the context (no "#vintage", "#leather", "#new" without a source).`
      : `HASHTAGS — NONE on this platform: no hashtag, anywhere in the description. Buyers here do not search that way and it reads like spam.`;
    return `
WRITING THE DESCRIPTION.
ABSOLUTE GUARD-RAIL — READ THIS BEFORE WRITING ANYTHING. Every single fact you write must come from the item context or the confirmed fields you were given. Nothing else exists: if it is not in the context or the fields, it does not exist and you say nothing about it.
It is FORBIDDEN to invent, infer or imply:
- a material or composition;
- any measurement whatsoever (cm, size, weight);
- PROVENANCE: country of manufacture, "made in", origin, where or when it was bought;
- ANY WORKING GUARANTEE: never state or suggest that the item works, functions, has been tested, is authentic, is complete or is free of defects — not even for electronics, not even in passing;
- ANY REPUTATION SUPERLATIVE: "a must-have", "the reference", "iconic", "cult", "legendary", "timeless", "renowned", and more generally any sentence about the brand's reputation, standing, expertise or what it is known for;
- ANY USE OR PURPOSE the context does not state: never assign the item a sport, an activity or a technical capability ("great for hiking", "perfect for running", "waterproof", "for the trail or the work site") that is absent from the context — lifestyle sneakers never become hiking shoes. Suggesting a style is fine; claiming a performance is a fact, and an invented fact is forbidden;
- a year or era, a collection name, a retail price, a defect, a care instruction.
Never write "probably", "certainly" or "must be" to smuggle in a guess. A SHORTER description always beats an invented sentence: when in doubt, cut.
STRUCTURE — flowing sentences, no bullet lists, no headings. Work through these points in order, SKIPPING without hesitation every point the context gives you nothing for:
1. A hook: what the item IS, in one concrete sentence.
2. The detail that sets THIS piece apart — model, colourway, finish, marking — exactly as it appears in the context. Nothing in the context: skip this point.
3. How to wear it: one or two concrete STYLE pairings or occasions (outfit, season, everyday look). This point never assigns a sport, an activity or a technical capability — that is a fact, and facts must come from the context (see the guard-rail above). Skip entirely for non-fashion items.
4. Cut, fit and material ONLY when the context states them; condition, in the words the context uses.
5. One short closing line on shipping/handover.
TITLE — COMMERCIAL NAME, NEVER THE SKU: a manufacturer code read on a label (letters-and-digits reference like "U9060CTN" or "DC7350-100") NEVER goes in the title — buyers search the commercial model name ("New Balance 9060"), not the internal reference. Use the commercial name the context gives, or the model line plainly readable inside the code itself ("U9060CTN" → "9060"); otherwise brand + item type + colourway make the title. The exact code may appear ONCE in the description, only if it is present in the context, copied character for character — never completed or guessed. THE BRAND APPEARS EXACTLY ONCE in the title: the context often carries it twice (its own "Marque:" line AND inside the "Article:" line) — never write it twice yourself.
LENGTH — ${bas} to ${haut} characters WHEN the material allows it, and no further: never pad, never stretch to reach a number. A 200-character description that is entirely true is a GOOD description. Hard cap: ${lim.desc} characters; the title must never exceed ${lim.titre} characters.
${tagsEn}`;
  }
  const hashtagBloc = lim.hashtags
    ? `HASHTAGS — OBLIGATOIRES sur cette plateforme : termine TOUJOURS la description par 3 à 6 hashtags, sur une DERNIÈRE LIGNE séparée, format #motclé collé sans espace ni accent (« #zara », « #vestemijeans »). Ce ne sont pas des affirmations de plus : construis-les uniquement à partir de ce que tu as DÉJÀ écrit — la marque, le type d'article, la couleur, le rayon (femme/homme/fille/garçon). Ces quatre-là en fournissent toujours trois, donc il n'existe AUCUN cas où tu n'en mets pas. Jamais un hashtag qui affirme quelque chose d'absent du contexte (pas de « #vintage », « #cuir » ni « #neuf » sans source).`
    : `HASHTAGS — NON sur cette plateforme : aucun hashtag, nulle part dans la description. Les acheteurs n'y cherchent pas comme ça et ça fait annonce spam.`;
  return `
RÉDACTION DE LA DESCRIPTION.
GARDE-FOU ABSOLU — À LIRE AVANT D'ÉCRIRE QUOI QUE CE SOIT. Chaque fait écrit doit venir du contexte article ou des champs confirmés qu'on t'a donnés. Rien d'autre n'existe : si l'information n'est pas dans les photos décrites ou dans les champs, elle n'existe pas et tu n'en parles pas.
Il est INTERDIT d'inventer, de déduire ou de laisser entendre :
- une matière, une composition ;
- une mesure quelle qu'elle soit (cm, taille, poids) ;
- une PROVENANCE : pays de fabrication, « made in », origine, lieu ou date d'achat ;
- TOUTE GARANTIE DE FONCTIONNEMENT : n'écris ni ne suggère jamais que l'article marche, fonctionne, a été testé, est authentique, est complet ou est sans défaut — même pour un objet électronique, même en passant ;
- TOUT SUPERLATIF DE NOTORIÉTÉ : « incontournable », « de référence », « iconique », « culte », « légendaire », « intemporel », « réputé », et plus généralement toute phrase sur la réputation, le rang, le savoir-faire de la marque ou ce pour quoi elle est connue ;
- TOUT USAGE OU DESTINATION que le contexte ne donne pas : n'attribue JAMAIS à l'article une pratique sportive, une activité ou une capacité technique (« fonctionnelles pour la randonnée », « parfaites pour le running », « étanche », « pour le trail ou le chantier ») absentes du contexte — des sneakers lifestyle ne deviennent jamais des chaussures de randonnée. Suggérer un style, oui ; affirmer une performance, c'est un fait, et un fait inventé est interdit ;
- une année ou une époque, un nom de collection, un prix d'origine, un défaut, une consigne d'entretien.
N'écris jamais « probablement », « sans doute » ni « doit être » pour faire passer une supposition. Une description plus COURTE vaut toujours mieux qu'une phrase inventée : au moindre doute, coupe.
STRUCTURE — phrases suivies, sans liste à puces ni titres de section. Traite ces points dans cet ordre, en SAUTANT sans hésiter tout point pour lequel le contexte ne te donne rien :
1. Une accroche : ce qu'est l'article, en une phrase concrète.
2. Le détail qui distingue CETTE pièce — modèle, coloris, finition, marquage — tel qu'il apparaît dans le contexte. Rien dans le contexte : saute ce point.
3. Comment la porter : une ou deux associations de STYLE ou occasions concrètes (tenue, saison, look du quotidien). Ce point n'attribue jamais une pratique sportive ni une capacité technique — c'est un fait, et les faits viennent du contexte (cf. garde-fou ci-dessus). À sauter entièrement pour un objet hors mode (électronique, maison, jouet…).
4. Coupe, tombé et matière SEULEMENT si le contexte les donne ; l'état, avec les mots du contexte.
5. Une courte ligne de fin sur l'envoi ou la remise.
TITRE — RÉFÉRENCE COMMERCIALE, JAMAIS LE SKU : un code fabricant lu sur une étiquette (référence lettres-chiffres type « U9060CTN », « DC7350-100 ») ne va JAMAIS dans le titre — les acheteurs cherchent le nom commercial du modèle (« New Balance 9060 »), pas la référence interne. Utilise le nom commercial donné par le contexte, ou la ligne de modèle lisible telle quelle dans le code (« U9060CTN » → « 9060 ») ; sinon marque + type d'article + coloris font le titre. Le code exact peut figurer UNE fois en description, seulement s'il est présent dans le contexte, recopié caractère pour caractère — jamais complété ni deviné. LA MARQUE APPARAÎT EXACTEMENT UNE FOIS dans le titre : le contexte la porte souvent deux fois (sa ligne « Marque: » ET dans la ligne « Article: ») — ne l'écris jamais deux fois toi-même.
LONGUEUR — ${bas} à ${haut} caractères QUAND la matière le permet, pas davantage : n'allonge jamais, ne remplis jamais pour atteindre un nombre. Un texte de 200 caractères entièrement vrai est un BON texte. Plafond dur : ${lim.desc} caractères ; le titre ne dépasse JAMAIS ${lim.titre} caractères.
${hashtagBloc}`;
}

// Tronquage de sécurité au dernier mot entier (jamais au milieu d'un mot, et
// jamais au milieu d'un hashtag : on coupe sur une frontière d'espace).
function clampToWord(s: string, max: number): string {
  const v = String(s ?? "");
  if (v.length <= max) return v;
  const coupe = v.slice(0, max);
  const dernierEspace = coupe.lastIndexOf(" ");
  return (dernierEspace > max * 0.6 ? coupe.slice(0, dernierEspace) : coupe).trimEnd();
}

// ── Contexte article commun aux rédacteurs (extrait tel quel) ───────────────
// familleLivresMedias : l'appelant fournit le booléen (generate-listing via
// retouchProfileFor, lens-analysis via la famille de son analyse).
export function construireContexteArticle({ item, canonicalProvided, familleLivresMedias }: {
  item: { titre?: string; marque?: string; description?: string; type?: string };
  canonicalProvided: Record<string, string>;
  familleLivresMedias: boolean;
}): { itemContext: string; canonicalCtx: string[] } {
    // ── Step 3: Claude Haiku — title + description per platform ──────────────
    // Champs canoniques connus (client) : injectés comme CONTRAINTES — chaque
    // prompt plateforme doit les recopier tels quels au lieu de ré-inférer
    // (4 inférences indépendantes divergeaient : taille "M" Vinted/Beebs vs
    // "L" eBay/LBC sur le même article, job du 2026-07-11 09:56).
    // ⚠️ `etat` a une consigne DIFFÉRENTE des quatre autres champs canoniques.
    // « Recopie TELLE QUELLE » y serait dangereux : les 5 plateformes ont des
    // listes fermées DIFFÉRENTES (Vinted « Satisfaisant » vs LBC « État
    // satisfaisant » vs Beebs « État moyen » ; « Neuf avec étiquette » vs
    // « Neuf, avec étiquette » vs « État neuf »), et la valeur du Lens est du
    // texte libre non normalisé (« Bon », « bon », « Bon état », « Très bon »
    // relevés le 28/07). Une recopie littérale enverrait donc des valeurs hors
    // liste à LBC et Beebs. On demande le rapprochement dans la liste de CHAQUE
    // plateforme, sans table de correspondance (celle-ci viendra avec le front).
    const canonicalCtx = Object.entries(canonicalProvided).map(([k, v]) =>
      k === "etat"
        ? `État réel de l'article, LU sur les photos: ${v} (choisis dans TA liste fermée la valeur la plus proche de cette lecture et mets-la dans platform_fields.etat ; ne conclus JAMAIS au neuf si cette lecture ne dit pas neuf)`
        : `${k.charAt(0).toUpperCase() + k.slice(1)}: ${v} (valeur CONFIRMÉE — recopie-la TELLE QUELLE dans platform_fields.${k}, ne la ré-infère pas)`
    );
    const itemContext = [
      item.marque && `Marque: ${item.marque}`,
      item.titre && `Article: ${item.titre}`,
      item.type && `Type: ${item.type}`,
      item.description && `Description: ${item.description}`,
      // ⚠️ `item.statut` VOLONTAIREMENT ABSENT du contexte (2026-07-28, lot 2).
      // Il était envoyé sous le libellé « État: stock » — or c'est le STATUT
      // D'INVENTAIRE (inventaire.statut : stock | vendu, ou le littéral "stock"
      // posé par le client), PAS l'état de l'article. Le rédacteur lisait une
      // ligne « État: » dans son contexte, en tirait « en stock = jamais porté »
      // et concluait « Neuf sans étiquette » (Vinted) / « État neuf » (LBC) sur
      // un article que le Lens avait lu en « Bon état ». Un état faux sur une
      // annonce, c'est un litige acheteur.
      // Retirée plutôt que renommée : savoir qu'un article est en stock ou vendu
      // n'apporte RIEN à la rédaction d'une annonce, et un simple renommage
      // laisserait le mot « État » ambigu dans un contexte déjà chargé.
      // En l'absence de signal, les 4 prompts appliquent leur défaut déjà écrit :
      // « Très bon état » (même défaut que DEFAULT_CONDITION côté client).
      // ⚠️ prix_vente VOLONTAIREMENT absent du contexte (2026-07-25, S3) : le
      // LLM recopiait le prix dans la description ("Prix: 10€" mesuré sur 12
      // des 46 descriptions en base) alors qu'il a son champ dédié sur chaque
      // plateforme. Il n'est utile à aucun prompt — le champ `price` de la
      // réponse vient de item.prix_vente/body_price, pas du LLM. L'interdiction
      // dans les prompts reste nécessaire : le prix peut aussi arriver via la
      // description utilisateur ou une étiquette photographiée.
      ...canonicalCtx,
      // ── LIVRES ET MÉDIAS : la description porte sur le CONTENU (2026-08-31) ──
      // Mesuré sur le test « EAT » de Gilles Lartigot : la description générée
      // était « Couverture rigide illustrée d'un visage barbu en gros plan et
      // d'un crâne de bovin au dos ». Décrire ce qu'on voit est exactement le
      // bon réflexe sur un vêtement — c'est le seul réflexe possible quand le
      // contexte est une photo. Sur un livre, c'est hors sujet : l'acheteur
      // choisit sur le SUJET, pas sur la jaquette.
      // ⚠️ CONSIGNE STRICTEMENT RÉSERVÉE À livres_medias (garde-fou explicite) :
      // la famille vient de l'icône résolue (même résolveur que la retouche
      // photo), et sur toute autre famille rien ne change.
      ...(familleLivresMedias ? [
        "LIVRE / MÉDIA — LA DESCRIPTION PORTE SUR LE CONTENU. Écris de quoi parle l'ouvrage : sujet, thème, angle, ce que le lecteur y trouve, et l'auteur. " +
        "N'OUVRE JAMAIS la description sur l'apparence de la couverture, de la jaquette ou du visuel (« couverture rigide illustrée d'un visage… » est exactement ce qu'il ne faut pas écrire) — l'acheteur choisit un livre sur son sujet, pas sur son dessin de couverture. " +
        "L'état physique reste mentionné, mais EN FIN de description et en une phrase courte, jamais comme sujet principal. " +
        "N'INVENTE AUCUN CONTENU et ne raconte pas la fin : si tu ne connais pas l'ouvrage avec certitude, tiens-t'en à ce que le titre, l'auteur et le contexte permettent d'affirmer, et reste court plutôt que d'inventer un résumé.",
      ] : []),
    ].filter(Boolean).join("\n");
  return { itemContext, canonicalCtx };
}

// ── Rédaction + post-production (extraites telles quelles) ──────────────────
export async function redigerAnnoncesPlateformes({ apiKey, platforms, itemContext, item, canonicalProvided, trackClaude }: {
  apiKey: string;
  platforms: string[];
  itemContext: string;
  item: { titre?: string; marque?: string; description?: string; type?: string };
  canonicalProvided: Record<string, string>;
  trackClaude: (data: unknown) => void;
}) {
    console.log(`[redaction] rédaction prompt ${VERSION_PROMPT} — plateformes: ${(platforms as string[]).join(", ")}`);
    // Marque UNE seule fois dans le titre de repli (2026-07-30, cas réel New
    // Balance 9060) : le titre Lens contient souvent déjà la marque
    // (« Chaussures … New Balance U9060CTN marron ») — la préfixer en plus
    // donnait « New Balance Chaussures … New Balance … ». Déterministe ici, en
    // plus de la consigne TITRE des prompts (le repli ne passe par aucun LLM).
    const fallbackTitle = (() => {
      const base = String(item.titre || item.type || "").trim();
      const marque = String(item.marque ?? "").trim();
      const marqueDejaLa = marque && base.toLowerCase().includes(marque.toLowerCase());
      return [marqueDejaLa ? null : marque, base].filter(Boolean).join(" ") || "Article";
    })();
    const platformListings: Record<string, { title: string; description: string; platform_fields: Record<string, string | null> }> = {};

    await Promise.all(
      (platforms as string[]).map(async (platform) => {
        const cfg = PLATFORM_CFG[platform];
        if (!cfg) {
          platformListings[platform] = { title: fallbackTitle, description: item.description ?? "", platform_fields: {} };
          return;
        }

        const userMsg = cfg.lang === "en"
          ? `Write a listing for:\n${itemContext}`
          : `Rédige une annonce pour:\n${itemContext}`;

        try {
          const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model: "claude-haiku-4-5-20251001",
              // 1400 (2026-07-29) : 900 tenait juste pour des descriptions de
              // ~300 caractères ; les cibles montent à 300-650 caractères selon
              // la plateforme, plus le JSON et platform_fields. Un `max_tokens`
              // trop court coupe la réponse EN PLEIN JSON → parse en erreur →
              // repli titre brut, description vide. Marge volontairement large,
              // et conservée après l'abaissement des cibles (29/07b) : on ne
              // paie que les tokens réellement produits, un plafond haut ne
              // coûte rien alors qu'un plafond juste casse la réponse.
              max_tokens: 1400,
              system: `${cfg.system}\n${LANG_DIRECTIVE[cfg.lang] ?? LANG_DIRECTIVE.fr}\n${redactionDirective(platform, cfg.lang)}`,
              messages: [{ role: "user", content: userMsg }],
            }),
          });

          if (claudeRes.ok) {
            const claudeData = await claudeRes.json();
            trackClaude(claudeData);
            const text: string = claudeData.content?.[0]?.text ?? "";
            const firstBrace = text.indexOf("{");
            const lastBrace = text.lastIndexOf("}");
            if (firstBrace !== -1 && lastBrace > firstBrace) {
              try {
                const parsed = JSON.parse(text.slice(firstBrace, lastBrace + 1));
                // Filet de longueur (2026-07-29) : le modèle a sa cible dans le
                // prompt, mais une consigne n'est pas une garantie — et un titre
                // de 105 caractères se fait refuser par Vinted, pas tronquer.
                // Plafonds : cf. PLATFORM_LIMITS (chaque chiffre y est sourcé).
                const lim = PLATFORM_LIMITS[platform];
                const brutTitle = String(parsed.title ?? fallbackTitle);
                const brutDesc = String(parsed.description ?? "");
                if (lim && (brutTitle.length > lim.titre || brutDesc.length > lim.desc)) {
                  console.warn(`[redaction] ${platform} hors gabarit (titre ${brutTitle.length}/${lim.titre}, desc ${brutDesc.length}/${lim.desc}) — tronqué, prompt ${VERSION_PROMPT}`);
                }
                platformListings[platform] = {
                  title: lim ? clampToWord(brutTitle, lim.titre) : brutTitle,
                  description: lim ? clampToWord(brutDesc, lim.desc) : brutDesc,
                  platform_fields: parsed.platform_fields ?? {},
                };
              } catch (parseErr) {
                console.error(`[redaction] JSON parse error ${platform}:`, parseErr);
              }
            }
          } else {
            console.error(`[redaction] claude ${platform}:`, await claudeRes.text());
          }
        } catch (e) {
          console.error(`[redaction] claude exception ${platform}:`, e);
        }

        if (!platformListings[platform]) {
          platformListings[platform] = { title: fallbackTitle, description: item.description ?? "", platform_fields: {} };
        }
      })
    );

    // ── Canonicalisation taille/couleur/matiere/marque (2026-07-11, Sujet 4) ──
    // Les 4 appels ci-dessus restent indépendants et non déterministes : le
    // même article peut sortir taille "M" chez Vinted et "L" chez eBay. Une
    // seule valeur SOURCE par champ, répliquée partout — zéro appel IA en
    // plus : priorité à la valeur client (canonical_fields), sinon première
    // réponse non vide dans un ordre FIXE, français d'abord (l'anglais
    // résiduel d'eBay — "Black" — ne doit jamais devenir la référence).
    // Chaque plateforme garde ensuite sa propre conversion vers son
    // vocabulaire local (cascades extension / selects app, inchangés).
    // La réplication ne pose un champ QUE sur les plateformes qui le
    // CONSOMMENT réellement. taille inclut leboncoin : son PROMPT n'en a pas
    // (volontaire, cf. Sujet 3) mais leboncoin.js remplit la Pointure
    // (critère OBLIGATOIRE sur Mode>Chaussures) depuis fields.taille — la
    // valeur arrive par la config stepper côté app, pas par la génération.
    // couleur reste hors Leboncoin (aucun schéma ni handler ne la lit).
    // ⚠️ Carte de RÉPLICATION ≠ carte de GARDE côté app : la garde
    // pré-publication ne bloque JAMAIS Leboncoin sur taille/couleur.
    {
      const FIELD_PLATFORMS: Record<string, string[]> = {
        taille:  ["vinted", "beebs", "leboncoin", "ebay", "vestiaire"],
        couleur: ["vinted", "beebs", "ebay"],
        matiere: ["vinted", "beebs", "leboncoin", "ebay", "vestiaire"],
        marque:  ["vinted", "beebs", "leboncoin", "ebay", "vestiaire"],
      };
      const PRIORITY = ["vinted", "beebs", "leboncoin", "ebay", "vestiaire"];
      const clean = (v: unknown): string | null => {
        const s = typeof v === "string" ? v.trim() : "";
        return s && s.toLowerCase() !== "null" ? s : null;
      };
      for (const [field, consumers] of Object.entries(FIELD_PLATFORMS)) {
        const canonical = canonicalProvided[field] ??
          PRIORITY.filter((p) => consumers.includes(p))
            .map((p) => clean(platformListings[p]?.platform_fields?.[field]))
            .find(Boolean) ?? null;
        if (!canonical) continue; // rien de fiable nulle part : le client bloquera/demandera
        for (const p of consumers) {
          if (platformListings[p]) platformListings[p].platform_fields[field] = canonical;
        }
      }
    }

    // ── ÉTAT : UNE SEULE VALEUR, MAPPÉE (2026-08-31) ──────────────────────────
    // `etat` était volontairement HORS de la carte de réplication ci-dessus,
    // parce que les listes fermées diffèrent d'une plateforme à l'autre. La
    // conséquence n'avait pas été tirée : chaque prompt tranchait donc SEUL, et
    // quatre inférences indépendantes divergeaient sur le même article. Mesuré
    // le 31/08 sur un livre d'occasion, même passage de génération :
    //   vinted « Neuf sans étiquette » · ebay « Neuf sans étiquette »
    //   leboncoin « Très bon état »    · beebs « Très bon état »
    // Un état faux sur une annonce, c'est un litige acheteur — et deux annonces
    // du même objet qui se contredisent, c'est pire.
    // On ne demande plus le rapprochement au modèle : on part d'UNE valeur de
    // référence et on la MAPPE, ici, dans le vocabulaire de chaque plateforme.
    // Les cinq listes sont recopiées des prompts eux-mêmes (libellés réels des
    // formulaires) — « Satisfaisant » Vinted/eBay vs « État satisfaisant » LBC
    // vs « État moyen » Beebs, « Neuf avec étiquette » vs « Neuf, avec
    // étiquette » vs « État neuf ». Vestiaire n'a pas de palier bas : son plus
    // bas est « Bon état ».
    let traceEtat: Record<string, unknown> = {};
    let traceIsbn: Record<string, unknown> = {};
    {
      const ETAT_PAR_PLATEFORME: Record<string, Record<string, string>> = {
        neuf_etiquette: { vinted: "Neuf avec étiquette", ebay: "Neuf avec étiquette", beebs: "Neuf, avec étiquette", leboncoin: "État neuf",          vestiaire: "Neuf avec étiquette" },
        neuf_sans:      { vinted: "Neuf sans étiquette", ebay: "Neuf sans étiquette", beebs: "Neuf, sans étiquette", leboncoin: "État neuf",          vestiaire: "Neuf sans étiquette" },
        tres_bon:       { vinted: "Très bon état",       ebay: "Très bon état",       beebs: "Très bon état",        leboncoin: "Très bon état",      vestiaire: "Très bon état" },
        bon:            { vinted: "Bon état",            ebay: "Bon état",            beebs: "Bon état",             leboncoin: "Bon état",           vestiaire: "Bon état" },
        satisfaisant:   { vinted: "Satisfaisant",        ebay: "Satisfaisant",        beebs: "État moyen",           leboncoin: "État satisfaisant",  vestiaire: "Bon état" },
      };
      // Texte libre → palier. Le Lens rend une des 5 valeurs Vinted, mais les
      // relevés du 28/07 montrent aussi « Bon », « bon », « Très bon » : on
      // tolère. ⚠️ « très bon » AVANT « bon » — le second est inclus dans le
      // premier et l'ordre des tests fait toute la différence.
      const tierEtat = (v: string | null | undefined): string | null => {
        const s = String(v ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
        if (!s) return null;
        if (/neuf/.test(s) && /avec/.test(s)) return "neuf_etiquette";
        if (/neuf/.test(s)) return "neuf_sans";
        if (/tres bon|excellent/.test(s)) return "tres_bon";
        if (/\bbon\b/.test(s)) return "bon";
        if (/satisfaisant|moyen|correct|piece/.test(s)) return "satisfaisant";
        return null;
      };
      const DEFAUT_ETAT = "tres_bon"; // règle produit, identique à DEFAULT_CONDITION côté client
      const lus = Object.values(platformListings)
        .map((l) => tierEtat(l?.platform_fields?.etat as string | null))
        .filter((t): t is string => Boolean(t));
      // Source unique, dans cet ordre :
      //  1. l'état CANONIQUE (lu par le Lens sur les photos, ou saisi) ;
      //  2. sinon, un « neuf » UNANIME — même palier sur toutes les plateformes
      //     interrogées : c'est un signal du contexte, pas une divergence, et
      //     l'écraser ferait passer un article réellement neuf en occasion ;
      //  3. sinon le défaut « Très bon état », appliqué PARTOUT de la même
      //     façon. C'est exactement ce qui manquait : deux plateformes sur
      //     quatre l'appliquaient déjà, les deux autres inventaient du neuf.
      const unanimeNeuf = lus.length > 0 && new Set(lus).size === 1 &&
        (lus[0] === "neuf_etiquette" || lus[0] === "neuf_sans");
      const tierCanonique = tierEtat(canonicalProvided.etat);
      const tier = tierCanonique ?? (unanimeNeuf ? lus[0] : DEFAUT_ETAT);
      for (const [p, l] of Object.entries(platformListings)) {
        const v = ETAT_PAR_PLATEFORME[tier]?.[p];
        if (l && v) l.platform_fields.etat = v;
      }
      // ── TRACE (2026-08-31) : QUELLE BRANCHE A DÉCIDÉ ────────────────────────
      // Le 31/08, sur le livre « EAT » sorti en « Neuf sans étiquette » alors
      // qu'il est d'occasion, il a été IMPOSSIBLE de dire si l'état venait du
      // Lens (canonique) ou de l'exception « neuf unanime » : ni l'un ni
      // l'autre n'était tracé, et les réponses brutes des 4 modèles ne sont
      // persistées nulle part. Trois clés suffisent à trancher au cas suivant.
      // (Reste dans usage_logs, pas dans coin_ledger : c'est de la mesure.)
      traceEtat = {
        etat_branche: tierCanonique ? "canonique" : (unanimeNeuf ? "neuf_unanime" : "defaut"),
        etat_tier: tier,
        // Ce que les modèles ont répondu AVANT la normalisation — c'est lui qui
        // dit si l'unanimité était réelle ou si un seul modèle a entraîné les
        // autres. Trié pour être requêtable.
        etat_lus: [...lus].sort(),
      };
    }

    // ── ISBN : posé, jamais RÉ-ÉCRIT PAR LE MODÈLE (2026-08-31) ───────────────
    // La valeur vient du Lens (attributs_visibles.isbn_ean) ou de l'utilisateur,
    // et elle atterrit dans platform_fields.isbn — le champ dédié que
    // vinted.js lit déjà (`if (fields.isbn)`, étape ISBN : normalisation, pose
    // commitée, relecture stricte, attente du lookup livre).
    // ⛔ Jamais demandé au rédacteur : treize chiffres, ça ne se reformule pas,
    // et un ISBN faux envoie l'annonce sur un autre ouvrage.
    {
      // ⚠️ VALIDATION ÉLARGIE (2026-08-31, 3e échec du test EAT). La version
      // précédente exigeait que la chaîne ENTIÈRE soit l'ISBN
      // (`/^\d{13}$/` après retrait des espaces et tirets). Or la valeur vient
      // d'attributs_visibles.isbn_ean, qui est du TEXTE LIBRE relevé par le
      // Lens : « EAN 9782981413604 », « ISBN : 978-2-9814136-0-4 », « ISBN-13
      // 9782981413604 » sont tous refusés par une ancre stricte, alors qu'ils
      // portent l'ISBN. On EXTRAIT désormais au lieu d'exiger une forme.
      // Ancre sûre : un ISBN-13 commence TOUJOURS par 978 ou 979 — ce préfixe
      // évite de ramasser un autre nombre à 13 chiffres. L'ISBN-10 n'est
      // accepté que si la chaîne compacte ne contient QUE lui (sinon
      // « ISBN-10 » ferait entrer son propre « 10 » dans le compte).
      const compact = String(canonicalProvided.isbn ?? "").toUpperCase().replace(/[^0-9X]/g, "");
      const isbn = compact.match(/97[89]\d{10}/)?.[0]
        ?? (/^\d{9}[\dX]$/.test(compact) ? compact : null);
      if (isbn && platformListings.vinted) platformListings.vinted.platform_fields.isbn = isbn;
      // Trace du 5e maillon (2026-08-31). Quatre maillons sur cinq étaient
      // prouvés par relevé — Lens rend bien isbn_ean, le cache identify est
      // vide, canonical_fields.isbn part dans le bundle servi, et
      // genericKnownSource lit pf.isbn. Le seul non observable était CE
      // passage : reçu ? reconnu ? posé ? Trois clés, dans la trace existante.
      traceIsbn = {
        isbn_recu: Boolean(canonicalProvided.isbn),
        isbn_recu_len: String(canonicalProvided.isbn ?? "").length,
        isbn_pose: Boolean(isbn && platformListings.vinted),
      };
    }
  return { platformListings, traceEtat, traceIsbn };
}


