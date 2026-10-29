// ═══════════════════════════════════════════════════════════════════════════
// REDÉPÔT INTERROMPU : UNE ANNONCE EST PEUT-ÊTRE DÉJÀ PARTIE (2026-09-25)
// ═══════════════════════════════════════════════════════════════════════════
// Les Petites Fioles, f554a951 (🎅 calendrier, Leboncoin PRO) : annonce
// retirée à 07:48Z, recréation arrêtée à 09:34:49Z sur
// /deposer-une-annonce/options (fill_step « depot », fenêtre minimisée) et
// rendue « pending » par la reprise ordinaire → redéposée à 09:42Z. Leboncoin
// avait gardé LES DEUX : 3276284130 (le dépôt « interrompu ») et 3276289397.
// Toutes deux désactivées le soir même.
// Le filet existant (verifier_doublon_avant_publication) avait deux trous :
//   · il n'était posé que sur un retour needs_user/failed — celui-ci était
//     « pending » ;
//   · la vérification de l'extension ne lit que les annonces « En ligne » par
//     titre : une annonce en vérification lui échappe.
//
// LA RÈGLE (Nico, 25/09) : après un essai de recréation qui a PU envoyer le
// dépôt, on ne redépose plus sans avoir relu les annonces du compte. Une
// annonce apparue depuis le retrait est rattachée AUTOMATIQUEMENT seulement si
// un identifiant issu du dépôt la désigne. Titre, prix, photo et date ne
// prouvent jamais l'exemplaire (règle Nico du 28/09). Sinon : needs_user avec
// le lien de l'annonce déjà partie. Jamais de redépôt en double.
//
// Ce module ne fait que JUGER, sur des données passées en paramètre (pur,
// sans I/O, Deno + Node) ; get-pending-jobs lit, écrit et sert.

import { trancherParPhotos } from "./annonce-partagee.js";

// Étapes du remplissage Leboncoin à partir desquelles le dépôt a pu partir
// (relayerEtape de leboncoin.js), et pages qui prouvent qu'il est parti.
const ETAPES_ENVOI = new Set(["depot", "options"]);
const URL_ENVOI_RE = {
  leboncoin: /\/deposer-une-annonce\/(?:options|confirmation)(?:[/?#]|$)/,
  // Beebs ne relaie pas d'étape : seule la page produit (/fr/p/<id>) dit
  // qu'un dépôt a abouti.
  beebs: /beebs\.app\/[a-z]{2}\/p\/\d+/,
};

const ms = (v) => { const t = Date.parse(String(v ?? "")); return Number.isFinite(t) ? t : null; };

/**
 * Le dernier essai de recréation qui a PU envoyer le dépôt, depuis le retrait.
 * Rend { at, raison } (at = ISO) ou null. null aussi quand une vérification a
 * déjà eu lieu APRÈS cet essai (`recreation_verifiee.apres`).
 */
export function depotPeutEtrePartiDepuis(platform, pf) {
  if (!pf || typeof pf !== "object") return null;
  if (pf.republish_step !== "deleted") return null;
  const retrait = ms(pf.deleted_at);
  if (retrait == null) return null;
  const urlRe = URL_ENVOI_RE[platform];
  if (!urlRe) return null;
  let dernier = null;
  const wws = pf.work_window_state && typeof pf.work_window_state === "object" ? pf.work_window_state : {};
  const fins = [...(Array.isArray(wws.fins) ? wws.fins : []), ...(wws.at_end ? [wws.at_end] : [])];
  for (const f of fins) {
    const t = ms(f?.at);
    if (t == null || t <= retrait) continue;
    const etape = String(f?.fill_step ?? "");
    const url = String(f?.tab_url ?? "");
    const suspect = (platform === "leboncoin" && ETAPES_ENVOI.has(etape)) || urlRe.test(url);
    if (suspect && (!dernier || t > dernier.t)) {
      dernier = { t, raison: `essai terminé à l'étape « ${etape || "?"} » sur ${url || "?"}` };
    }
  }
  // Un essai COMMENCÉ après le retrait sans aucune fin relevée depuis : le
  // service worker est mort en route, et la reprise « stale » de l'extension
  // (recoverStaleProcessingJobs) l'a remis en file sans rien écrire. On ne
  // sait pas où il s'est arrêté — donc on ne sait pas si le dépôt est parti.
  const debut = ms(wws.at_start?.at);
  if (debut != null && debut > retrait && !fins.some((f) => { const t = ms(f?.at); return t != null && t >= debut; })) {
    if (!dernier || debut > dernier.t) dernier = { t: debut, raison: "essai commencé après le retrait, sans fin relevée" };
  }
  // Un essai coupé en route (ordinateur muet) : handler-watch pose ce
  // marqueur, faute de savoir où il s'est arrêté.
  const m = pf.recreation_depot_parti && typeof pf.recreation_depot_parti === "object" ? pf.recreation_depot_parti : null;
  const tm = ms(m?.at);
  if (tm != null && tm > retrait && (!dernier || tm > dernier.t)) {
    dernier = { t: tm, raison: String(m.raison ?? "essai interrompu sans fin connue") };
  }
  if (!dernier) return null;
  const verifie = ms(pf.recreation_verifiee?.apres);
  if (verifie != null && verifie >= dernier.t) return null;
  return { at: new Date(dernier.t).toISOString(), raison: dernier.raison };
}

// ── UN DÉPÔT LEBONCOIN INACHEVÉ N'EST PAS UNE ANNONCE EN LIGNE (29/10, louis 68e39f7c) ──────────────────────
// Leboncoin CRÉE l'annonce à l'adsubmit (201) mais ne la met en ligne qu'une fois l'option (gratuite ou
// payante) choisie sur /deposer-une-annonce/options — prouvé le 13/09 (dossier Joséphine : 12 dépôts arrêtés
// sur /options, 12 « désactivées », 0 en ligne ; cf. leboncoin.js « /options SANS L'OPTION GRATUITE »).
// louis, « Rangement Noir et Vert Pomme » (29/10) : l'essai de 09:22 s'arrête SUR /options (« Leboncoin a
// refusé l'accès à la page à l'instant ») ; l'annonce 3297429776 apparaît dans « Mes annonces » au statut
// Leboncoin « inactive » (relevé : « inconnu »), sans date de mise en ligne ; sa page publique répond 410
// « Cette annonce est désactivée ». La garde la tenait pour une copie peut-être en ligne → question, et la
// remise en ligne restait gelée. Une candidate qui (1) n'a jamais été vue en ligne (statut relevé ni
// « en_ligne » ni « en_verification »), (2) n'a aucune date de mise en ligne (publiee_le vide), (3) est apparue
// pendant un essai de CE job arrêté sur /options, sans aucune confirmation ensuite, n'est pas en ligne et ne le
// sera jamais : elle ne retient pas le redépôt. Une annonce en vérification chez Leboncoin vient d'un essai qui
// a passé /options (option choisie, confirmation) : jamais visée. Pur.
const URL_OPTIONS_LBC_RE = /\/deposer-une-annonce\/options(?:[/?#]|$)/;
const URL_CONFIRMATION_LBC_RE = /\/deposer-une-annonce\/confirmation(?:[/?#]|$)/;
const MARGE_ESSAI_OPTIONS_MS = 30 * 60_000;

/** Les fins d'essai de ce job relevées sur /options (après `depuisMs`), sans confirmation ensuite. */
export function essaisArretesSurOptionsLbc(pf, depuisMs = NaN) {
  const wws = pf?.work_window_state && typeof pf.work_window_state === "object" ? pf.work_window_state : {};
  const fins = [...(Array.isArray(wws.fins) ? wws.fins : []), ...(wws.at_end ? [wws.at_end] : [])]
    .map((f) => ({ t: ms(f?.at), url: String(f?.tab_url ?? "") }))
    .filter((f) => f.t != null && !(Number.isFinite(depuisMs) && f.t <= depuisMs));
  const confirmations = fins.filter((f) => URL_CONFIRMATION_LBC_RE.test(f.url)).map((f) => f.t);
  // at_end répète souvent la dernière fin : une heure, un arrêt.
  return [...new Set(fins.filter((f) => URL_OPTIONS_LBC_RE.test(f.url) && !confirmations.some((c) => c >= f.t)).map((f) => f.t))];
}

/** La candidate est-elle le dépôt inachevé d'un essai arrêté sur /options (jamais en ligne) ? */
export function depotInacheveLbc(platform, pf, c, { depuis = NaN } = {}) {
  if (String(platform ?? "") !== "leboncoin" || !c) return false;
  if (/^(en_ligne|en_verification|vendue)$/.test(String(c.statut_plateforme ?? ""))) return false;
  if (String(c.publiee_le ?? "").trim()) return false;
  const vue = ms(c.created_at);
  if (vue == null) return false;
  const arrets = essaisArretesSurOptionsLbc(pf, depuis);
  return arrets.some((t) => vue >= t - MARGE_ESSAI_OPTIONS_MS);
}

/** Titre comparable : sans emoji, sans accents, sans ponctuation, minuscules. */
export function titreComparable(s) {
  return String(s ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const idNum = (s) => (/^\d+$/.test(String(s ?? "")) ? BigInt(String(s)) : null);

// ── UNE ANNONCE D'UNE AUTRE FICHE N'EST PAS CETTE COPIE (29/10, tiblancdeshaut c9fe1ee1, point 4.2 du lot B) ────────
// Beebs, « Sweat GAP » (c9fe1ee1, fiche 1792587088278), retiré le 27/10 à 14:02 (Paris) : la question du 28/10 à 08:17
// citait 34245064 (« Sac à main Michael Kors », job 9a096169, fiche 1792586354104, dépôt confirmé le 27/10 à 03:41) et
// 34246760 (« Pantalon de ski Quicksilver », job c002a882, fiche 1792586859815, confirmé le 27/10 à 13:03) : deux
// dépôts d'AUTRES fiches, faits AVANT le retrait. « Apparue depuis le retrait » se lit sur la première vue d'un RELEVÉ
// (aucun entre le 26/10 12:21 et le 28/10 08:15), et une ligne n'était écartée que si son job_id désignait une autre
// fiche. Même défaut Leboncoin le 08/10 (« Service à thé » 1660ea94 : 3284198810 « Sculpture bronze » et 3284198745
// « Lampe Concord », deux autres fiches).
// LA RÈGLE : une annonce que désigne une AUTRE fiche du compte — numéro d'un de ses jobs (platform_listing_id,
// new_platform_listing_id, preuve_identifiant_beebs.id, lbc_depot.adsubmit.id), job proposé par le relevé
// (proposition.job_id) ou fiche rattachée (inventaire_id) — est ÉCARTÉE des candidates. Jamais RATTACHÉE sur cette
// base, jamais sur le titre. Le moindre signe de la MÊME fiche la garde candidate (le doute reste la question, jamais
// un redépôt). Un job sans fiche ne compte pas ; un lien retrouvé par le titre (listing_url_recovery) n'est pas un
// numéro (annonce-partagee.js) ; sans fiche connue pour le job jugé, rien n'est écarté.
// LIMITE (relue en base le 29/10) : le 28/10 à 08:17, 9a096169 et c002a882 ne portaient encore AUCUN numéro (dépôts
// « ordre non prouvé », numéros posés le 29/10 à 18:27 par la séquence) ; à Leboncoin, les jobs des deux annonces sont
// nés du relevé 24 s APRÈS la question. Ce jour-là, la preuve était l'antériorité : règle « vue avant le retrait »
// ci-dessous.

// ── UNE ANNONCE VUE AVANT LE RETRAIT N'EST PAS LE REDÉPÔT (29/10, Nico : « un candidat doit correspondre réellement à
//    l'article ») ──────────────────────────────────────────────────────────────────────────────────────────────────
// Une annonce dont l'existence est PROUVÉE avant le retrait ne peut pas être le redépôt fait après lui : l'écarter ne
// cache jamais notre propre copie. Même fiche ou pas (l'ancienne annonce est déjà hors des candidates : ancienId).
// Deux preuves, et elles seules :
//   · Beebs — son numéro figure dans une liste « Mes annonces » lue par NOS dépôts du compte
//     (preuve_identifiant_beebs.avant / .apres : ids + lu_le). lu_le est l'heure du POSTE, deleted_at celle du serveur
//     (update-job-status) : la lecture ne compte que si lu_le < deleted_at − 15 min. c9fe1ee1 : 34245064 était dans la
//     liste lue par 9a096169 le 27/10 à 03:41:46, 34246760 dans celle de c002a882 à 13:04:16 ; retrait à 14:02:31.
//   · Leboncoin — sa date de mise en ligne donnée par Leboncoin (annonces_plateforme.publiee_le, heure Leboncoin)
//     < deleted_at − 5 min. Mesuré le 29/10 sur 579 remises en ligne Leboncoin à numéro adsubmit (90 jours) :
//     publiee_le − deleted_at ≥ 3,4 min, toujours ; la marge couvre un retrait daté jusqu'à 8,4 min trop tard
//     (Régis, 18/10 : 7 min). 1660ea94 : sculpture mise en ligne à 20:55:27, lampe à 20:55:17, retrait à 21:01:08.
export const MARGE_LECTURE_POSTE_MS = 15 * 60_000;
export const MARGE_PUBLIEE_LBC_MS = 5 * 60_000;

/** Les colonnes de cross_post_jobs que lisent depotsAutresFiches et numerosVusAvantRetrait (PostgREST, alias à plat). */
export const COLONNES_JOBS_AUTRES_FICHES = "id, inventaire_id, platform_listing_id, "
  + "new_platform_listing_id:platform_fields->>new_platform_listing_id, "
  + "preuve_beebs_id:platform_fields->preuve_identifiant_beebs->>id, "
  + "adsubmit_id:platform_fields->lbc_depot->adsubmit->>id, "
  + "lien_par_titre:platform_fields->listing_url_recovery, "
  + "lecture_avant_ids:platform_fields->preuve_identifiant_beebs->avant->ids, "
  + "lecture_avant_le:platform_fields->preuve_identifiant_beebs->avant->>lu_le, "
  + "lecture_apres_ids:platform_fields->preuve_identifiant_beebs->apres->ids, "
  + "lecture_apres_le:platform_fields->preuve_identifiant_beebs->apres->>lu_le";

const NUMERO_RE = /^\d{6,}$/;
const txtId = (v) => String(v ?? "").trim();
const court = (v) => txtId(v).slice(0, 8);

/** Les numéros d'annonce d'un job (alias à plat de COLONNES_JOBS_AUTRES_FICHES, ou platform_fields complet). */
function numerosDuJob(j) {
  const pf = j?.platform_fields && typeof j.platform_fields === "object" ? j.platform_fields : {};
  const parTitre = (j?.lien_par_titre ?? pf.listing_url_recovery) != null;
  return [
    ["platform_listing_id", parTitre ? null : j?.platform_listing_id],
    ["new_platform_listing_id", j?.new_platform_listing_id ?? pf.new_platform_listing_id],
    ["preuve_identifiant_beebs", j?.preuve_beebs_id ?? pf.preuve_identifiant_beebs?.id],
    ["lbc_depot.adsubmit", j?.adsubmit_id ?? pf.lbc_depot?.adsubmit?.id],
  ].map(([source, v]) => [source, txtId(v)]).filter(([, n]) => NUMERO_RE.test(n));
}

/**
 * Les numéros d'annonce que les jobs du compte donnent à une AUTRE fiche que `inventaireId` :
 * Map(numéro → { job_id, inventaire_id, source }). Un numéro aussi porté par un job de la MÊME fiche n'y est pas.
 * @param {any[]} jobs
 * @param {any} inventaireId
 * @returns {Map<string, { job_id: string, inventaire_id: string, source: string }>}
 */
export function depotsAutresFiches(jobs, inventaireId) {
  const out = new Map();
  if (inventaireId == null) return out;
  const inv = String(inventaireId);
  const siens = new Set();
  for (const j of Array.isArray(jobs) ? jobs : []) {
    if (!j || j.inventaire_id == null) continue;
    const memeFiche = String(j.inventaire_id) === inv;
    for (const [source, n] of numerosDuJob(j)) {
      if (memeFiche) siens.add(n);
      else if (!out.has(n)) out.set(n, { job_id: txtId(j.id), inventaire_id: String(j.inventaire_id), source });
    }
  }
  for (const n of siens) out.delete(n);
  return out;
}

/** Les numéros confirmés par des jobs du compte sur une AUTRE fiche (Set). */
export function numerosAutresFiches(jobs, inventaireId) {
  return new Set(depotsAutresFiches(jobs, inventaireId).keys());
}

/** Les listes « Mes annonces » lues par un job : [[ids, lu_le], …] (alias à plat, ou platform_fields complet). */
function listesDuJob(j) {
  const pf = j?.platform_fields && typeof j.platform_fields === "object" ? j.platform_fields : {};
  const p = pf.preuve_identifiant_beebs && typeof pf.preuve_identifiant_beebs === "object" ? pf.preuve_identifiant_beebs : {};
  return [
    [j?.lecture_avant_ids ?? p.avant?.ids, j?.lecture_avant_le ?? p.avant?.lu_le],
    [j?.lecture_apres_ids ?? p.apres?.ids, j?.lecture_apres_le ?? p.apres?.lu_le],
  ];
}

/**
 * Les numéros que NOS dépôts du compte ont lus dans « Mes annonces » au moins `marge` avant le retrait :
 * Map(numéro → { lu_le, job_id }), la plus ancienne lecture. Pur.
 * @param {any[]} jobs
 * @param {any} deletedAt
 * @param {{ marge?: number }} [opts]
 * @returns {Map<string, { lu_le: string, job_id: string }>}
 */
export function numerosVusAvantRetrait(jobs, deletedAt, { marge = MARGE_LECTURE_POSTE_MS } = {}) {
  const out = new Map();
  const seuil = ms(deletedAt);
  if (seuil == null) return out;
  for (const j of Array.isArray(jobs) ? jobs : []) {
    for (const [ids, le] of listesDuJob(j)) {
      const t = ms(le);
      if (t == null || !(t < seuil - marge) || !Array.isArray(ids)) continue;
      for (const x of ids) {
        const n = txtId(x);
        if (!NUMERO_RE.test(n)) continue;
        const deja = out.get(n);
        if (!deja || t < Date.parse(deja.lu_le)) out.set(n, { lu_le: new Date(t).toISOString(), job_id: txtId(j?.id) });
      }
    }
  }
  return out;
}

/**
 * La preuve que l'annonce `l` existait avant le retrait (texte), ou null : son numéro dans `vusAvant`
 * (numerosVusAvantRetrait), ou — Leboncoin — sa mise en ligne avant deleted_at − 5 min. Pur.
 * @param {any} platform
 * @param {any} l
 * @param {{ deletedAt?: any, vusAvant?: Map<string, { lu_le: string, job_id: string }> | null, margePubliee?: number }} [opts]
 */
export function preuveVueAvantRetrait(platform, l, { deletedAt = null, vusAvant = null, margePubliee = MARGE_PUBLIEE_LBC_MS } = {}) {
  const seuil = ms(deletedAt);
  if (!l || seuil == null) return null;
  const v = vusAvant instanceof Map ? vusAvant.get(txtId(l.listing_id)) : null;
  if (v) return `numéro lu dans « Mes annonces » par le dépôt ${court(v.job_id)} le ${v.lu_le}, avant le retrait`;
  if (String(platform ?? "") === "leboncoin") {
    const p = ms(l.publiee_le);
    if (p != null && p < seuil - margePubliee) return `mise en ligne le ${new Date(p).toISOString()} selon Leboncoin, avant le retrait`;
  }
  return null;
}

/** Map(jobId → inventaire_id) des jobs du compte (un job sans fiche n'y est pas). */
export function fichesDesJobs(jobs) {
  const m = new Map();
  for (const j of Array.isArray(jobs) ? jobs : []) {
    if (j?.id != null && j.inventaire_id != null) m.set(txtId(j.id), String(j.inventaire_id));
  }
  return m;
}

/**
 * Le motif qui écarte la ligne `l` parce qu'une AUTRE fiche la désigne (numéro d'un de ses jobs, proposition du
 * relevé, et — `avecFicheLigne` — fiche rattachée), ou null. Le moindre signe de la MÊME fiche → null. Pur.
 * @param {any} l
 * @param {{ jobId?: any, inventaireId?: any, numerosAutres?: Set<string> | Map<string, any> | null, fichesJobs?: Map<string, string> | null, avecFicheLigne?: boolean }} [opts]
 */
export function motifAutreFiche(l, { jobId = null, inventaireId = null, numerosAutres = null, fichesJobs = null, avecFicheLigne = true } = {}) {
  if (!l || inventaireId == null) return null;
  const inv = String(inventaireId);
  const ficheDe = (id) => (id != null && fichesJobs instanceof Map ? fichesJobs.get(txtId(id)) ?? null : null);
  const prop = l.proposition && typeof l.proposition === "object" ? l.proposition : null;
  const notreJob = (id) => id != null && jobId != null && txtId(id) === txtId(jobId);
  if (notreJob(l.job_id) || notreJob(prop?.job_id)) return null;
  if ([l.inventaire_id, ficheDe(l.job_id), prop?.inventaire_id, ficheDe(prop?.job_id)].some((f) => f != null && String(f) === inv)) return null;
  if (avecFicheLigne && l.inventaire_id != null) return `rattachée à une autre fiche (${l.inventaire_id})`;
  const n = txtId(l.listing_id);
  if (numerosAutres && typeof numerosAutres.has === "function" && numerosAutres.has(n)) {
    const o = numerosAutres instanceof Map ? numerosAutres.get(n) : null;
    return o ? `numéro donné par le job ${court(o.job_id)} d'une autre fiche (${o.inventaire_id}, ${o.source})` : "numéro donné par un job d'une autre fiche";
  }
  const fp = ficheDe(prop?.job_id);
  if (fp != null) return `proposée par le relevé pour le job ${court(prop.job_id)} d'une autre fiche (${fp})`;
  return null;
}

/**
 * Les annonces apparues depuis le retrait, parmi les lignes relevées du compte
 * sur la plateforme, et celles qui en sont écartées (avec leur motif). Une
 * ligne compte si : autre identifiant que l'annonce retirée, vue pour la
 * première fois après le retrait (et, quand les deux identifiants sont
 * numériques, plus récente que l'ancienne), pas déjà rattachée à un AUTRE job,
 * pas disparue — et (29/10, quand l'appelant a lu les jobs du compte :
 * `numerosAutres` / `fichesJobs`) qu'aucune AUTRE fiche ne la désigne ; et
 * (29/10, `vusAvant` passé, avec `platform`) qu'elle n'existait pas avant le
 * retrait (preuveVueAvantRetrait, motif « vue_avant_retrait »).
 * Sans ces paramètres, les candidates sont celles d'avant le 29/10.
 * @param {{ jobId: any, ancienId: any, deletedAt: any, lignes: any[], inventaireId?: any, numerosAutres?: Set<string> | Map<string, any> | null, fichesJobs?: Map<string, string> | null, platform?: any, vusAvant?: Map<string, { lu_le: string, job_id: string }> | null }} arg
 * @returns {{ candidates: any[], ecartees: Array<{ listing_id: string, motif: string, preuve?: string }> }}
 */
export function trierCandidatesDepuisRetrait({ jobId, ancienId, deletedAt, lignes, inventaireId = null, numerosAutres = null, fichesJobs = null, platform = null, vusAvant = null }) {
  const retrait = ms(deletedAt);
  const ancien = idNum(ancienId);
  const lu = numerosAutres instanceof Set || numerosAutres instanceof Map || fichesJobs instanceof Map;
  const ficheDe = (id) => (fichesJobs instanceof Map ? fichesJobs.get(txtId(id)) ?? null : null);
  const candidates = [];
  const ecartees = [];
  for (const l of Array.isArray(lignes) ? lignes : []) {
    if (!l || !l.listing_id || String(l.listing_id) === String(ancienId ?? "")) continue;
    if (l.disparu_le) continue;
    const vu = ms(l.created_at);
    if (retrait == null || vu == null || vu < retrait) continue;
    const n = idNum(l.listing_id);
    if (ancien != null && n != null && n <= ancien) continue;
    // (29/10) Vue avant le retrait : jamais le redépôt, même fiche ou pas.
    const avant = vusAvant instanceof Map ? preuveVueAvantRetrait(platform, l, { deletedAt, vusAvant }) : null;
    if (avant) { ecartees.push({ listing_id: String(l.listing_id), motif: "vue_avant_retrait", preuve: avant }); continue; }
    // (2026-09-27) Une ligne rattachée à un AUTRE job ne compte plus que si
    // elle appartient à une AUTRE fiche : la copie déjà en ligne de la MÊME
    // fiche (importée ou rattachée par le relevé à un job de suivi) est
    // précisément l'annonce qu'il ne faut pas redéposer — l'écarter donnait un
    // faux « aucune », donc un doublon. (29/10) La fiche de ce job, lue dans
    // `fichesJobs`, dit aussi « même fiche ».
    if (l.job_id && String(l.job_id) !== String(jobId)) {
      const memeFiche = inventaireId != null && ((l.inventaire_id != null && String(l.inventaire_id) === String(inventaireId))
        || ficheDe(l.job_id) === String(inventaireId));
      if (!memeFiche) {
        ecartees.push({ listing_id: String(l.listing_id), motif: `rattachée au job ${court(l.job_id)}${l.inventaire_id != null ? ` d'une autre fiche (${l.inventaire_id})` : ""}` });
        continue;
      }
    }
    const motif = lu ? motifAutreFiche(l, { jobId, inventaireId, numerosAutres, fichesJobs }) : null;
    if (motif) { ecartees.push({ listing_id: String(l.listing_id), motif }); continue; }
    candidates.push(l);
  }
  return { candidates, ecartees };
}

/**
 * Les candidates seules (voir trierCandidatesDepuisRetrait).
 * @param {{ jobId: any, ancienId: any, deletedAt: any, lignes: any[], inventaireId?: any, numerosAutres?: Set<string> | Map<string, any> | null, fichesJobs?: Map<string, string> | null, platform?: any, vusAvant?: Map<string, { lu_le: string, job_id: string }> | null }} arg
 */
export function candidatesDepuisRetrait(arg) {
  return trierCandidatesDepuisRetrait(arg).candidates;
}

/**
 * Le verdict sur les candidates.
 *   · { verdict: "aucune" }                      → on peut redéposer ;
 *   · { verdict: "certaine", retenue }           → rattachement automatique ;
 *   · { verdict: "incertaine", raisons, liens }  → needs_user avec les liens.
 * @param {{ candidates: any[], listingIdProuve?: string | null, empreintesCopie?: any[] | null, empreintesParCandidate?: Map<string, any[]> | null }} arg
 */
export function jugerCandidates({ candidates, listingIdProuve = null, empreintesCopie = null, empreintesParCandidate = null }) {
  if (!candidates.length) return { verdict: "aucune" };
  const liens = candidates.map((c) => c.url || c.listing_id).filter(Boolean);
  const preuve = String(listingIdProuve ?? "").trim();
  if (candidates.length === 1 && preuve && String(candidates[0].listing_id) === preuve && candidates[0].statut_plateforme === "en_ligne") {
    return { verdict: "certaine", retenue: candidates[0], preuve: "identifiant conservé après le dépôt" };
  }
  // ── LES PHOTOS DE NOTRE COPIE (15/10 soir, camille.ferren 5b6c8cc9) ──────
  // Cascade identifiants → photos → IA (Nico, 15/10). « Kit calendrier de
  // l'avent » : annonce 3288747290 apparue à 12:34, pendant la remise en
  // ligne, avec EXACTEMENT les photos de notre copie (dHash et pHash à 0-1
  // bit), quand l'annonce d'origine de la personne portait d'autres photos.
  // C'est notre dépôt. La preuve compare la COPIE envoyée (photos du job), pas
  // la fiche : une annonce mise en ligne à la main par la personne porte ses
  // propres photos. Une seule candidate doit avoir les mêmes photos, toutes les
  // autres aucune photo approchante (trancherParPhotos, seuils du moteur).
  // En doute : la question, comme avant. Le risque résiduel (deux exemplaires
  // aux mêmes photos) ne crée jamais de doublon : il en manquerait un.
  if (Array.isArray(empreintesCopie) && empreintesCopie.length && empreintesParCandidate instanceof Map) {
    const parCandidate = new Map(candidates.map((c) => [String(c.listing_id), empreintesParCandidate.get(String(c.listing_id)) ?? []]));
    const ph = trancherParPhotos(empreintesCopie, parCandidate);
    const retenue = ph.fiche ? candidates.find((c) => String(c.listing_id) === String(ph.fiche)) : null;
    if (retenue && /^(en_ligne|en_verification)$/.test(String(retenue.statut_plateforme ?? ""))) {
      return { verdict: "certaine", retenue, preuve: "photos identiques à celles de notre copie", photos: ph.niveaux };
    }
    if (candidates.length > 1) {
      return { verdict: "incertaine", raisons: [`${candidates.length} annonces apparues depuis le retrait`], liens, photos: ph.niveaux };
    }
    return { verdict: "incertaine", raisons: ["aucun identifiant de dépôt ni photo identique ne prouve que cette annonce est le même exemplaire"], liens, photos: ph.niveaux };
  }
  if (candidates.length > 1) {
    return { verdict: "incertaine", raisons: [`${candidates.length} annonces apparues depuis le retrait`], liens };
  }
  return { verdict: "incertaine", raisons: ["aucun identifiant de dépôt ne prouve que cette annonce est le même exemplaire"], liens };
}

/** Les URL https d'un champ photos (chaînes ou objets { url }). */
export function urlsPhotos(v, n = 6) {
  return (Array.isArray(v) ? v : [])
    .map((x) => (typeof x === "string" ? x : x && typeof x === "object" ? x.url : null))
    .filter((u) => typeof u === "string" && /^https:\/\//.test(u))
    .slice(0, n);
}

/**
 * @param {any} pf0
 * @param {any} c
 * @param {{ trace?: any, preuve?: string | null, photos?: any, posePar?: string, maintenant?: string }} [opts]
 * @returns {Record<string, any>}
 * Le patch qui rattache une remise en ligne à l'annonce déjà partie (identité
 * CERTAINE) : le job devient « published » à l'étape « recreated », sans
 * redépôt. Même forme que get-pending-jobs (redépôt interrompu). Pur.
 */
export function patchRattachementRecreation(pf0, c, { trace = null, preuve = null, photos = null, posePar = "handler-watch", maintenant = new Date().toISOString() } = {}) {
  const url = String(c?.url ?? "") || null;
  const pf = {
    ...(pf0 ?? {}),
    republish_step: "recreated",
    recreated_at: String(c?.created_at ?? maintenant),
    new_listing_url: url,
    ...(trace ? { recreation_verifiee: trace } : {}),
    rattachement_recreation: {
      le: maintenant, listing_id: String(c?.listing_id ?? ""),
      preuve: preuve ?? "identifiant conservé après le dépôt",
      ...(photos ? { photos } : {}),
      pose_par: posePar,
    },
  };
  delete pf.needs_user_source;
  return { status: "published", error: null, published_at: maintenant, platform_listing_id: String(c?.listing_id ?? ""), listing_url: url, platform_fields: pf };
}
