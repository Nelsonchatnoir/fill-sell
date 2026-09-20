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

// ── DU CHAMP DE LA PLATEFORME À CELUI QU'ON CONNAÎT ───────────────────────
// Le catalogue parle la langue de la plateforme (`clothing_st`, `condition`,
// `color`) ; nos copies parlent la nôtre (`taille`, `etat`, `couleur`). Sans
// ce pont, on redemanderait une taille qu'on a déjà.
// Le pont a deux étages : les clés EXACTES connues, puis les SUFFIXES (les
// clés Leboncoin sont presque toutes `<famille>_<notion>` : clothing_color,
// home_appliance_brand, shoes_st…), ce qui couvre les rayons jamais relevés
// sans avoir à tenir une liste à jour.
const EXACTES = {
  condition: 'etat', etat: 'etat',
  size: 'taille', taille: 'taille', clothing_st: 'taille', shoe_size: 'taille',
  color: 'couleur', couleur: 'couleur', colour: 'couleur',
  brand: 'marque', marque: 'marque',
  material: 'matiere', matiere: 'matiere',
  clothing_type: 'univers', univers: 'univers',
  model: 'modele', modele: 'modele',
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
const CLE_BRUTE = /^[a-z0-9]+(_[a-z0-9]+)+$/;
export function questionPosable(ligne) {
  if (CONTENU_ANNONCE.test(String(ligne?.field_key ?? ''))) return false;
  const lib = String(ligne?.field_label ?? '').trim();
  if (!lib) return false;
  if (lib === ligne.field_key && CLE_BRUTE.test(lib)) return false;
  return true;
}

/** La valeur qu'on a déjà pour ce champ, ou "" — en cherchant aux deux
 *  endroits où elle peut vivre : la clé dédiée, puis le canal d'aspects. */
export function valeurConnue(ligne, pf, platform) {
  const notre = cleConnue(ligne.field_key);
  if (notre && String(pf?.[notre] ?? '').trim()) return String(pf[notre]).trim();
  const canal = pf?.[CANAL_ASPECTS[platform]];
  if (canal && typeof canal === 'object') {
    const v = canal[ligne.field_key] ?? canal[ligne.field_label];
    if (String(v ?? '').trim()) return String(v).trim();
  }
  return '';
}

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

/** Le tri : ce qu'on sait, ce qu'il faut demander, et ce qu'on laisse
 *  tranquille. Une seule passe, une seule règle. */
export function classerChamps(lignes, pf, platform) {
  const connus = [];
  const questions = [];
  const vus = new Set();
  for (const l of lignes ?? []) {
    // Dédoublonnage par NOTRE clé : le catalogue dit `clothing_st` et la
    // configuration dit `taille` — c'est la même taille, on ne l'affiche pas
    // deux fois. Le catalogue passe en premier, donc il gagne.
    const ident = cleConnue(l.field_key) ?? `brut:${l.field_key}`;
    if (vus.has(ident)) continue;
    vus.add(ident);
    const valeur = valeurConnue(l, pf, platform);
    const notre = cleConnue(l.field_key);
    const entree = {
      cle: l.field_key,
      cleNotre: notre,
      libelle: String(l.field_label ?? l.field_key),
      valeurs: Array.isArray(l.allowed_values) ? [...new Set(l.allowed_values.map(String))] : [],
      requis: l.required === true,
      valeur,
    };
    if (valeur) { connus.push(entree); continue; }
    // ⛔ LA RÈGLE : obligatoire ET inconnu ET posable. Rien d'autre.
    if (entree.requis && questionPosable(l)) questions.push(entree);
    // facultatif et inconnu → on ne l'affiche pas, on ne le demande pas,
    // et la publication part quand même. C'est voulu.
  }
  // Les questions d'abord dans l'ordre où la plateforme les pose (le
  // catalogue garde l'ordre du formulaire), les connus par libellé.
  connus.sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr'));
  return { questions, connus };
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
    return data ?? [];
  } catch { return []; }
}
