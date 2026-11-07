// ═══════════════════════════════════════════════════════════════════════════
// « À RÉGLER » : RETIRER UNE LIGNE DE LA LISTE, SANS RIEN TOUCHER D'AUTRE (07/11/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Nico, 07/11 : la personne doit pouvoir retirer ELLE-MÊME toute ligne « À régler », quels que soient la plateforme
// et le motif, en un geste clair. Une ligne retirée ne revient pas toute seule, sauf FAIT NOUVEAU (nouvel échec sur
// une nouvelle tentative, autre numéro, autre erreur). Cas : compte d'Ornella, tâche Beebs 68427585 (refusée à la
// vérification, numéro 34232802) dont l'article était vendu sous une autre fiche — la fenêtre n'offrait que « Change
// d'abord le texte… » (désactivé) et « Fermer » ; l'abandon refuse une tâche qui porte un numéro.
//
// Deux mémoires, une seule règle : « retirée tant que rien de nouveau n'arrive ».
//   1. Ligne d'une TÂCHE (échec, à compléter, refus de plateforme) : la marque vit SUR la tâche,
//      platform_fields.retire_de_a_regler = { le, par: 'utilisateur', job, statut, numero, erreur, relances } — l'état
//      vu au geste (erreur = empreinte courte du texte). causeARegler (erreursVisibles) n'y voit plus rien à régler
//      TANT QUE cet état est le même ; autre statut, autre numéro, autre erreur, une relance de plus : elle revient.
//      Une tâche plus récente sur la ligne (nouvelle tentative) ne porte pas la marque : elle revient d'elle-même.
//      `job` (l'identifiant) : une marque recopiée sur une autre tâche (copie, recréation) ne vaut rien.
//      ⛔ Jamais arret_utilisateur (c'est un arrêt de republication, il change l'état de la carte).
//   2. Ligne qui n'est PAS une tâche (article vendu encore en ligne, retraits, marque retirée, ventes annulées,
//      comptes Leboncoin / Depop, annonces à vérifier, « Déjà vendu ? », prix d'achat, brouillons, boutique non
//      surveillée) : profiles.platform_settings.a_regler_retires[cle] = { le, n, e, avant?, h } — la SIGNATURE de
//      ses éléments (tâches, articles, questions… avec leur statut). Retirée tant que CHAQUE élément d'aujourd'hui
//      était déjà là au geste : un élément qui se règle ne la fait pas revenir, un élément NOUVEAU (ou qui change
//      de statut) oui. Écrite par platform_settings_fusionner SEULEMENT (CLAUDE.md), bornée : 200 lignes au plus,
//      purge au-delà de 90 jours (une entrée plus vieille ne vaut plus rien, même avant la purge).
//
// ⛔ Ce module n'écrit rien et ne lit rien : il dit QUOI écrire et SI une ligne est retirée. Retirer une ligne
//    n'annule ni ne retire aucune annonce, n'arrête aucun retrait en cours, ne supprime aucune donnée de l'article.
// Preuve : scripts/a-regler-retirer-selftest.mjs.

export const CLE_RETRAIT_TACHE = 'retire_de_a_regler';
export const CLE_REGLAGE_RETRAITS = 'a_regler_retires';
export const RETRAITS_LIGNES_MAX = 200;
export const RETRAITS_LIGNES_JOURS = 90;
/** Au-delà, les éléments les plus anciens ne sont plus nommés un par un : une date les couvre (`avant`). */
export const ELEMENTS_MAX = 300;
const LARGEUR = 6; // une empreinte d'élément = 6 caractères base 36 (30 bits)
const JOUR_MS = 86_400_000;

const tsDe = (v) => {
  const t = v instanceof Date ? v.getTime() : typeof v === 'number' ? v : Date.parse(v ?? '');
  return Number.isFinite(t) ? t : null;
};
const pfDe = (j) => (j?.platform_fields && typeof j.platform_fields === 'object' && !Array.isArray(j.platform_fields) ? j.platform_fields : {});
const isoDe = (d) => (d instanceof Date ? d : new Date(tsDe(d) ?? Date.now())).toISOString();

// FNV-1a 32 bits : court, stable, sans dépendance — jamais une preuve, seulement « même chose qu'au geste ? ».
function fnv1a(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** L'empreinte courte d'un texte d'erreur (espaces et casse ignorés) ; null sans texte. */
export function empreinteTexte(texte) {
  const t = String(texte ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
  return t ? fnv1a(t).toString(36) : null;
}

// ── 1. LA LIGNE D'UNE TÂCHE ─────────────────────────────────────────────────

const numeroDe = (j) => String(j?.platform_listing_id ?? '').trim() || String(j?.listing_url ?? '').trim() || null;
const relancesDe = (j) => Number(pfDe(j).relances_manuelles) || 0;

/** Peut-on retirer cette tâche de « À régler » ? Une publication ou une republication ARRÊTÉE (échec, attente d'un
 *  geste) — jamais un retrait (sa ligne est celle de l'article vendu), jamais une tâche en vol. Rend {ok, motif?}. */
export function retraitTachePossible(job) {
  if (!job || job.id == null) return { ok: false, motif: 'job_absent' };
  const action = String(job.action ?? 'publish');
  if (action !== 'publish' && action !== 'republish') return { ok: false, motif: 'pas_une_publication' };
  if (job.status !== 'failed' && job.status !== 'needs_user') return { ok: false, motif: 'pas_arrete' };
  return { ok: true };
}

/** La marque posée au geste : l'état de la tâche RELUE juste avant d'écrire. */
export function marqueRetraitTache(job, maintenant = new Date()) {
  return {
    le: isoDe(maintenant),
    par: 'utilisateur',
    job: job?.id != null ? String(job.id) : null,
    statut: job?.status ?? null,
    numero: numeroDe(job),
    erreur: empreinteTexte(job?.error),
    relances: relancesDe(job),
  };
}

/** Le platform_fields à écrire : celui RELU, complété de la marque — jamais écrasé à l'aveugle. */
export function champsApresRetraitTache(jobRelu, maintenant = new Date()) {
  return { ...pfDe(jobRelu), [CLE_RETRAIT_TACHE]: marqueRetraitTache(jobRelu, maintenant) };
}

/** Le platform_fields sans la marque (relance : la tâche repart, elle redevient visible si elle bloque encore). */
export function sansRetraitTache(platformFields) {
  const pf = { ...(platformFields && typeof platformFields === 'object' && !Array.isArray(platformFields) ? platformFields : {}) };
  delete pf[CLE_RETRAIT_TACHE];
  return pf;
}

/**
 * La tâche a-t-elle été retirée de « À régler » par la personne, et RIEN n'a changé depuis ? Même tâche, même
 * statut, même numéro, même empreinte d'erreur, même nombre de relances. Le numéro et l'erreur ne se comparent que
 * si la ligne lue porte ces colonnes (la pastille de l'onglet, App, ne lit ni le numéro ni le lien).
 */
export function tacheRetireeDeARegler(job) {
  const m = pfDe(job)[CLE_RETRAIT_TACHE];
  if (!m || typeof m !== 'object' || m.par !== 'utilisateur') return false;
  if (m.job != null && (job?.id == null || String(m.job) !== String(job.id))) return false;
  if ((m.statut ?? null) !== (job?.status ?? null)) return false;
  if (job && ('platform_listing_id' in job || 'listing_url' in job) && (m.numero ?? null) !== numeroDe(job)) return false;
  if (job && 'error' in job && (m.erreur ?? null) !== empreinteTexte(job.error)) return false;
  if ((Number(m.relances) || 0) !== relancesDe(job)) return false;
  return true;
}

// ── 2. LES LIGNES QUI NE SONT PAS UNE TÂCHE ─────────────────────────────────

/** Un élément de signature : une chaîne, ou { cle, ts } (ts = sa date de naissance, pour la borne). */
export function elementJob(j, ...precisions) {
  return { cle: ['j', j?.id ?? '', j?.status ?? '', ...precisions.map((p) => p ?? '')].join(':'), ts: tsDe(j?.created_at) };
}

function normaliser(elements) {
  const vus = new Map();
  for (const x of Array.isArray(elements) ? elements : []) {
    const cle = typeof x === 'string' ? x : (x && x.cle != null ? String(x.cle) : null);
    if (!cle) continue;
    const ts = typeof x === 'string' ? null : tsDe(x.ts);
    const deja = vus.get(cle);
    vus.set(cle, { cle, ts: deja ? (deja.ts == null || ts == null ? null : Math.max(deja.ts, ts)) : ts });
  }
  return [...vus.values()];
}

const CACHE = new Map();
function hacher(cle) {
  let h = CACHE.get(cle);
  if (h === undefined) {
    if (CACHE.size > 20_000) CACHE.clear();
    h = (fnv1a(cle) & 0x3fffffff).toString(36).padStart(LARGEUR, '0');
    CACHE.set(cle, h);
  }
  return h;
}
const empreinteEnsemble = (els) => fnv1a(els.map((x) => x.cle).sort().join('\n')).toString(36);

/**
 * La signature d'une ligne : n (nombre d'éléments), e (leurs empreintes, accolées, triées), h (l'ensemble exact) et,
 * au-delà de ELEMENTS_MAX éléments, `avant` : les plus anciens ne sont plus nommés, leur date les couvre (un élément
 * sans date n'est jamais couvert par une date — il est gardé parmi les nommés en priorité).
 */
export function signatureLigne(elements) {
  const els = normaliser(elements);
  const rang = (x) => (x.ts == null ? Number.POSITIVE_INFINITY : x.ts);
  const tries = els.slice().sort((a, b) => (rang(a) === rang(b) ? (a.cle < b.cle ? -1 : a.cle > b.cle ? 1 : 0) : rang(a) > rang(b) ? -1 : 1));
  const nommes = tries.slice(0, ELEMENTS_MAX);
  const laisses = tries.slice(ELEMENTS_MAX);
  const sig = { n: els.length, e: nommes.map((x) => hacher(x.cle)).sort().join(''), h: empreinteEnsemble(els) };
  if (laisses.length && laisses.every((x) => x.ts != null)) sig.avant = new Date(Math.max(...laisses.map((x) => x.ts))).toISOString();
  return sig;
}

/** Une clé de ligne utilisable par platform_settings_fusionner (jamais vide, jamais de virgule). */
export function cleLigneValide(cle) {
  const c = String(cle ?? '');
  return c.length > 0 && c.length <= 200 && !c.includes(',');
}

/** L'entrée mémorisée d'une ligne, si elle vaut encore (90 jours au plus). */
function entreeVivante(reglage, cle, maintenant) {
  if (!reglage || typeof reglage !== 'object' || Array.isArray(reglage) || !cleLigneValide(cle)) return null;
  const r = reglage[cle];
  if (!r || typeof r !== 'object') return null;
  const le = tsDe(r.le);
  if (le == null || (tsDe(maintenant) ?? Date.now()) - le > RETRAITS_LIGNES_JOURS * JOUR_MS) return null;
  return r;
}

/** Une entrée existe-t-elle pour cette ligne (encore valable) ? — le chemin rapide : sans elle, rien à calculer. */
export function aUneEntree(reglage, cle, maintenant = Date.now()) {
  return entreeVivante(reglage, cle, maintenant) != null;
}

/**
 * La ligne est-elle retirée ? Oui si l'entrée est vivante ET que chaque élément d'aujourd'hui était déjà là au
 * geste (son empreinte est connue, ou sa date est couverte par `avant`) — ou si l'ensemble est exactement le même.
 * Un élément nouveau (autre tâche, autre statut, autre article) : non, elle revient.
 */
export function ligneRetiree(reglage, cle, elements, maintenant = Date.now()) {
  const r = entreeVivante(reglage, cle, maintenant);
  if (!r) return false;
  const els = normaliser(elements);
  if (!els.length) return false;
  const e = typeof r.e === 'string' ? r.e : '';
  const connus = new Set();
  for (let i = 0; i + LARGEUR <= e.length; i += LARGEUR) connus.add(e.slice(i, i + LARGEUR));
  const avant = tsDe(r.avant);
  if (els.every((x) => connus.has(hacher(x.cle)) || (avant != null && x.ts != null && x.ts <= avant))) return true;
  return typeof r.h === 'string' && r.h === empreinteEnsemble(els);
}

/**
 * Ce qu'il faut envoyer à platform_settings_fusionner pour retirer une ligne : { chemin, patch, supprimer }.
 * La purge suit : les entrées de plus de 90 jours, et au-delà des 200 plus récentes (la nouvelle comprise).
 * null si la clé ou les éléments ne permettent pas d'écrire.
 */
export function patchRetraitLigne(reglage, cle, elements, maintenant = new Date()) {
  if (!cleLigneValide(cle)) return null;
  const els = normaliser(elements);
  if (!els.length) return null;
  const now = tsDe(maintenant) ?? Date.now();
  const supprimer = [];
  const vivantes = [];
  const source = reglage && typeof reglage === 'object' && !Array.isArray(reglage) ? reglage : {};
  for (const [k, v] of Object.entries(source)) {
    if (k === cle || !cleLigneValide(k)) continue;
    const le = tsDe(v?.le);
    if (le == null || now - le > RETRAITS_LIGNES_JOURS * JOUR_MS) supprimer.push(k);
    else vivantes.push([k, le]);
  }
  vivantes.sort((a, b) => b[1] - a[1]);
  for (const [k] of vivantes.slice(RETRAITS_LIGNES_MAX - 1)) supprimer.push(k);
  return {
    chemin: [CLE_REGLAGE_RETRAITS],
    patch: { [cle]: { le: new Date(now).toISOString(), ...signatureLigne(els) } },
    supprimer,
  };
}

/** Remettre des lignes dans la liste : les clés à supprimer (et elles seules). */
export function patchRemettreLignes(cles) {
  const supprimer = [...new Set((Array.isArray(cles) ? cles : []).filter(cleLigneValide).map(String))];
  return supprimer.length ? { chemin: [CLE_REGLAGE_RETRAITS], patch: null, supprimer } : null;
}

// ── LES MOTS ────────────────────────────────────────────────────────────────

/**
 * La phrase dite AVANT de retirer une ligne qui n'est pas une tâche : ce que le geste fait, et ce qu'il ne fait pas.
 *   groupe : 'vendus' | 'retraits' | 'non_surveillee' | autre ; aRetirer : une annonce attend l'accord de la personne.
 */
export function phraseRetraitLigne(groupe, lang = 'fr', { aRetirer = false } = {}) {
  const fr = lang !== 'en';
  const base = fr
    ? "Rien n'est supprimé ni annulé : tes articles, leurs annonces et tes plateformes ne bougent pas. La ligne ne revient que si quelque chose de nouveau arrive."
    : 'Nothing is deleted or cancelled: your items, their listings and your platforms stay as they are. The line only comes back if something new happens.';
  if (groupe === 'vendus' || groupe === 'retraits') {
    const suite = fr
      ? `Seul le rappel part : les retraits déjà demandés continuent.${aRetirer ? " Une annonce qui attend ton accord pour être retirée reste en ligne : risque de double vente." : ''}`
      : `Only the reminder goes: removals already requested carry on.${aRetirer ? ' A listing waiting for your go-ahead to be removed stays live: risk of selling twice.' : ''}`;
    return `${suite} ${base}`;
  }
  if (groupe === 'non_surveillee') {
    return fr
      ? `Seul le rappel part : la boutique reste non surveillée, une vente là-bas ne retirera pas tes autres annonces. ${base}`
      : `Only the reminder goes: the shop stays unwatched, a sale there won't remove your other listings. ${base}`;
  }
  return base;
}

/** La phrase dite avant de retirer la ligne d'une tâche (fenêtre d'échec, mini-éditeur). */
export function phraseRetraitTache(platformLabel, lang = 'fr', { numero = false } = {}) {
  const fr = lang !== 'en';
  return fr
    ? `Seule cette ligne sort de « À régler ». Rien n'est supprimé ni annulé : ton article et ses autres plateformes ne bougent pas${numero ? `, et rien n'est retiré chez ${platformLabel}` : ''}. Tu pourras toujours le publier sur ${platformLabel} plus tard. La ligne revient seulement si quelque chose de nouveau arrive (nouvel essai, autre erreur).`
    : `Only this line leaves “To fix”. Nothing is deleted or cancelled: your item and its other platforms stay as they are${numero ? `, and nothing is removed on ${platformLabel}` : ''}. You can still list it on ${platformLabel} later. The line only comes back if something new happens (a new attempt, another error).`;
}

export const LIBELLES_RETRAIT = Object.freeze({
  fr: { ligne: 'Retirer de la liste', tache: 'Retirer de la liste « À régler »', oui: 'Oui, retirer', non: 'Non, garder' },
  en: { ligne: 'Remove from the list', tache: 'Remove from the “To fix” list', oui: 'Yes, remove', non: 'No, keep it' },
});
