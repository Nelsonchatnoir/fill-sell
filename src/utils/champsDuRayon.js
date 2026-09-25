// ═══════════════════════════════════════════════════════════════════════════
// LES CHAMPS DÉCOULENT DU RAYON (2026-09-20, lot B)
// ═══════════════════════════════════════════════════════════════════════════
// AVANT : la carte affichait 6 à 10 champs écrits EN DUR, les mêmes pour tout
// le monde, filtrés par l'ICÔNE de l'article. Sur la robe Camaïeu, les NEUF
// champs Leboncoin portaient déjà la bonne valeur : neuf champs, zéro
// question, tout l'écran mangé. Et aucun champ propre au rayon n'apparaissait
// jamais — le `default: true` du filtre laissait tout passer et rien n'était
// spécifique.
//
// MAINTENANT : les champs viennent du RAYON, lus dans le catalogue relevé sur
// les vrais formulaires (`platform_category_aspects`, 1 683 lignes, 4
// plateformes). Le rayon change → les champs changent.
//
// ⛔ QUAND L'APP A LE DROIT DE DEMANDER — la règle de Nico, appliquée ici et
//    nulle part ailleurs :
//        on ne demande QUE si le champ est OBLIGATOIRE **ET** qu'on n'a pas
//        su le remplir.
//    · rempli (par l'article, l'IA, le relevé) → posé, AUCUNE question ;
//    · facultatif et inconnu → laissé vide, la publication part quand même ;
//    · obligatoire et inconnu → et seulement là, on demande.
//
// ⛔ CE QUI N'EST JAMAIS UNE QUESTION, même marqué obligatoire :
//    · le contenu de l'annonce (photo, titre, description, prix) — il est
//      demandé ailleurs, il n'a rien à faire dans une liste de champs ;
//    · un champ dont la plateforme n'a jamais donné de libellé lisible : on
//      ne pose pas une question intitulée « package_size ».
//    Ce sont les deux mêmes barrières que le trigger `garde_aspects_question_
//    posable` en base. On les remet ici pour que l'écran ne puisse pas poser
//    une question que la base refuserait — jamais l'inverse.

// (chantier du 24/09) Le jugement « valeur hors liste » est celui du moteur
// de publication, et de lui seul : la carte ne peut plus dire « À COMPLÉTER »
// là où l'écran Confirmer dit « Prête » (cas Primark, Beebs).
import { jugerValeurContreListe, horsListeBloque, rayonNeufSeulement, valeurUneLettre } from '../publication/moteur/listes.js';

// ── DU CHAMP DE LA PLATEFORME À CELUI QU'ON CONNAÎT ───────────────────────
// Le catalogue parle la langue de la plateforme (`clothing_st`, `condition`,
// `color`) ; nos copies parlent la nôtre (`taille`, `etat`, `couleur`). Sans
// ce pont, on redemanderait une taille qu'on a déjà.
// Le pont a deux étages : les clés EXACTES connues, puis les SUFFIXES (les
// clés Leboncoin sont presque toutes `<famille>_<notion>` : clothing_color,
// home_appliance_brand, shoes_st…), ce qui couvre les rayons jamais relevés
// sans avoir à tenir une liste à jour.
const EXACTES = {
  condition: 'etat', etat: 'etat', 'état': 'etat',
  size: 'taille', taille: 'taille', clothing_st: 'taille', shoe_size: 'taille',
  // Une pointure EST une taille chez nous : la liste de tailles porte les
  // pointures EU (cf. sizeShoeOptions). Sans cette entrée, Beebs redemandait
  // « Pointure » sur 7 rayons alors que la taille était déjà remplie.
  pointure: 'taille',
  color: 'couleur', couleur: 'couleur', colour: 'couleur',
  brand: 'marque', marque: 'marque',
  material: 'matiere', matiere: 'matiere', 'matière': 'matiere',
  clothing_type: 'univers', univers: 'univers',
  model: 'modele', modele: 'modele', 'modèle': 'modele',
  isbn: 'isbn',
};
const SUFFIXES = [
  ['_condition', 'etat'], ['_color', 'couleur'], ['_colour', 'couleur'],
  ['_brand', 'marque'], ['_material', 'matiere'], ['_size', 'taille'], ['_st', 'taille'],
];
/** Le canal d'aspects génériques de chaque plateforme — c'est là que vivent
 *  les champs qui n'ont pas de clé dédiée chez nous, et c'est là que
 *  l'extension va les chercher. */
export const CANAL_ASPECTS = {
  vinted: 'vintedAspects', leboncoin: 'lbcAspects',
  beebs: 'beebsAspects', opla: 'oplaAspects', ebay: 'ebayAspects',
};

export function cleConnue(fieldKey) {
  const k = String(fieldKey ?? '').toLowerCase();
  if (EXACTES[k]) return EXACTES[k];
  for (const [suf, notre] of SUFFIXES) if (k.endsWith(suf)) return notre;
  return null;
}

// ── LES DEUX BARRIÈRES « QUESTION POSABLE » ──────────────────────────────
const CONTENU_ANNONCE = /^(photo|photos|image|images|picture|pictures|media|title|titre|description|price|prix)$/i;
// ⛔ LE RAYON N'EST PAS UN CHAMP DU RAYON. Opla porte dans son catalogue un
//    champ `category` intitulé « Catégorie », obligatoire, sur 129 de ses
//    rayons : c'est le rayon lui-même. Le demander en plus, c'est reposer le
//    faux champ « Catégorie » qu'on vient justement de retirer — et poser
//    deux fois la même question sur le même écran. Il se choisit dans le
//    bloc RAYON, et nulle part ailleurs.
const CEST_LE_RAYON = /^(category|categorie|catégorie|categories|rayon)$/i;
const CLE_BRUTE = /^[a-z0-9]+(_[a-z0-9]+)*$/;
export function questionPosable(ligne) {
  const cle = String(ligne?.field_key ?? '');
  if (CONTENU_ANNONCE.test(cle)) return false;
  if (CEST_LE_RAYON.test(cle) || CEST_LE_RAYON.test(String(ligne?.field_label ?? '').trim())) return false;
  const lib = String(ligne?.field_label ?? '').trim();
  if (!lib) return false;
  // Libellé jamais traduit : la clé technique brute. `_` n'est plus exigé —
  // « unisex » et « measurements » sont aussi des noms de machine, et on ne
  // pose pas une question intitulée « measurements ».
  if (lib === cle && CLE_BRUTE.test(lib)) return false;
  return true;
}

/** La valeur qu'on a déjà pour ce champ, ou "" — en cherchant aux deux
 *  endroits où elle peut vivre : la clé dédiée, puis le canal d'aspects. */
export function valeurConnue(ligne, pf, platform, cleResolue = undefined) {
  // ⛔ LA CLÉ RÉSOLUE PRIME, et c'est le nerf de l'affaire : `format_colis`
  //    et `age` sont NOS clés mais ne figurent pas dans le pont (rien ne les
  //    renomme), donc les re-deviner ici rendait null et on redemandait un
  //    format de colis déjà rempli sur 112 rayons Beebs. L'appelant sait —
  //    il l'a résolue par la clé OU par le libellé — on l'écoute.
  const notre = cleResolue !== undefined ? cleResolue : cleConnue(ligne.field_key);
  // (25/09) Une valeur d'UNE lettre n'est pas une réponse — sauf pour une
  // taille (« S », « M », « 9 ») : l'insert la retire (sanitizeJobFields,
  // suspect_values), le job partirait donc SANS elle. Jocabroc : « S » en
  // Marque, affiché « Déjà rempli », puis refus Vinted. La question reste.
  const retenue = (v) => {
    const t = String(v ?? '').trim();
    if (!t) return '';
    if (valeurUneLettre(t) && !CLE_TAILLE_RE.test(`${notre ?? ''} ${ligne.field_key ?? ''} ${ligne.field_label ?? ''}`)) return '';
    return t;
  };
  if (notre && retenue(pf?.[notre])) return retenue(pf[notre]);
  const canal = pf?.[CANAL_ASPECTS[platform]];
  if (canal && typeof canal === 'object') {
    const v = canal[ligne.field_key] ?? canal[ligne.field_label];
    if (retenue(v)) return retenue(v);
  }
  return '';
}
// Même exclusion que sanitizeJobFields (SIZE_LIKE_KEY_RE) : une taille, une
// pointure ou un âge d'une lettre est légitime.
const CLE_TAILLE_RE = /taille|size|pointure|age|âge/i;

/** ── POURQUOI LE CATALOGUE NE SUFFIT PAS (ENCORE) ────────────────────────
 *  Il couvre les rayons RELEVÉS : 85 catégories Vinted sur 2 489 feuilles, 30
 *  Leboncoin, 114 Beebs, 526 Opla. Pour un rayon jamais visité, il ne dit
 *  RIEN — et n'afficher que lui ferait disparaître l'état, la taille ou la
 *  marque d'un article parfaitement ordinaire.
 *  On complète donc avec les champs que l'extension consomme de toute façon
 *  (l'ancienne configuration), MAIS sans leur donner d'autorité : le
 *  catalogue dit ce qui est OBLIGATOIRE, la configuration ne fait qu'ajouter
 *  des champs qu'on saura afficher s'ils portent déjà une valeur. Un champ
 *  local vide et non réclamé par le rayon n'est donc jamais montré — c'est
 *  exactement la règle « facultatif et inconnu → on laisse vide ».
 *  ⛔ La configuration reste par ailleurs le plan de mergeFieldsWithLens :
 *     on ne la retire pas, sous peine de JETER des valeurs à la génération.
 *  ⛔ Le contenu de l'annonce n'y entre jamais : titre, description et prix
 *     sont demandés ailleurs, et `categorie` est le type interne — celui-là
 *     même qui s'affichait comme un faux champ « Catégorie = Autre ». */
const JAMAIS_UN_CHAMP_DE_PLATEFORME = new Set(['categorie', 'titre', 'title', 'description', 'prix', 'price']);

export function lignesDepuisConfigLocale(configLocale) {
  const sortie = [];
  for (const f of configLocale ?? []) {
    if (JAMAIS_UN_CHAMP_DE_PLATEFORME.has(f.key)) continue;
    sortie.push({
      field_key: f.key,
      field_label: f.label ?? f.key,
      required: false,          // seul le catalogue décide de l'obligation
      allowed_values: Array.isArray(f.options) ? f.options.map((o) => o.value ?? o) : null,
      _locale: true,
    });
  }
  return sortie;
}

/** ── LE BRUIT : UNE VALEUR PAR DÉFAUT, ET PAS DE QUESTION ────────────────
 *  Règle de Nico, nommément : « Chargeur inclus », « Référence fabricant »,
 *  « Année de fabrication » ne méritent pas qu'on arrête quelqu'un. Ils
 *  prennent une valeur par défaut et ne sont jamais demandés.
 *  ⛔ LE DÉFAUT DOIT ÊTRE HONNÊTE, donc TOUJOURS le plus prudent : « Non »
 *     pour un chargeur qu'on n'a peut-être pas. On ne promet rien à la place
 *     du vendeur. Là où aucun défaut ne peut être honnête (une année de
 *     fabrication ne s'invente pas), on ne pose rien du tout : le champ n'est
 *     ni demandé ni rempli, et la publication part — c'est déjà la règle des
 *     facultatifs.
 *  Reconnu par le LIBELLÉ : la clé change d'une plateforme à l'autre
 *  (`laptop_charger_included` chez Vinted, autre chose ailleurs). */
const BRUIT = [
  { motif: /^chargeur\s+inclus$/i, defaut: (vals) => vals.find((v) => /^non$/i.test(v)) ?? null },
  { motif: /^r[ée]f[ée]rence\s+fabricant$/i, defaut: () => null },
  { motif: /^ann[ée]e\s+de\s+fabrication$/i, defaut: () => null },
];
export function estDuBruit(libelle) {
  const l = String(libelle ?? '').trim();
  return BRUIT.find((b) => b.motif.test(l)) ?? null;
}

/** ── DÉDOUBLONNER PAR LE LIBELLÉ QUAND LA CLÉ NE SUFFIT PAS ──────────────
 *  Trouvé en testant en vrai, sur la robe passée au rayon Chaussures :
 *  « Univers » s'affichait DEUX fois — une fois en question (le catalogue
 *  Leboncoin l'appelle `shoes_type` sur ce rayon-là, une clé qu'on ne
 *  connaît pas) et une fois en « déjà rempli » (notre clé `univers`, avec
 *  « Femme » dedans). On demandait donc une valeur qu'on avait sous les yeux.
 *  Le pont par la clé ne pouvait pas le voir : `clothing_type` sur Vêtements,
 *  `shoes_type` sur Chaussures, `home_appliance_type` ailleurs — et ce
 *  dernier n'est PAS un univers, donc on ne peut pas mapper `_type` en bloc.
 *  Le LIBELLÉ, lui, est le même des deux côtés : « Univers ». C'est donc lui
 *  qui fait foi en second recours. */
const identifiant = (l) => cleConnue(l.field_key) ?? `lib:${texteSimple(l.field_label ?? l.field_key)}`;
/** Comparaison de LIBELLÉS : sans casse, sans accents, sans ponctuation —
 *  et sans les petits mots de liaison. « Format du colis » (catalogue Beebs)
 *  et « Format colis » (le nôtre) sont le MÊME champ ; sans ce nettoyage,
 *  Beebs redemandait le format du colis sur 112 rayons. */
const LIAISONS = /\b(de|du|des|d|le|la|les|l|a|au|aux|en|the|of)\b/g;
export function texteSimple(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, ' ').replace(LIAISONS, ' ').replace(/[^a-z0-9]+/g, '');
}

/** Le tri : ce qu'on sait, ce qu'il faut demander, et ce qu'on laisse
 *  tranquille. Une seule passe, une seule règle. */
export function classerChamps(lignes, pf, platform, { regle = 'classique', cheminCategorie = null } = {}) {
  const connus = [];
  const questions = [];
  const defauts = [];
  // Ce que la carte dit EN PLUS des questions (24/09) : aujourd'hui, un rayon
  // Vinted qui n'accepte que du neuf face à un article porté → changer de rayon.
  const limites = [];
  const vus = new Set();
  // Notre clé pour un libellé donné, prise dans les lignes de la
  // configuration locale : c'est elle qui sait que « Univers » vit dans
  // `univers`, quel que soit le nom que la plateforme lui donne ce jour-là.
  const cleParLibelle = new Map();
  // ⛔ ET LES VALEURS, PAS SEULEMENT LES CLÉS (trouvé à l'écran, 20/09).
  //    Le catalogue relève « Format du colis » sur 112 rayons Beebs, mais
  //    SANS ses valeurs sur certains : le champ tombait alors en saisie
  //    LIBRE, une boîte vide où il faut deviner le libellé exact de Beebs.
  //    Un champ obligatoire en texte libre sur une liste fermée est un champ
  //    bloqué, juste avec une autre tête. Notre configuration, elle, porte
  //    les six formats : on les lui prête.
  const valeursParLibelle = new Map();
  for (const l of lignes ?? []) {
    // Une ligne de la configuration LOCALE porte notre clé par définition :
    // on l'enregistre telle quelle. Sans ça, « Espace de stockage » (notre
    // clé `stockage`, absente du pont) ne se reliait à rien et Vinted
    // redemandait un espace de stockage déjà renseigné.
    const notre = l._locale ? l.field_key : cleConnue(l.field_key);
    const lib = texteSimple(l.field_label ?? l.field_key);
    if (notre) cleParLibelle.set(lib, notre);
    if (Array.isArray(l.allowed_values) && l.allowed_values.length && !valeursParLibelle.has(lib)) {
      valeursParLibelle.set(lib, l.allowed_values.map(String));
    }
  }
  for (const l of lignes ?? []) {
    // Dédoublonnage : le catalogue dit `clothing_st` et la configuration dit
    // `taille` — c'est la même taille, on ne l'affiche pas deux fois. Le
    // catalogue passe en premier, donc il gagne.
    // NOTRE clé d'abord — par la clé de la plateforme si on la connaît,
    // sinon par le LIBELLÉ. C'est elle qui sert AUSSI d'identité : sans ça,
    // `shoes_type/Univers` et `univers/Univers` passaient pour deux champs.
    const notre = cleConnue(l.field_key) ?? cleParLibelle.get(texteSimple(l.field_label ?? l.field_key)) ?? null;
    const ident = notre ?? identifiant(l);
    if (vus.has(ident)) continue;
    vus.add(ident);
    const valeur = valeurConnue(l, pf, platform, notre);
    const entree = {
      cle: l.field_key,
      cleNotre: notre,
      libelle: String(l.field_label ?? l.field_key),
      valeurs: Array.isArray(l.allowed_values) && l.allowed_values.length
        ? [...new Set(l.allowed_values.map(String))]
        // Le rayon ne connaît pas les valeurs de ce champ : on emprunte
        // celles qu on a sous le même libellé, plutôt que de laisser une
        // liste fermée se transformer en boîte à texte libre.
        : [...new Set(valeursParLibelle.get(texteSimple(l.field_label ?? l.field_key)) ?? [])],
      requis: l.required === true,
      valeur,
    };
    // ── UNE VALEUR HORS DE LA GRILLE DU RAYON N'EST PAS UNE RÉPONSE ───────
    // Trouvé en publiant pour de vrai : jogging enfant passé au rayon
    // « Pantalons et jeans (garçon) », la taille restait « XS / 34 » — une
    // taille FEMME. Beebs a refusé : « Beebs exige des champs encore vides
    // pour cette catégorie : Taille ». Le champ s'affichait pourtant comme
    // « déjà rempli », donc rien ne prévenait.
    // Changer de rayon change les grilles ; une valeur qui n'existe pas dans
    // la nouvelle grille est une valeur MANQUANTE, et on la redemande.
    // ⛔ Seulement quand le rayon donne VRAIMENT sa liste (valeurs relevées
    //    sur CETTE ligne, pas empruntées) et que le champ est obligatoire :
    //    un relevé incomplet ne doit pas inventer des questions.
    const grille = Array.isArray(l.allowed_values) && l.allowed_values.length
      ? l.allowed_values.map((v) => texteSimple(v)) : null;
    let horsGrille = Boolean(valeur && grille && entree.requis && !grille.includes(texteSimple(valeur)));
    // ── LA MÊME RÈGLE QUE LE MOTEUR (chantier du 24/09, nouveau stepper) ──
    // Le 20/09 cette carte disait « n'existe pas dans ce rayon » sur toute
    // valeur absente de la grille — y compris « Petit colis », que beebs.js
    // traduit lui-même en palier, et « Primark », absente d'un relevé de
    // marques tronqué à 200 alors que Beebs la connaît. Pendant ce temps le
    // moteur ne bloquait sur AUCUNE de ces valeurs : deux vérités à l'écran.
    // Désormais la carte demande exactement ce que le moteur retient : une
    // valeur hors d'une liste QUI FAIT FOI, sans rapprochement sûr (cf.
    // publication/moteur/listes.js). L'ancien stepper garde l'ancien geste.
    // ── RAYON « NEUF SEULEMENT » (24/09) : la carte dit de changer de rayon
    // (casque de solene.mantero). Jamais d'exclusion de la plateforme d'office.
    // (25/09, Nico) Et la question « État » n'est PLUS posée à côté : sa seule
    // réponse (« Neuf ») serait un mensonge sur un article d'occasion. La
    // question, c'est le rayon — ou Vinted ne part pas, message à l'appui.
    // (La détection était morte jusqu'au 25/09 : regex cassée dans listes.js.)
    if (rayonNeufSeulement({ platform, key: l.field_key, value: valeur, allowedValues: l.allowed_values })) {
      limites.push({ ...entree, motif: 'rayon_neuf' });
      continue;
    }
    if (horsGrille && regle === 'nouvelle') {
      const verdict = jugerValeurContreListe({ platform, key: l.field_key, value: valeur, allowedValues: l.allowed_values, cheminCategorie });
      horsGrille = !verdict.dans && horsListeBloque({
        regle, platform, key: l.field_key, inputType: l.input_type, allowedValues: l.allowed_values, suggested: verdict.suggested,
      });
    }
    if (horsGrille) { questions.push({ ...entree, horsGrille: true }); continue; }
    if (valeur) { connus.push(entree); continue; }
    // Le bruit : jamais une question. Un défaut prudent s'il en existe un
    // d'honnête, sinon rien — dans les deux cas la publication part.
    const bruit = estDuBruit(entree.libelle);
    if (bruit) {
      const d = bruit.defaut(entree.valeurs);
      if (d) defauts.push({ ...entree, valeur: d });
      continue;
    }
    // ⛔ LA RÈGLE : obligatoire ET inconnu ET posable. Rien d'autre.
    if (entree.requis && questionPosable(l)) questions.push(entree);
    // facultatif et inconnu → on ne l'affiche pas, on ne le demande pas,
    // et la publication part quand même. C'est voulu.
  }
  // Les questions d'abord dans l'ordre où la plateforme les pose (le
  // catalogue garde l'ordre du formulaire), les connus par libellé.
  connus.sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr'));
  return { questions, connus, defauts, limites };
}

/** Lecture du catalogue pour UN rayon. Paginée (PostgREST tronque à 1000 sans
 *  prévenir) et silencieuse en cas d'échec : un catalogue injoignable ne doit
 *  jamais empêcher de publier — on retombe sur « rien à demander ». */
export async function lireChampsDuRayon(supabase, platform, categoryKey) {
  if (!supabase || !platform || !categoryKey) return [];
  try {
    const { data, error } = await supabase
      .from('platform_category_aspects')
      .select('field_key, field_label, required, allowed_values, input_type')
      .eq('platform', platform)
      .eq('category_key', categoryKey)
      .order('field_key')
      .range(0, 199);
    if (error) return [];
    // Opla range ses listes en objets { code, title } : la carte parle en
    // titres (chantier du 24/09 — le serveur retraduit en code au départ).
    return (data ?? []).map((l) => (Array.isArray(l.allowed_values)
      ? { ...l, allowed_values: l.allowed_values.map((v) => (v && typeof v === 'object') ? String(v.title ?? v.code ?? '').trim() : String(v).trim()).filter(Boolean) }
      : l));
  } catch { return []; }
}
