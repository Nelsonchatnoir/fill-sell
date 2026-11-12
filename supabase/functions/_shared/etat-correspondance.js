// ═══════════════════════════════════════════════════════════════════════════
// L'ÉTAT D'UN ARTICLE D'UNE GRILLE À L'AUTRE (15/10 soir, Louis — Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Cas : republication Leboncoin « Sac targus pour ordinateur portable »
// (150c7da9, 13/10 13:09) arrêtée sur « État » alors que l'annonce en ligne
// disait « État satisfaisant » et la fiche aussi : la grille du rayon
// (Électronique) nomme ce niveau « État satisfaisant - fonctionnel ».
// RÈGLE : l'état vient d'abord de l'annonce capturée, puis de la fiche, puis
// des autres plateformes de l'article, traduit dans la grille DEMANDÉE par une
// table de correspondance ; on ne demande que si aucune source ne se traduit.
// ⛔ Jamais une valeur inventée : un niveau qui n'existe pas dans la grille
//    (« Neuf » sans dire « avec / sans étiquette » face à une grille qui les
//    sépare) ne se devine pas — la source suivante, sinon la question.
//
// ── (12/11, lot « zéro problème », 1d-i — Nico) UN SEUL JUGE D'ÉTAT ─────────
// Compte cfdfda6f, 12/11 : « Scanner de code Munbyn », fiche « Neuf avec étiquette », rangé en Leboncoin Électronique
// (grille sans étiquette) — le serveur (get-pending-jobs) et l'extension (leboncoin.js) savaient traduire « État neuf »,
// chacun avec SA copie de la règle ; l'écran de publication n'en avait aucune et BLOQUAIT (12 min sur l'écran, rien de
// publié). CE MODULE EST LE JUGE, LE SEUL : l'écran (moteur/listes.js, jugerValeurContreListe), get-pending-jobs
// (etatLeboncoinExact) et l'extension (copie générée dans content-scripts/leboncoin.js par
// scripts/gen-etat-correspondance-extension.mjs — jamais réécrite à la main) appellent ces fonctions.
//   · L'IDENTIFIANT COMMUN est le NIVEAU : neuf_etiquette, neuf_sans_etiquette, neuf, tres_bon, bon, satisfaisant,
//     pieces. Une valeur se lit par son niveau ; chaque grille (par plateforme et par site/langue) se lit par le niveau de
//     chacun de ses libellés ; la valeur posée est le libellé EXACT de la grille.
//   · PAR SITE : les libellés de chaque site Vinted se lisent par leur identifiant Vinted (status_id, le même dans toutes
//     les langues — table copiée de _shared/vinted-pays.ts, ETATS_VINTED ; selftest:etat-grille-ecran compare).
//   · « Ouvert (jamais utilisé) » (état eBay « open box ») = TRÈS BON ÉTAT (décision de Nico du 12/11) — jamais un neuf.
//   · Un RAYON OÙ L'ÉTIQUETTE N'A PAS DE SENS (beauté : parfums, maquillage, soins — repéré par l'IDENTIFIANT du rayon
//     Vinted, ou la branche du catalogue Beebs qui n'a pas d'identifiants) : les trois neufs ne sont qu'un niveau, celui
//     de la grille (« sans étiquette » d'abord). Décision de Nico du 12/11 : un parfum « Neuf » ne redemande plus rien.
// Pur, sans import (Deno + Node + Vite + content script) : scripts/etat-grille-ecran-selftest.mjs.

const norm = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[–—]/g, '-').replace(/[,;()]/g, ' ').replace(/\s+/g, ' ').trim();

// Le niveau commun, depuis le libellé d'UNE plateforme (Vinted, Leboncoin,
// Beebs, eBay, Depop — libellés français et anglais de Depop).
// (12/11) Virgule et parenthèses ne sont pas une différence (« Neuf, avec étiquette » de Beebs) ; « État moyen » est le
// niveau satisfaisant de Beebs (ETAT_PAR_PLATEFORME, etat-plateformes.js) ; « Very good » / « Satisfactory » (Vinted en
// anglais) ; « Ouvert (jamais utilisé) » / « Open box » (eBay) = très bon état.
const NIVEAUX = [
  ['neuf_etiquette', /^(neuf avec etiquettes?|new with tags|brand new with tags)$/],
  ['neuf_sans_etiquette', /^(neuf sans etiquettes?|new without tags)$/],
  ['neuf', /^(etat neuf|neuf|brand new|new)$/],
  ['tres_bon', /^(tres bon etat|comme neuf|like new|used - excellent|excellent etat|excellent|very good|ouvert -? ?jamais utilise|open box)$/],
  ['bon', /^(bon etat|used - good|good)$/],
  ['satisfaisant', /^(etat satisfaisant( - fonctionnel)?|satisfaisant|etat correct|correct|used - fair|fair|etat d'usage|etat moyen|satisfactory)$/],
  ['pieces', /^(pour pieces( detachees)?|pour pieces ou non fonctionnel|for parts( or not working)?)$/],
];

// ── PAR SITE : Vinted, par identifiant d'état (status_id) ───────────────────
/** Le niveau commun de chaque état Vinted, par son identifiant (le même sur tous les sites Vinted). */
export const VINTED_NIVEAU_PAR_ID = Object.freeze({ 6: 'neuf_etiquette', 1: 'neuf_sans_etiquette', 2: 'tres_bon', 3: 'bon', 4: 'satisfaisant' });
// Copie des libellés de _shared/vinted-pays.ts (ETATS_VINTED) — selftest:etat-grille-ecran refuse le moindre écart avec
// src/utils/etatsVinted.js (lui-même comparé à vinted-pays.ts par selftest:etats-vinted-affiches).
const VINTED_LIBELLES_ETAT = {
  fr: { 6: 'Neuf avec étiquette', 1: 'Neuf sans étiquette', 2: 'Très bon état', 3: 'Bon état', 4: 'Satisfaisant' },
  it: { 6: 'Nuovo con cartellino', 1: 'Nuovo senza cartellino', 2: 'Ottime', 3: 'Buone', 4: 'Discrete' },
  en: { 6: 'New with tags', 1: 'New without tags', 2: 'Very good', 3: 'Good', 4: 'Satisfactory' },
  es: { 6: 'Nuevo con etiquetas', 1: 'Nuevo sin etiquetas', 2: 'Muy bueno', 3: 'Bueno', 4: 'Satisfactorio' },
  de: { 6: 'Neu, mit Etikett', 1: 'Neu', 2: 'Sehr gut', 3: 'Gut', 4: 'Zufriedenstellend' },
  nl: { 6: 'Nieuw met prijskaartje', 1: 'Nieuw zonder prijskaartje', 2: 'Heel goed', 3: 'Goed', 4: 'Veelgebruikt' },
  pt: { 6: 'Novo com etiquetas', 1: 'Novo sem etiquetas', 2: 'Muito bom', 3: 'Bom', 4: 'Satisfatório' },
  fi: { 6: 'Uusi, jossa hintalappu', 1: 'Uusi ilman hintalappua', 2: 'Erittäin hyvä', 3: 'Hyvä', 4: 'Tyydyttävä' },
  et: { 6: 'Uus koos hinnasildiga', 1: 'Uus ilma hinnasildita', 2: 'Väga hea', 3: 'Hea', 4: 'Rahuldav' },
  lv: { 6: 'Jauna prece ar etiķetēm', 1: 'Jauna prece bez etiķetēm', 2: 'Ļoti labs', 3: 'Labs', 4: 'Apmierinošs' },
  lt: { 6: 'Nauja su etiketėmis', 1: 'Nauja be etikečių', 2: 'Labai gera', 3: 'Gera', 4: 'Patenkinama' },
  sk: { 6: 'Nové s visačkou', 1: 'Nové bez visačky', 2: 'Veľmi dobré', 3: 'Dobré', 4: 'Uspokojivé' },
  sl: { 6: 'Novo z etiketo', 1: 'Novo brez etikete', 2: 'Zelo dobro', 3: 'Dobro', 4: 'Zadovoljivo' },
  hr: { 6: 'Novo s etiketama', 1: 'Novo bez etiketa', 2: 'Veoma dobro', 3: 'Dobro', 4: 'Zadovoljavajuće' },
  el: { 6: 'Νέο με ετικέτες', 1: 'Νέο χωρίς ετικέτες', 2: 'Πολύ καλό', 3: 'Καλό', 4: 'Ικανοποιητικό' },
};
const VINTED_NIVEAU_PAR_LIBELLE = new Map();
for (const libelles of Object.values(VINTED_LIBELLES_ETAT)) {
  for (const [id, texte] of Object.entries(libelles)) VINTED_NIVEAU_PAR_LIBELLE.set(norm(texte), VINTED_NIVEAU_PAR_ID[id]);
}

/**
 * Le niveau commun d'un libellé d'état, ou null.
 * `plateforme` : la plateforme dont le libellé vient. Les libellés de chaque site Vinted (toutes langues) se lisent sur
 * Vinted et pour une valeur d'origine inconnue (la fiche) ; un libellé d'un autre site (« Neu », Vinted DE) n'est jamais
 * lu ailleurs que là où il a ce sens.
 */
export function niveauEtat(valeur, { plateforme = null } = {}) {
  const v = norm(valeur);
  if (!v) return null;
  if ((plateforme == null || plateforme === 'vinted') && VINTED_NIVEAU_PAR_LIBELLE.has(v)) return VINTED_NIVEAU_PAR_LIBELLE.get(v);
  for (const [niveau, re] of NIVEAUX) if (re.test(v)) return niveau;
  return null;
}

// ── LES RAYONS OÙ L'ÉTIQUETTE N'A PAS DE SENS (12/11, décision de Nico) ─────
// Vinted, par IDENTIFIANT de rayon (src/utils/arbres/vintedFeuilles.js, le même sur tous les sites Vinted) : les
// cosmétiques de « Femmes > Beauté » et « Hommes > Soins » — parfums, maquillage, soins (visage, corps, mains, cheveux),
// manucure, coffrets, autres cosmétiques. Les ACCESSOIRES de beauté (brosses, trousses, rasoirs) n'y sont pas : un objet
// peut porter une étiquette.
const VINTED_RAYONS_SANS_ETIQUETTE = Object.freeze([
  '964', '152', '948', '1264', '960', '956', '1902', '153', // Femmes > Beauté : Maquillage, Parfums, Soins du visage, Soin mains, Manucure, Soins du corps, Soins cheveux, Autres cosmétiques
  '143', '140', '141', '142', '145', '144', '1863', '968', // Hommes > Soins : visage, cheveux, corps, mains et ongles, Parfums, Maquillage, Coffrets, Autres cosmétiques
]);
// Beebs n'a pas d'identifiant de rayon relevé (src/utils/arbres/beebsFeuilles.js) : la BRANCHE de son catalogue (Beebs
// n'existe qu'en France). Forme comparable (norm), jamais un mot du titre.
const BEEBS_BRANCHES_SANS_ETIQUETTE = Object.freeze([
  ['hygiene et beaute', 'parfums'], ['hygiene et beaute', 'cosmetiques'], ['hygiene et beaute', 'soins visage et corps'],
]);

/** Le rayon (identifiant Vinted, ou branche du catalogue Beebs) est-il un rayon où l'étiquette n'a pas de sens ? */
export function rayonSansEtiquette({ plateforme = null, rayonId = null, chemin = null } = {}) {
  if (plateforme === 'vinted') return rayonId != null && VINTED_RAYONS_SANS_ETIQUETTE.includes(String(rayonId).trim());
  if (plateforme === 'beebs') {
    const c = (Array.isArray(chemin) ? chemin : String(chemin ?? '').split('>')).map(norm).filter(Boolean);
    return BEEBS_BRANCHES_SANS_ETIQUETTE.some((b) => b.every((s, i) => c[i] === s));
  }
  return false;
}

const NEUFS = ['neuf_etiquette', 'neuf_sans_etiquette', 'neuf'];

/**
 * Le libellé EXACT de la grille pour ce niveau, ou null.
 * « Neuf avec / sans étiquette » → « État neuf » seulement si la grille ne
 * sépare pas les deux ; « État neuf » → jamais « avec / sans étiquette ».
 * (12/11) Les libellés de la grille se lisent par leur niveau (`plateforme` : celle de la grille) ; dans un rayon où
 * l'étiquette n'a pas de sens (`sansEtiquette`), les trois neufs sont un seul niveau : « sans étiquette » d'abord, puis
 * le neuf nu, puis le seul neuf d'une grille qui ne connaît que lui (Vinted beauté : « Neuf avec étiquette » seul).
 */
export function etatDansGrille(niveau, grille, { plateforme = null, sansEtiquette = false } = {}) {
  const liste = (Array.isArray(grille) ? grille : []).map((g) => String(g ?? '').trim()).filter(Boolean);
  if (!niveau || !liste.length) return null;
  const parNiveau = liste.map((g) => [g, niveauEtat(g, { plateforme })]);
  const de = (n) => parNiveau.find(([, x]) => x === n)?.[0] ?? null;
  if (sansEtiquette && NEUFS.includes(niveau)) {
    return de(niveau) ?? de('neuf_sans_etiquette') ?? de('neuf') ?? de('neuf_etiquette');
  }
  const direct = de(niveau);
  if (direct) return direct;
  if (niveau === 'neuf_etiquette' || niveau === 'neuf_sans_etiquette') {
    const separe = de('neuf_etiquette') || de('neuf_sans_etiquette');
    return separe ? null : de('neuf');
  }
  return null;
}

/**
 * LE JUGEMENT d'une valeur d'état contre une grille : le libellé EXACT de la grille, ou null (la question).
 * L'écriture exacte d'abord (même forme comparable), puis le niveau commun. Jamais un rapprochement par mots.
 * @param {string} valeur   l'état de la copie, de la fiche ou d'une autre plateforme (n'importe quelle langue connue)
 * @param {string[]} grille la liste de la plateforme (relevée, ou lue en direct sur le formulaire)
 * @param {{plateforme?: string|null, sansEtiquette?: boolean}} [opts]
 */
export function etatDansLaGrille(valeur, grille, opts = {}) {
  const liste = (Array.isArray(grille) ? grille : []).map((g) => String(g ?? '').trim()).filter(Boolean);
  const v = norm(valeur);
  if (!v || !liste.length) return null;
  const exacte = liste.find((g) => norm(g) === v);
  if (exacte) return exacte;
  return etatDansGrille(niveauEtat(valeur), liste, opts);
}

/**
 * sources : [{ source: 'annonce'|'fiche'|'autre_plateforme', valeur, plateforme? }] DANS L'ORDRE.
 * → { valeur, source, brut, niveau } pour la première source qui se traduit, sinon null.
 */
export function etatDepuisSources(sources, grille, opts = {}) {
  for (const s of sources ?? []) {
    const valeur = etatDansLaGrille(s?.valeur, grille, opts);
    if (valeur) return { valeur, source: s.source, brut: String(s.valeur), niveau: niveauEtat(s.valeur), plateforme: s.plateforme ?? null };
  }
  return null;
}

/** La question posée porte-t-elle sur l'ÉTAT ? (needsUserField) */
export function estQuestionEtat(f) {
  if (!f || typeof f !== 'object') return false;
  const k = String(f.field_key ?? '');
  const l = norm(f.field_label);
  return /(^|_)condition$/i.test(k) || k === 'etat' || l === 'etat' || l === "etat de l'article" || l === 'condition';
}

/** Les valeurs d'état lisibles dans les platform_fields d'un job (autre plateforme de l'article). */
export function etatsDuJob(pf) {
  const p = pf && typeof pf === 'object' ? pf : {};
  const out = [];
  const pousser = (v) => { if (typeof v === 'string' && v.trim()) out.push(v.trim()); };
  pousser(p.etat);
  for (const racine of ['lbcAspects', 'vintedAspects', 'beebsAspects', 'depopAspects', 'ebayAspects']) {
    const a = p[racine];
    if (a && typeof a === 'object') { pousser(a.condition); pousser(a.clothing_condition); pousser(a['État']); pousser(a.etat); }
  }
  pousser(p?.champs_lus_sur_l_annonce?.lus?.etat);
  return out;
}
