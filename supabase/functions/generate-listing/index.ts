import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// Détection de catégorie de l'app (≈120 règles regex + défauts par catégorie) :
// UNIQUE source de vérité, importée telle quelle — jamais dupliquée ici.
// shared.js est un module pur (aucun import, aucune API navigateur), le
// bundler du CLI Supabase l'embarque au deploy comme n'importe quel import
// relatif. Même signature que côté app : detectObjectIcon(titre, description, type).
import { detectObjectIcon, ALL_OBJECT_ICONS, ICON_LEGEND } from "../../../src/utils/shared.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Tailles ENFANT (2026-07-15, chantier « trou tailles bébé/enfant ») ──────
// Les schémas vinted/beebs/ebay acceptent désormais, POUR LES ARTICLES
// ENFANT uniquement, les valeurs canoniques du référentiel
// src/utils/childSizes.js : "Prématuré" | "Naissance" | "N mois"
// (1|3|6|9|12|18|24|36) | "N ans" (2→16, 18 LBC seulement) | "EU N"
// (pointure 15→41). JAMAIS de nombre nu : "3" est ambigu (3 ans ? pointure ?
// taille 34 tronquée ?) et c'est précisément ce qui rendait le fuzzy des
// content scripts dangereux (un "2" matchait "2 ans"). La conversion vers le
// libellé exact de chaque plateforme ("6-9 mois / 68 cm" Vinted, "6 mois
// (60-66 cm)" Beebs…) se fait à l'insert du job (handlePublish), pas ici.
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
const VERSION_PROMPT = "2026-07-30b";

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

// ── Retouche photo (GPT Image 2) ───────────────────────────────────────────────
// Niveau "ia_light" : un seul prompt générique (luminosité/balance des blancs
// uniquement — les codes photo par catégorie n'entrent pas en jeu à ce niveau).
// Formulé "item" et non "garment" : il s'applique à toutes les catégories.
const OPENAI_IMG_PROMPT_LIGHT = `Lightly enhance this product photo: adjust white balance and brightness slightly so the item reads clearly, and correct any obvious color cast. Keep everything else exactly as in the original photo — pose, framing, angle, background, and every detail of the item.

Strict constraints — do NOT change:
- The pose, framing, angle, or camera perspective
- The background
- The item's shape, size, color, pattern, material texture, or any detail (logos, stitching, prints, labels, signs of wear)
- Do not smooth, iron, or flatten anything; do not remove wrinkles, creases, or defects
- Do not add, remove, or invent any element

This is a fast, subtle brightness/white-balance correction only — nothing else should visibly change.`;

// Règle de réalisme commune à TOUTES les familles du niveau "ia_advanced".
// La photo doit montrer le VRAI article : améliorer la présentation (lumière,
// netteté, fond, fidélité couleurs), jamais l'objet lui-même. Un article
// "parfait" qui ne ressemble pas à ce que l'acheteur reçoit = litige et
// non-conformité aux règles des plateformes.
const REALISM_RULES = `Strict realism constraints — non-negotiable:
- The result must show the exact same item, exactly as it is: same shape, proportions, colors, pattern, material texture, and every detail (logos, stitching, prints, labels, hardware).
- Never remove or hide defects, stains, scratches, pilling, or signs of wear — the buyer must see the item's true condition.
- Never artificially smooth, iron, flatten, or "perfect" the item. Natural folds, light creases, and the real drape of the material must stay visible — a real, slightly lived-in look is correct and expected.
- Keep colors strictly faithful to the original photo — no saturation or tone shift that changes the perceived color.
- Do not add, remove, or invent any element on or around the item.
- Do not change the pose, framing, angle, or camera perspective.
Only the PRESENTATION may improve: lighting, sharpness, white balance, and a cleaner, less distracting background (kept recognizable as the same location).`;

// Familles de retouche "ia_advanced" : un prompt spécialisé par famille de
// produit, mappé depuis l'icône retournée par detectObjectIcon (les mêmes
// icônes que les tuiles Stock/Ventes et le mapping catalogue des plateformes).
// Chaque prompt = intro spécialisée (codes photo de la famille) + REALISM_RULES.
// Pour ajuster une famille : modifier son intro ; pour déplacer une catégorie :
// déplacer son icône d'une liste à l'autre. Icône absente de toute liste →
// famille "default".
const RETOUCH_FAMILIES: Array<{ family: string; icons: string[]; intro: string }> = [
  {
    family: "vetements",
    icons: ["👗","🥼","🧥","🎀","🤵","👔","🧶","👕","🩳","👖","🩲","🧦","👙","🧣","🧤","🧢","🎭"],
    // Curseur tissu (2026-07-10) : le 1er recalibrage anti-"repassage vapeur"
    // laissait les faux plis de stockage (vêtement resté plié en boule) — trop
    // loin dans l'autre sens. Cible = "présenté pour la vente" : faux plis de
    // pliage atténués (SEULE exception, explicitement scellée, à la règle
    // anti-lissage de REALISM_RULES ci-dessous), tombé naturel et micro-plis
    // de la matière conservés, jamais de surface parfaitement lisse.
    intro: `Enhance this clothing product photo for a resale listing. Apply soft, natural, window-like lighting (even, no harsh shadows), improve sharpness and color accuracy, and tidy a cluttered background so the garment stands out.

Fabric presentation — aim for "prepared for sale", the way a careful seller would lightly steam and neatly arrange a garment before shooting it: soften the pronounced storage and folding creases (sharp crease lines left by a garment stored folded or crumpled), so it looks cared-for and presentable. This softening of storage creases is the ONLY exception to the no-smoothing rule below. Always preserve the fabric's natural drape and the normal micro-folds of the material: never press it flat, never produce a perfectly smooth, flat, wrinkle-free surface — real fabric always keeps a slight relief, and a fully ironed-looking result reads as fake. The target is "clean and presentable", never "brand-new in shrink-wrap".`,
  },
  {
    family: "chaussures",
    icons: ["👟","👢","👠","🩴","🥿"],
    intro: `Enhance this footwear product photo for a resale listing. Apply clean, even lighting that reveals the shoe's materials and stitching, improve sharpness, and neutralize a distracting background so the pair reads clearly (keep the original angle — do not recompose into a different view). Leather grain, fabric texture, and creasing from normal wear must stay exactly as they are.`,
  },
  {
    family: "sacs",
    icons: ["👜","👛","🧳","🎒","👝","🎽"],
    intro: `Enhance this bag / leather-goods product photo for a resale listing. Apply soft, even lighting that shows the material's true grain and the hardware, improve sharpness, and clean up a distracting background. The bag's actual shape and structure as photographed must be preserved — do not inflate, restuff, or straighten it, and keep handles, straps, and hardware exactly as they are.`,
  },
  {
    family: "accessoires",
    icons: ["⌚","💍","🕶️","🪢","☂️","🗝️","💎"],
    intro: `Enhance this accessory / jewelry product photo for a resale listing. Favor crisp, sharp detail on the item (dial, stones, engravings, textures), with clean neutral lighting and a quieter background so the small item reads clearly. Reflections may be softened slightly but scratches and real wear must remain visible.`,
  },
  {
    family: "hightech",
    icons: ["📱","💻","🖥️","📲","🎧","🔊","🎮","📺","📷","🛸","🖨️","⌨️","🖱️","🔌","📡","📇","⏱️","🎤","📟"],
    intro: `Enhance this electronics product photo for a resale listing. Apply clean, neutral, even lighting (no color cast on screens or plastics), improve sharpness, and simplify a cluttered background toward a tidy, uncluttered look. Screen content, stickers, port wear, and surface scratches must remain exactly as photographed.`,
  },
  {
    family: "maison",
    icons: ["🛋️","🪑","🛏️","🛌","💡","🪞","🕯️","🖼️","🪴","🏺","🍽️","🍳","🪟","🪶","🟫","📜","🕰️","🎄","🖋️","☕","🫖","🧹","🧊","♨️","🥣","🍞","🍟","💇","🌀","🌡️","🧺","🧼","🪒","🪛","🪚","🔨","🪜","🖌️","🔩","📏","🔧","🌱","✂️","🔥","⛱️","🧵","🐕","🏠","⚡","🌿"],
    intro: `Enhance this home / furniture / appliance product photo for a resale listing. Apply warm, natural interior lighting, improve sharpness and color accuracy, and tidy the surroundings so the item is the clear subject (keep the room recognizable — just cleaner and less distracting). Wood grain, upholstery texture, and marks from normal use must remain exactly as they are.`,
  },
  {
    family: "livres_medias",
    icons: ["📚","📖","📰","💿","📀","💽","🃏","📮","🪙","🏆"],
    intro: `Enhance this book / media / collectible product photo for a resale listing. Present the cover or item flat and legible: even, glare-free lighting, strong sharpness on titles and artwork, faithful colors, and a clean background. Edge wear, creases, and aging must remain exactly as photographed — condition is what the buyer is judging.`,
  },
  {
    family: "enfants_jouets",
    icons: ["🧸","🪆","🧩","🧱","🦸","🎲","🏎️","👶","💺","🍼","🚼","🚁"],
    intro: `Enhance this toy / baby-gear product photo for a resale listing. Apply bright, friendly, even lighting with accurate colors, improve sharpness, and clean up a cluttered background so the item stands out. Play wear, faded prints, and used-condition details must remain exactly as they are.`,
  },
  {
    family: "sport",
    icons: ["🚲","🛴","🛹","⛸️","🎿","⚽","🏀","🎾","⛳","🏋️","🥊","⛺","🎣","🧘","🏃","🤿","🏄","🐴","🎱","🥽","🪖","⛑️","🏍️","🛵","🛞","🚗"],
    intro: `Enhance this sports / outdoor equipment product photo for a resale listing. Apply clear, even lighting that shows the equipment's condition honestly, improve sharpness and color accuracy, and reduce background clutter so the item reads at a glance. Scuffs, dirt traces, and wear from normal use must remain exactly as photographed.`,
  },
  {
    family: "beaute",
    icons: ["🌸","💄","💅","🧴"],
    intro: `Enhance this beauty / cosmetics product photo for a resale listing. Favor a clean, bright presentation: neutral even lighting, crisp label legibility, faithful packaging colors, and an uncluttered background. The fill level, seals, and label condition must remain exactly as photographed — never make a used product look new.`,
  },
];

// Prompt de repli : toute icône hors familles (instruments 🎸🎻🥁…, 📦 Autre, …).
const RETOUCH_DEFAULT_INTRO = `Enhance this product photo for a resale listing. Apply soft, natural, even lighting, improve sharpness, white balance, and color accuracy, and tidy a cluttered background so the item is the clear subject.`;

const ICON_TO_RETOUCH = new Map<string, { family: string; prompt: string }>();
for (const f of RETOUCH_FAMILIES) {
  const prompt = `${f.intro}\n\n${REALISM_RULES}`;
  for (const icon of f.icons) ICON_TO_RETOUCH.set(icon, { family: f.family, prompt });
}

function retouchProfileFor(item: { titre?: string; description?: string; type?: string }) {
  const icon = detectObjectIcon(item.titre ?? "", item.description ?? "", item.type ?? "");
  return {
    icon,
    ...(ICON_TO_RETOUCH.get(icon) ?? {
      family: "default",
      prompt: `${RETOUCH_DEFAULT_INTRO}\n\n${REALISM_RULES}`,
    }),
  };
}

// ── Choix de fond (ia_advanced uniquement) ─────────────────────────────────────
// Flow "option A" : le fond est choisi AVANT génération, une seule image est
// produite (un seul appel GPT Image 2, qualité "medium" — jamais de multi-pass
// ni de "high" qui timeout). "original" (défaut) = aucun remplacement de fond
// (comportement historique conservé). Étendre = ajouter une entrée ici.
const BACKGROUND_OPTIONS: Record<string, string> = {
  white: `New background: a premium seamless white studio sweep (cyclorama), bright and clean, with a subtle soft gradient from pure white behind the product to a very light grey toward the edges, professional e-commerce lighting.`,
  grey:  `New background: a polished microcement / smooth concrete surface in soft neutral grey, with subtle natural texture and gentle tonal variation, modern industrial-chic feel, soft directional studio light. Understated and premium, not busy.`,
  beige: `New background: a warm natural linen fabric backdrop with a soft visible woven texture, warmly and evenly lit, refined and tactile.`,
  wood:  `New background: a pale natural light-oak wood surface with clean visible grain (planks / parquet), warm daylight, calm lifestyle feel.`,
};

// Clause d'intégrité objet — préfixée à CHAQUE prompt de fond (remplace l'intro
// famille dans cette passe). Approche prompt-only (pas de masque/segmentation) :
// /images/edits accepte bien un `mask`, mais le CONSTRUIRE exige une étape de
// détourage de l'objet (appel segmentation ou 2e passe) — exclue par la
// contrainte "un seul appel, coût inchangé". La clause porte donc SEULE la
// garantie que seul le fond (et, pour un vêtement, les faux plis) change.
//
// DEUX variantes selon la famille détectée :
//   - vetements → CLAUSE VÊTEMENT : autorise un défroissage LÉGER des faux plis
//     de stockage/pliage (rendu "catalogue pro"), stricte sur tout le reste
//     (couleurs, matière, motifs, logos, défauts, forme, cadrage).
//   - toute autre famille → CLAUSE STRICTE : objet 100 % intact (inchangée).
const BG_INTEGRITY_CLAUSE = `Replace ONLY the background of this product photo. The product itself must remain strictly identical to the original: do not redraw, reshape, resize, recolor, clean, repair or beautify it. Preserve exactly its shape, contours, proportions, colors, material and texture, patterns, logos, text, stitching, and every existing defect, stain, scratch, mark or sign of wear. Keep the product in its original position, angle, scale and framing. Add a soft, natural, physically plausible contact shadow beneath the product so it sits believably on the new surface, avoiding any cut-out, floating or pasted look. Do not add any object, prop, text or watermark.`;

const BG_INTEGRITY_CLAUSE_CLOTHING = `Replace the background of this clothing photo and present the garment as prepared for sale. You MAY lightly soften pronounced storage or folding creases (sharp crease lines from being stored folded or crumpled) so the garment looks cared-for and neatly arranged, but always preserve the fabric's natural drape and normal micro-folds: never press it perfectly flat, never make it look ironed or shrink-wrapped. Apart from softening those storage creases, the garment must remain strictly identical to the original: do not reshape, resize, recolor, repair or embellish it; preserve exactly its colors, material and texture, all patterns, prints, logos, text and stitching, and every existing defect, stain, hole or sign of wear. Keep the garment in its original position, angle, scale and framing. Add a soft, natural, physically plausible contact shadow so it sits believably on the new surface, with no cut-out, floating or pasted look. Do not add any object, prop, text or watermark.`;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // ── Mesure du coût API (2026-07-28) ──────────────────────────────────────
  // Cette fonction était le seul appel payant NI facturé NI tracé : elle part
  // à chaque génération, y compris quand l'utilisateur ne publie pas ensuite,
  // et c'est l'action la plus fréquente du produit. Sans mesure, les rapports
  // 3/12/35 Pépites étaient fixés à l'aveugle.
  // L'accumulateur est déclaré ICI, dans le scope de la requête : les quatre
  // appels Claude et la retouche GPT Image vivent tous dans ce handler, donc
  // aucune variable de module (qui serait partagée entre requêtes concurrentes
  // dans le même isolat Deno et mélangerait les compteurs).
  const cost = {
    claude_in: 0, claude_out: 0, claude_calls: 0, images: 0, image_quality: "",
    // Usage OpenAI de la retouche (audit du 08/08) : le bloc `usage` de
    // /images/edits porte les tokens EXACTS — les constantes 0,01/0,04 $ par
    // image ignoraient l'entrée (image source + prompt). img_usage_n compte
    // les réponses qui portaient le bloc : coût « mesuré » seulement quand
    // TOUTES l'ont porté, sinon repli estimé et marqué comme tel.
    img_usage_n: 0, img_text_in: 0, img_image_in: 0, img_out: 0,
  };
  const trackClaude = (data: unknown) => {
    const u = (data as { usage?: { input_tokens?: number; output_tokens?: number } })?.usage;
    if (!u) return;
    cost.claude_in += u.input_tokens ?? 0;
    cost.claude_out += u.output_tokens ?? 0;
    cost.claude_calls += 1;
  };

  // Remboursement automatique du débit de génération (2026-08-05) : assigné
  // après le débit, appelable depuis le catch GLOBAL (déclaré avant le try
  // pour être dans son scope). Idempotent et best-effort, comme releaseAttempt
  // de lens-analysis : un échec de remboursement ne masque jamais l'erreur
  // d'origine — mais il se voit dans les logs.
  let refundGenerateFn: ((reason: string) => Promise<void>) | null = null;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const adminClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const { data: profile } = await adminClient
      .from("profiles")
      .select("is_premium, is_pro, is_comped, lang")
      .eq("id", user.id)
      .single();

    // Expression premium canonique (2026-07-25, cf. CLAUDE.md) : is_premium/is_pro
    // = source de vérité maintenue par les flux de paiement, is_comped = comptes
    // offerts. is_founder et les ids Apple/Google résiduels ne valent PLUS
    // statut premium — un abonnement résilié/expiré = free.
    const isPremium = profile?.is_premium === true
      || profile?.is_pro === true
      || profile?.is_comped === true;

    const body = await req.json();
    const { inventaire_id, photos, platforms } = body;
    // item_data: champs de l'article envoyés directement par le client quand aucune ligne
    // inventaire n'existe encore (switch "ajouter au stock" différé/désactivé) — évite de
    // dépendre d'une ligne DB qui n'est créée qu'à la publication, voire jamais.
    const item_data = body.item_data && typeof body.item_data === "object" ? body.item_data : null;
    // canonical_fields (2026-07-11, Sujet 4) : taille/couleur/matiere/marque
    // déjà connus du CLIENT (Lens taille_estimee, saisie utilisateur…) —
    // l'inventaire n'a pas ces colonnes, seul le client peut les fournir.
    // Quand une valeur est présente, elle est injectée dans itemContext comme
    // contrainte ET sert de source prioritaire à la canonicalisation
    // post-génération (voir après le Promise.all).
    const canonicalIn = body.canonical_fields && typeof body.canonical_fields === "object" ? body.canonical_fields : {};
    const canonicalProvided: Record<string, string> = {};
    // "etat" ajouté le 2026-07-28 (lot 1) : l'état LU par le Lens (etat_estime)
    // n'avait AUCUN chemin jusqu'ici — ni item_data ni la table inventaire ne le
    // portent (inventaire.statut vaut stock|vendu, c'est autre chose). Le
    // rédacteur le réinventait donc à chaque fois.
    // ⚠️ INERTE TANT QUE LE FRONT N'ENVOIE PAS LA CLÉ : ListingPreviewScreen ne
    // met encore que taille/couleur/matiere/marque dans canonical_fields. Le
    // serveur est prêt, le client suivra au déploiement Vercel.
    for (const k of ["taille", "couleur", "matiere", "marque", "etat"]) {
      const v = canonicalIn[k];
      if (typeof v === "string" && v.trim() && v.trim().toLowerCase() !== "null") canonicalProvided[k] = v.trim();
    }

    // ── Mode ciblé "resolve_genre" (2026-07-09) ───────────────────────────────
    // Relance UNIQUEMENT le champ genre avec une instruction stricte. Appelé
    // par ListingPreviewScreen à la publication quand la génération complète a
    // laissé genre vide/"Mixte" sur une catégorie qui exige un rayon genré :
    // le call complet n'est pas déterministe (même article → 4× "Homme" puis
    // 1× "Mixte", vérifié en DB le 2026-07-09) et la publication ne doit plus
    // jamais être bloquée pour ça. Pas de check pièces : micro-appel de
    // secours au sein d'un flux de publication déjà débité par
    // spend_coins_and_publish. Réponse : { genre: "Femme"|"Homme"|"Fille"|
    // "Garçon"|"Bébé"|null } — null si contexte vide ou IA indisponible, le
    // client applique alors son propre défaut.
    if (body.resolve_genre === true) {
      const it = item_data ?? {};
      const ctx = [
        it.marque && `Marque: ${it.marque}`,
        it.titre && `Article: ${it.titre}`,
        it.type && `Type: ${it.type}`,
        it.description && `Description: ${it.description}`,
      ].filter(Boolean).join("\n");
      if (!ctx) return json({ genre: null });
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 50,
            system: `Tu détermines le rayon (genre cible) d'un article pour un site de revente de mode. Réponds UNIQUEMENT du JSON valide: {"genre":"..."} avec une de ces valeurs EXACTES: Femme, Homme, Fille, Garçon, Bébé. JAMAIS Mixte, JAMAIS Enfant, JAMAIS null — tranche TOUJOURS sur le signal le plus probable, même faible (coupe, taille, style, couleurs, rayon habituel de la marque ou du modèle — ex: une Casio F-91W se vend rayon Homme). Article adulte ou indéterminé → Femme ou Homme. Article manifestement enfant → Fille, Garçon ou Bébé.`,
            messages: [{ role: "user", content: `Quel rayon pour cet article ?\n${ctx}` }],
          }),
        });
        if (res.ok) {
          const data = await res.json();
          trackClaude(data);
          const text: string = data.content?.[0]?.text ?? "";
          const m = text.match(/"genre"\s*:\s*"(Femme|Homme|Fille|Garçon|Bébé)"/);
          return json({ genre: m ? m[1] : null });
        }
        console.error("[generate-listing] resolve_genre:", await res.text());
      } catch (e) {
        console.error("[generate-listing] resolve_genre exception:", e);
      }
      return json({ genre: null });
    }

    // ── Mode ciblé "resolve_aspects" (2026-07-16, chantier champs obligatoires) ──
    // Micro-appel de secours, même philosophie que resolve_genre : quand la
    // preview B1 de ListingPreviewScreen identifie des aspects eBay
    // OBLIGATOIRES sans source app (audit Phase 0 : Nom de parfum, Volume,
    // Numéro de pièce fabricant, Hauteur/Largeur, Teinte…), on demande à
    // l'IA de les extraire du CONTEXTE — jamais deviner. Réponse :
    // { aspects: { "<nom exact>": "valeur" } } — les aspects non déductibles
    // sont ABSENTS/null, le fallback UI (Phase 3) prend le relais.
    // Entrée : body.aspects = [{ name, allowedValues?: string[] }] (≤ 12).
    if (body.resolve_aspects === true) {
      const it = item_data ?? {};
      const wanted = (Array.isArray(body.aspects) ? body.aspects : [])
        .filter((a: { name?: unknown }) => a && typeof a.name === "string")
        .slice(0, 12);
      // Défauts DÉTERMINISTES (Phase 1, 2026-07-16) : valeur standard eBay SÛRE
      // pour les obligatoires sans source, indépendante du contexte article.
      // Le front les pose déjà côté client (EBAY_ASPECT_DEFAULTS), mais le
      // contrat resolve_aspects ne doit pas EN dépendre : on les applique ici
      // aussi, avant l'IA, pour tout appelant. Trou n°1 = MPN (32 catégories).
      const ASPECT_DEFAULTS: Record<string, string> = {
        "Numéro de pièce fabricant": "Ne s'applique pas",
      };
      const out: Record<string, string> = {};
      for (const a of wanted) if (ASPECT_DEFAULTS[a.name]) out[a.name] = ASPECT_DEFAULTS[a.name];
      // On ne demande à l'IA que les aspects SANS défaut déterministe.
      const askAI = wanted.filter((a: { name: string }) => !ASPECT_DEFAULTS[a.name]);
      const ctx = [
        it.marque && `Marque: ${it.marque}`,
        it.titre && `Article: ${it.titre}`,
        it.modele && `Modèle: ${it.modele}`,
        it.matiere && `Matière: ${it.matiere}`,
        it.couleur && `Couleur: ${it.couleur}`,
        it.type && `Type: ${it.type}`,
        it.description && `Description: ${it.description}`,
        // attributs_visibles de lens-analysis (Phase 2) : valeurs LUES sur
        // l'article en photo (nom de parfum, volume, MPN, dimensions…) —
        // la source la plus fiable pour ces aspects. Absent tant que
        // lens-analysis n'est pas redéployée (gated).
        it.attributs && typeof it.attributs === "object" && Object.keys(it.attributs).length &&
          `Attributs lus sur l'article (photos): ${JSON.stringify(it.attributs)}`,
      ].filter(Boolean).join("\n");
      // Rien à extraire par l'IA (tout couvert par les défauts, ou pas de
      // contexte) : on renvoie directement les défauts déterministes.
      if (!wanted.length || !askAI.length || !ctx) return json({ aspects: out });
      const lines = askAI.map((a: { name: string; allowedValues?: string[] }) => {
        const allowed = Array.isArray(a.allowedValues) ? a.allowedValues.slice(0, 60) : [];
        return `- "${a.name}"${allowed.length ? ` — valeurs eBay (suggestions, saisie libre acceptée) : ${allowed.join(" | ")}` : " — texte libre"}`;
      }).join("\n");
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 400,
            system:
              `Tu extrais des caractéristiques produit eBay depuis le contexte d'une annonce d'occasion. RÈGLE ABSOLUE : ne JAMAIS inventer — une valeur doit être lisible ou strictement déductible du contexte, sinon null. Préfère une valeur de la liste eBay quand elle correspond. Cas particuliers : "Numéro de pièce fabricant" → "Ne s'applique pas" (valeur standard eBay pour un objet d'occasion sans référence fabricant visible dans le contexte) ; "Volume" → format eBay ("50 ml", jamais "50ml") ; dimensions (Hauteur/Largeur/Longueur/Dimensions) → UNIQUEMENT si des mesures chiffrées figurent dans le contexte, avec l'unité ("80 cm"). Retourne UNIQUEMENT du JSON valide: {"aspects":{"<nom exact de l'aspect>":"valeur ou null"}}`,
            messages: [{ role: "user", content: `Aspects à renseigner :\n${lines}\n\nContexte article :\n${ctx}` }],
          }),
        });
        if (res.ok) {
          const data = await res.json();
          trackClaude(data);
          const text: string = data.content?.[0]?.text ?? "";
          const m = text.match(/\{[\s\S]*\}/);
          if (m) {
            const parsed = JSON.parse(m[0]);
            const raw = parsed?.aspects && typeof parsed.aspects === "object" ? parsed.aspects : {};
            // Fusion dans `out` (déjà porteur des défauts déterministes) : l'IA
            // ne peut renseigner QUE les aspects demandés à l'IA (askAI) —
            // jamais écraser un défaut déterministe ni inventer une clé.
            const askNames = new Set(askAI.map((a: { name: string }) => a.name));
            for (const [k, v] of Object.entries(raw)) {
              if (!askNames.has(k)) continue; // hors demande IA
              const s = typeof v === "string" ? v.trim() : "";
              if (s && s.toLowerCase() !== "null") out[k] = s;
            }
            return json({ aspects: out });
          }
        } else {
          console.error("[generate-listing] resolve_aspects:", await res.text());
        }
      } catch (e) {
        console.error("[generate-listing] resolve_aspects exception:", e);
      }
      // Échec IA : on renvoie quand même les défauts déterministes déjà posés.
      return json({ aspects: out });
    }
    // photo_option: "ia_advanced" (retouche marquée, fond nettoyé), "ia_light" (correction rapide
    // luminosité/blancs uniquement), "original" (aucune retouche). Toute valeur absente, inconnue
    // ou legacy ("ia", "ia_multi", "ia_simple", …) retombe sur "original" : jamais de retouche
    // GPT Image payante par défaut — un ancien client obtient ses photos telles quelles.
    const rawPhotoOption = typeof body.photo_option === "string" ? body.photo_option : "";
    const photo_option = rawPhotoOption === "ia_advanced" || rawPhotoOption === "ia_light" ? rawPhotoOption : "original";
    // background: choix de fond, uniquement pris en compte en ia_advanced (voir
    // BACKGROUND_OPTIONS). Toute valeur absente/inconnue → "original" (aucun
    // remplacement de fond, comportement historique).
    const rawBackground = typeof body.background === "string" ? body.background : "";
    const background = Object.prototype.hasOwnProperty.call(BACKGROUND_OPTIONS, rawBackground) ? rawBackground : "original";
    // price may be pre-fetched client-side; used as fallback if prix_vente is null in DB
    const body_price = body.price != null ? Number(body.price) : null;

    if (
      (!inventaire_id && !item_data) ||
      !Array.isArray(photos) || photos.length === 0 ||
      !Array.isArray(platforms) || platforms.length === 0
    ) {
      return json({ error: "Missing required fields: inventaire_id or item_data, photos, platforms" }, 400);
    }

    // ── Génération PAYANTE : price_generate Pépites (6 depuis la grille du
    // 2026-08-08), débitées ICI, avant tout appel LLM ────────────────────────
    // (2026-08-05, remplace le plafond 15/60 par 24 h ET l'ancien pré-check
    // « le solde couvre-t-il la future publication » — la génération est un
    // poste à part entière : quelqu'un qui n'a que de quoi générer a le droit
    // de générer, la publication tranchera son propre prix à son propre clic.)
    // Tous tiers : Premium/Pro paient aussi, leurs grants sont là pour ça.
    // spend_coins_for_generate lit price_generate en config (jamais en dur),
    // fait le grant mensuel lazy, débite included d'abord — modèle
    // spend_coins_for_lens. Échec de génération → remboursement AUTOMATIQUE
    // (refundGenerateFn ci-dessous, kind 'refund_generate') : un débit qui
    // survivrait à un échec transformerait le geste en arnaque au premier bug.
    // (La garde « pricing_ack » du 05/08 au soir a été retirée le soir même,
    // décision Nico : Capgo va être réactivé, les fronts mobiles retrouveront
    // l'affichage du prix à la source — le débit reste inconditionnel.)
    {
      const { data: spend, error: spendErr } = await adminClient
        .rpc("spend_coins_for_generate", { p_user_id: user.id });
      if (spendErr) {
        console.error("[generate-listing] spend_coins_for_generate:", spendErr.message);
        return json({ error: "Internal server error" }, 500);
      }
      if (spend?.allowed === false) {
        if (spend.reason === "insufficient_coins") {
          return json({ error: "insufficient_coins", price: spend.price, balance: spend.balance }, 402);
        }
        // Plafond quotidien Pro (2026-08-08) : la génération offerte a retiré
        // le frein économique — la RPC compte (usage_logs generate_pro_free)
        // et refuse au-delà de coin_config.pro_generate_daily_cap. Le code
        // 'generation_limit' est VOULU : le front affiche déjà ce message
        // serveur tel quel (bandeau step 2), zéro changement client.
        if (spend.reason === "pro_daily_cap_reached") {
          return json({ error: "generation_limit", message: spend.message, cap: spend.cap, used: spend.used }, 429);
        }
        console.error("[generate-listing] débit refusé:", spend?.reason);
        return json({ error: "Internal server error" }, 500);
      }
      const paid: number = spend?.price ?? 0;
      let refunded = false;
      const uid = user.id;
      refundGenerateFn = async (reason: string) => {
        if (refunded || paid <= 0) return;
        refunded = true;
        const { error } = await adminClient.rpc("refund_coins", {
          p_user_id: uid,
          p_amount: paid,
          p_metadata: { source: reason },
          p_kind: "refund_generate",
        });
        if (error) console.error("[generate-listing] refund_coins:", error.message);
      };
    }

    let item: { titre?: string; marque?: string; description?: string; type?: string; statut?: string; prix_vente?: number | null };
    if (item_data) {
      item = item_data;
    } else {
      const { data, error: itemErr } = await adminClient
        .from("inventaire")
        .select("id, titre, marque, description, type, statut, prix_vente")
        .eq("id", inventaire_id)
        .single();
      if (itemErr || !data) {
        // Rien n'a été généré : la Pépite du clic est rendue.
        await refundGenerateFn?.("item_not_found");
        return json({ error: "Item not found" }, 404);
      }
      item = data;
    }

    const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
    const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY")!;
    const BUCKET = "listing-photos";

    // ── Re-hébergement des photos EXTERNES (2026-08-06, « Failed to fetch ») ──
    // Les articles importés du dressing (origine='vinted_sync') portent des
    // URLs images1.vinted.net écrites telles quelles par la sync
    // (background.js, frontière de propriété des photos). Le CDN Vinted ne
    // sert AUCUN en-tête CORS : le fetch() des content scripts (urlToFile)
    // échoue depuis les pages Leboncoin/Beebs/eBay en « Failed to fetch » —
    // et un content script MV3 reste soumis au CORS de la page hôte quoi
    // qu'autorise le manifeste. Le re-hébergement vit donc CÔTÉ SERVEUR (pas
    // de CORS ici), AVANT la création du job : mêmes gardes que
    // republish-capture-photos (hôtes Vinted FERMÉS — jamais un proxy
    // ouvert —, taille plafonnée, timeout, séquentiel). Un échec par photo ne
    // bloque pas la génération : l'URL d'origine est conservée, la
    // publication échouera avec le message actionnable des content scripts.
    // inventaire.photos est réaligné URL par URL (structure préservée —
    // strings nues de la sync ET objets {type,url} coexistent en base) : le
    // travail n'a lieu qu'UNE fois par article, et la frontière de propriété
    // de la sync (photosANous) protège ensuite ces URLs de tout écrasement.
    const estUrlCdnExterne = (u: unknown): u is string => {
      if (typeof u !== "string") return false;
      try {
        const url = new URL(u);
        return url.protocol === "https:" && /(^|\.)vinted\.(net|fr|com)$/i.test(url.hostname);
      } catch { return false; }
    };
    let photosSource = photos as string[];
    const externes = photosSource.filter(estUrlCdnExterne);
    if (externes.length) {
      const MAX_OCTETS_PAR_PHOTO = 10 * 1024 * 1024;
      const REHOST_TIMEOUT_MS = 15_000;
      const tsRehost = Date.now();
      const remplacements = new Map<string, string>();
      for (let i = 0; i < externes.length; i++) {
        const src = externes[i];
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), REHOST_TIMEOUT_MS);
        try {
          const resp = await fetch(src, { signal: ctl.signal });
          if (!resp.ok) { console.error(`[generate-listing] rehost photo ${i}: HTTP ${resp.status}`); continue; }
          const bytes = new Uint8Array(await resp.arrayBuffer());
          if (!bytes.byteLength || bytes.byteLength > MAX_OCTETS_PAR_PHOTO) {
            console.error(`[generate-listing] rehost photo ${i}: taille hors bornes (${bytes.byteLength} octets)`);
            continue;
          }
          const contentType = resp.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
          if (!contentType.startsWith("image/")) {
            console.error(`[generate-listing] rehost photo ${i}: pas une image (${contentType})`);
            continue;
          }
          const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
          // ts dans le chemin : une même URL re-tentée plus tard ne s'écrase pas.
          const path = `${user.id}/rehosted/${inventaire_id ?? "adhoc"}/${tsRehost}_${i}.${ext}`;
          const { error: upErr } = await adminClient.storage
            .from(BUCKET)
            .upload(path, bytes, { contentType, upsert: true });
          if (upErr) { console.error(`[generate-listing] rehost photo ${i}: upload — ${upErr.message}`); continue; }
          remplacements.set(src, adminClient.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
        } catch (e) {
          console.error(`[generate-listing] rehost photo ${i}:`, (e as Error)?.name === "AbortError" ? `timeout ${REHOST_TIMEOUT_MS / 1000}s` : e);
        } finally {
          clearTimeout(timer);
        }
      }
      if (remplacements.size) {
        photosSource = photosSource.map((u) => remplacements.get(u) ?? u);
        if (inventaire_id) {
          const { data: ligne } = await adminClient
            .from("inventaire")
            .select("photos")
            .eq("id", inventaire_id)
            .eq("user_id", user.id)
            .maybeSingle();
          if (Array.isArray(ligne?.photos)) {
            const majPhoto = (p: unknown) => {
              if (typeof p === "string") return remplacements.get(p) ?? p;
              if (p && typeof p === "object" && typeof (p as { url?: unknown }).url === "string") {
                const nv = remplacements.get((p as { url: string }).url);
                return nv ? { ...(p as object), url: nv } : p;
              }
              return p;
            };
            const nouvelles = (ligne.photos as unknown[]).map(majPhoto);
            if (JSON.stringify(nouvelles) !== JSON.stringify(ligne.photos)) {
              const { error: majErr } = await adminClient
                .from("inventaire")
                .update({ photos: nouvelles })
                .eq("id", inventaire_id)
                .eq("user_id", user.id);
              if (majErr) console.error(`[generate-listing] rehost: inventaire ${inventaire_id} non réaligné — ${majErr.message}`);
            }
          }
        }
      }
      console.log(`[generate-listing] rehost: ${remplacements.size}/${externes.length} photo(s) CDN re-hébergée(s) (inventaire ${inventaire_id ?? "absent"})`);
    }

    // ── category_icon (chantier 2026-07-20) ────────────────────────────────
    // EN PLUS des titres/descriptions : une classification directe de l'objet
    // principal parmi la liste FERMÉE des icônes du système (ALL_OBJECT_ICONS,
    // importée de shared.js — jamais une valeur inventée). But : au moment de
    // la génération, la catégorisation ne dépend plus UNIQUEMENT de
    // detectObjectIcon (regex mots-clés sur texte libre). Micro-appel ISOLÉ,
    // même philosophie que resolve_genre/resolve_aspects. Garanties :
    //   - valeur hors liste, absente, contexte vide ou IA en échec → null →
    //     le champ est OMIS de la réponse → le client retombe silencieusement
    //     sur detectObjectIcon (comportement actuel, zéro régression) ;
    //   - lancé MAINTENANT, attendu seulement à la fin (chevauche la retouche
    //     photo et les 4 appels de génération) → coût wall-clock ~nul ;
    //   - n'échoue jamais la génération : toute exception est avalée.
    // detectObjectIcon reste le filet de secours et n'est pas modifié.
    const ICON_SET = new Set<string>(ALL_OBJECT_ICONS as string[]);
    // Légende « emoji = sens » construite depuis la SOURCE DE VÉRITÉ (shared.js).
    // Sans elle, Haiku ne reçoit que des emojis nus et confond les proxys
    // contre-intuitifs (🧶 pelote = sweat/hoodie, pris pour 🧥 manteau ; bug
    // Patagonia 2026-07-21). Une icône sans entrée de légende retombe sur l'emoji
    // seul — jamais d'omission ni de crash.
    const ICON_MENU = (ALL_OBJECT_ICONS as string[])
      .map((ic) => {
        const label = (ICON_LEGEND as Record<string, string>)[ic];
        return label ? `${ic} = ${label}` : ic;
      })
      .join("\n");
    const classifyCategoryIcon = async (): Promise<string | null> => {
      const ctx = [
        item.marque && `Marque: ${item.marque}`,
        item.titre && `Article: ${item.titre}`,
        item.type && `Type: ${item.type}`,
        item.description && `Description: ${item.description}`,
      ].filter(Boolean).join("\n");
      if (!ctx) return null;
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 20,
            system: `Tu classes un article d'occasion en choisissant l'emoji qui représente le mieux son OBJET PRINCIPAL, STRICTEMENT parmi cette liste (aucune autre valeur n'est acceptée). Chaque emoji est suivi de son SENS — fie-toi au sens, pas à l'apparence de l'emoji :\n${ICON_MENU}\n\nRègles : choisis l'objet lui-même, pas un accessoire inclus ni la marque. Un sweat/pull/hoodie (même d'une marque outdoor comme Patagonia, The North Face…) est un vêtement en maille → 🧶, PAS un manteau 🧥. Réponds UNIQUEMENT du JSON valide {"icon":"<un emoji exact de la liste>"} ; si aucun ne convient clairement, {"icon":null}.`,
            messages: [{ role: "user", content: `Quel emoji pour cet article ?\n${ctx}` }],
          }),
        });
        if (res.ok) {
          const data = await res.json();
          trackClaude(data);
          const text: string = data.content?.[0]?.text ?? "";
          const m = text.match(/"icon"\s*:\s*"([^"]+)"/);
          const icon = m?.[1];
          if (icon && ICON_SET.has(icon)) return icon;
        } else {
          console.error("[generate-listing] category_icon:", await res.text());
        }
      } catch (e) {
        console.error("[generate-listing] category_icon exception:", e);
      }
      return null;
    };
    const categoryIconPromise = classifyCategoryIcon();

    // ── Step 1 & 2: Photo processing ──────────────────────────────────────────
    let processedPhotos: Array<{ type: string; url: string }>;

    if (photo_option === "original") {
      processedPhotos = photosSource.map((url, i) => ({
        type: i === 0 ? "original" : `photo_${i}`,
        url,
      }));
    } else {
      // GPT Image 2: retouch each photo. Two distinct tiers:
      // - ia_light: quality "low", prompt limited to brightness/white balance — fast, subtle
      // - ia_advanced (default): quality "medium", fuller prompt with background cleanup + contrast pop.
      //   "medium" et non "high" : high ne répond jamais avant la limite wall-clock des Edge
      //   Functions (~400s, vérifié le 2026-07-06) et retombait silencieusement sur la photo originale.
      const isLight = photo_option === "ia_light";
      // ia_advanced : prompt spécialisé selon la famille de produit (détectée
      // via detectObjectIcon sur titre/description/type — mêmes règles que
      // l'app). ia_light : prompt générique (luminosité/blancs seulement).
      const retouch = retouchProfileFor(item);
      // Fond : uniquement en ia_advanced, valeur connue et != original. Quand un
      // fond est appliqué, on n'envoie PAS l'intro famille — mais la clause
      // d'intégrité (VÊTEMENT pour la famille vetements, autorisant un léger
      // défroissage ; STRICTE sinon, objet 100 % intact) + le fond choisi.
      // Un SEUL appel image, comme avant.
      const bgSuffix = !isLight && background !== "original" ? BACKGROUND_OPTIONS[background] : null;
      let promptToUse: string;
      if (isLight) {
        promptToUse = OPENAI_IMG_PROMPT_LIGHT;
      } else if (bgSuffix) {
        const bgClause = retouch.family === "vetements" ? BG_INTEGRITY_CLAUSE_CLOTHING : BG_INTEGRITY_CLAUSE;
        promptToUse = `${bgClause} ${bgSuffix}`;
        console.log(`[gpt-image] fond appliqué: ${background} (famille ${retouch.family}, icône ${retouch.icon})`);
      } else {
        promptToUse = retouch.prompt;
        console.log(`[gpt-image] famille de retouche: ${retouch.family} (icône ${retouch.icon})`);
      }
      const qualityToUse = isLight ? "low" : "medium";
      const photosToProcess = photosSource;
      // ── Photos verrouillées (2026-08-05, option A validée par Nico) ────────
      // Article DÉJÀ retouché auquel on ajoute de nouvelles photos : le client
      // envoie locked_photos = les URLs déjà retouchées (et déjà payées). Ces
      // photos passent TELLES QUELLES — l'IA ne retraite que les nouvelles,
      // on ne refait jamais un travail payé. Elles ne consomment pas non plus
      // le budget de retouche : le plafond MAX_RETOUCHED s'applique aux photos
      // réellement envoyées à GPT Image, pas aux positions.
      const lockedSet = new Set<string>(
        Array.isArray(body.locked_photos)
          ? (body.locked_photos as unknown[]).filter((u): u is string => typeof u === "string")
          : [],
      );
      // Garde-fou coûts : 5 photos max passent en retouche GPT Image par annonce
      // (base du prix fixe par annonce du système de pièces) ; les photos au-delà
      // sont conservées telles quelles dans l'annonce.
      const MAX_RETOUCHED = 5;
      let retouchBudget = MAX_RETOUCHED;
      const shouldRetouch = photosToProcess.map((u) => {
        if (lockedSet.has(u)) return false;
        if (retouchBudget <= 0) return false;
        retouchBudget--;
        return true;
      });
      const ts = Date.now();
      // Télémétrie retouche (2026-08-08) : départ chrono et nombre de photos
      // réellement envoyées à GPT Image — la ligne usage_logs dédiée est posée
      // juste après processedPhotos.
      const retoucheDebutMs = Date.now();
      const photosEnvoyees = shouldRetouch.filter(Boolean).length;
      const results = await Promise.allSettled(
        photosToProcess.map(async (photoUrl, idx) => {
          if (!shouldRetouch[idx]) {
            return { type: idx === 0 ? "original" : `photo_${idx}`, url: photoUrl };
          }
          const srcRes = await fetch(photoUrl);
          if (!srcRes.ok) {
            console.error(`[gpt-image] fetch photo ${idx} failed: ${srcRes.status}`);
            return { type: idx === 0 ? "original" : `photo_${idx}`, url: photoUrl };
          }
          const srcBlob = await srcRes.blob();

          const form = new FormData();
          form.append("model", "gpt-image-2");
          form.append("prompt", promptToUse);
          form.append("n", "1");
          form.append("size", "1024x1024");
          form.append("quality", qualityToUse);
          form.append("image[]", srcBlob, "product.jpg");

          const res = await fetch("https://api.openai.com/v1/images/edits", {
            method: "POST",
            headers: { "Authorization": `Bearer ${OPENAI_KEY}` },
            body: form,
          });

          console.log(`[gpt-image] photo ${idx} (${photo_option}) status: ${res.status}`);

          if (!res.ok) {
            console.error(`[gpt-image] photo ${idx} error:`, await res.text());
            return { type: idx === 0 ? "original" : `photo_${idx}`, url: photoUrl };
          }

          const resData = await res.json();
          cost.images += 1;
          cost.image_quality = qualityToUse;
          // Tokens exacts facturés par OpenAI pour CETTE image. Si le détail
          // text/image manque, tout input_tokens part en "text" (tarif le
          // plus bas : on sous-estime plutôt que d'inventer).
          const imgUsage = (resData as {
            usage?: {
              input_tokens?: number; output_tokens?: number;
              input_tokens_details?: { text_tokens?: number; image_tokens?: number };
            };
          }).usage;
          if (imgUsage) {
            const imageIn = imgUsage.input_tokens_details?.image_tokens ?? 0;
            const textIn = imgUsage.input_tokens_details?.text_tokens
              ?? Math.max(0, (imgUsage.input_tokens ?? 0) - imageIn);
            cost.img_usage_n += 1;
            cost.img_text_in += textIn;
            cost.img_image_in += imageIn;
            cost.img_out += imgUsage.output_tokens ?? 0;
          }
          const b64 = resData.data?.[0]?.b64_json;
          if (!b64) {
            console.error(`[gpt-image] photo ${idx}: no b64_json in response`);
            return { type: idx === 0 ? "original" : `photo_${idx}`, url: photoUrl };
          }

          const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
          const outBlob = new Blob([bytes], { type: "image/png" });
          const path = `${user.id}/enhanced/${ts}_${idx}.png`;

          const { error: upErr } = await adminClient.storage
            .from(BUCKET)
            .upload(path, outBlob, { contentType: "image/png", upsert: true });

          if (upErr) {
            console.error(`[gpt-image] upload photo ${idx}:`, upErr);
            return { type: idx === 0 ? "original" : `photo_${idx}`, url: photoUrl };
          }

          const url = adminClient.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
          console.log(`[gpt-image] photo ${idx} OK → ${url}`);
          return { type: idx === 0 ? "original" : `enhanced_${idx}`, url };
        })
      );

      processedPhotos = results.map((r, i) =>
        r.status === "fulfilled"
          ? r.value
          : { type: i === 0 ? "original" : `photo_${i}`, url: photosToProcess[i] }
      );

      // ── Télémétrie retouche (2026-08-08) : ligne usage_logs DÉDIÉE ────────
      // Dernier poste facturé dont le prix de revient n'était mesuré nulle
      // part : le coût images était FONDU dans le cost_usd de la ligne
      // 'generate_listing'. Désormais : une ligne 'photo_retouche' par
      // retouche, même forme que 'lens' et 'generate_listing' (cost_usd dans
      // metadata) — les trois postes se comparent dans une même requête.
      // La ligne 'generate_listing' du même appel ne porte plus que le texte
      // (cf. plus bas), sinon toute somme par feature compterait double.
      // Livraison comptée sur l'URL /enhanced/<ts>_ de CE run : la photo 0
      // retouchée garde type 'original' (l'URL fait foi — piège connu), et
      // les locked_photos, déjà sous /enhanced/ d'un run passé, ne comptent
      // pas. Insert best-effort, comme les autres télémétries.
      const retoucheLivrees = processedPhotos.filter(p => p.url.includes(`/enhanced/${ts}_`)).length;
      // ── Coût RÉEL depuis le bloc usage d'OpenAI (audit du 08/08) ──────────
      // Tarifs gpt-image-2 standard, page pricing OpenAI relevée le 08/08 :
      // text input 5 $/MTok · image input 8 $/MTok · image output 30 $/MTok.
      // cost_source distingue un coût MESURÉ (toutes les réponses portaient
      // le bloc usage) d'un coût SUPPOSÉ (repli sur les constantes maison
      // 0,01/0,04 $ par image, qui ignorent l'entrée).
      const TARIF_GPT_IMAGE2 = { textInParMTok: 5, imageInParMTok: 8, outParMTok: 30 } as const;
      const usageComplet = cost.images > 0 && cost.img_usage_n === cost.images;
      const retoucheUsd = usageComplet
        ? (cost.img_text_in * TARIF_GPT_IMAGE2.textInParMTok
           + cost.img_image_in * TARIF_GPT_IMAGE2.imageInParMTok
           + cost.img_out * TARIF_GPT_IMAGE2.outParMTok) / 1_000_000
        : cost.images * (qualityToUse === "low" ? 0.01 : 0.04);
      adminClient.from("usage_logs").insert({
        user_id: user.id,
        feature: "photo_retouche",
        metadata: {
          level: photo_option,
          image_quality: qualityToUse,
          photos_total: photosToProcess.length,
          photos_envoyees: photosEnvoyees,
          photos_livrees: retoucheLivrees,
          photos_verrouillees: lockedSet.size,
          background: bgSuffix ? background : "original",
          delivered: retoucheLivrees > 0,
          duration_ms: Date.now() - retoucheDebutMs,
          // Tokens bruts TOUJOURS journalisés, même en repli : ils permettent
          // de recaler le coût a posteriori sur la facture OpenAI.
          openai_text_input_tokens: cost.img_text_in,
          openai_image_input_tokens: cost.img_image_in,
          openai_output_tokens: cost.img_out,
          openai_usage_manquants: cost.images - cost.img_usage_n,
          cost_source: usageComplet ? "usage_api" : "estimation_constantes",
          cost_usd: Number(retoucheUsd.toFixed(4)),
        },
      }).then(({ error }) => {
        if (error) console.error("[generate-listing] usage_logs (photo_retouche):", error.message);
      });
    }

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
    ].filter(Boolean).join("\n");

    console.log(`[generate-listing] rédaction prompt ${VERSION_PROMPT} — plateformes: ${(platforms as string[]).join(", ")}`);
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
              "x-api-key": ANTHROPIC_KEY,
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
                  console.warn(`[generate-listing] ${platform} hors gabarit (titre ${brutTitle.length}/${lim.titre}, desc ${brutDesc.length}/${lim.desc}) — tronqué, prompt ${VERSION_PROMPT}`);
                }
                platformListings[platform] = {
                  title: lim ? clampToWord(brutTitle, lim.titre) : brutTitle,
                  description: lim ? clampToWord(brutDesc, lim.desc) : brutDesc,
                  platform_fields: parsed.platform_fields ?? {},
                };
              } catch (parseErr) {
                console.error(`[generate-listing] JSON parse error ${platform}:`, parseErr);
              }
            }
          } else {
            console.error(`[generate-listing] claude ${platform}:`, await claudeRes.text());
          }
        } catch (e) {
          console.error(`[generate-listing] claude exception ${platform}:`, e);
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

    // category_icon : attendu ICI seulement (il chevauchait la retouche photo
    // et la génération). null → champ OMIS → fallback client detectObjectIcon.
    const category_icon = await categoryIconPromise;

    // ── Coût de l'appel (2026-07-28) ─────────────────────────────────────────
    // Tarifs Haiku 4.5 : 1 $/MTok in, 5 $/MTok out. GPT Image 2 /images/edits :
    // ~0,01 $ l'image en quality "low", ~0,04 $ en "medium" (l'option de
    // retouche choisie décide, cf. qualityToUse).
    // Tracé DANS usage_logs (feature 'generate_listing') et non dans
    // coin_ledger : aucune Pépite n'est débitée ici, c'est de la télémétrie de
    // coût, pas un mouvement de solde. Insert best-effort — une génération
    // réussie ne doit jamais échouer parce que la mesure n'a pas pu s'écrire.
    const claudeUsd = (cost.claude_in / 1e6) * 1 + (cost.claude_out / 1e6) * 5;
    const imageUsd = cost.images * (cost.image_quality === "low" ? 0.01 : 0.04);
    const totalUsd = claudeUsd + imageUsd;
    console.log(
      `[generate-listing][cost] user=${user.id} platforms=${platforms.length} option=${photo_option}`
      + ` claude=${cost.claude_calls} appels ${cost.claude_in}in/${cost.claude_out}out`
      + ` images=${cost.images}@${cost.image_quality || "-"}`
      + ` usd=${totalUsd.toFixed(4)} (claude ${claudeUsd.toFixed(4)} + image ${imageUsd.toFixed(4)})`
    );
    adminClient.from("usage_logs").insert({
      user_id: user.id,
      feature: "generate_listing",
      metadata: {
        platforms: platforms.length,
        photo_option,
        claude_calls: cost.claude_calls,
        claude_input_tokens: cost.claude_in,
        claude_output_tokens: cost.claude_out,
        images: cost.images,
        image_quality: cost.image_quality || null,
        // (2026-08-08) cost_usd = le TEXTE seulement. La part images vit dans
        // la ligne 'photo_retouche' du même appel — avant cette date, cette
        // ligne portait claude + images fondus (cost_scope absent = ancien
        // périmètre, à savoir pour les requêtes historiques).
        cost_usd: Number(claudeUsd.toFixed(4)),
        cost_scope: "texte",
      },
    }).then(({ error }) => {
      if (error) console.error("[generate-listing] usage_logs:", error.message);
    });

    // ── Livraison ou remboursement (2026-08-05) ──────────────────────────────
    // « Réponse vide ou inexploitable » = AUCUNE plateforme générée : le
    // client n'aurait rien à afficher (il vérifie data.platforms) — la Pépite
    // est rendue et l'erreur est franche. Une génération PARTIELLE (au moins
    // une plateforme sur les demandées) reste livrée et due : le stepper
    // permet de corriger/compléter plateforme par plateforme.
    const platformsDelivered = Object.values(platformListings ?? {}).filter(Boolean).length;
    if (platformsDelivered === 0) {
      await refundGenerateFn?.("empty_generation");
      return json({ error: "generation_failed" }, 500);
    }
    // Cas dégradé TOTAL : la fonction pose des titres de REPLI quand un appel
    // Claude échoue (design d'avant le paiement, conservé — mieux vaut un
    // squelette que rien). Mais zéro appel LLM abouti = le service payé (la
    // rédaction) n'a PAS été rendu : le squelette part quand même, la Pépite
    // est rendue. cost.claude_calls ne compte que les réponses ABOUTIES.
    if (cost.claude_calls === 0) {
      console.warn("[generate-listing] aucun appel LLM abouti — squelette livré, Pépite remboursée");
      await refundGenerateFn?.("no_llm_output");
    }

    // ── Return generated data (INSERT happens client-side in ListingPreviewScreen) ──
    return json({
      photos: processedPhotos,
      platforms: platformListings,
      price: item.prix_vente ?? body_price ?? null,
      ...(category_icon ? { category_icon } : {}),
    });

  } catch (e) {
    console.error("[generate-listing] unhandled:", e);
    // Génération jamais livrée (erreur LLM, timeout, exception quelconque) :
    // la Pépite du clic est rendue avant de répondre.
    await refundGenerateFn?.("unhandled_error");
    return json({ error: "Internal server error" }, 500);
  }
});
