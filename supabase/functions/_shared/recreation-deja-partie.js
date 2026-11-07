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
  // Beebs ne relaie pas d'étape : la page produit (/fr/p/<id>) ou la page de succès (/fr/listing/success, où un dépôt
  // réussi redirige — 07/11, point 3) disent qu'un dépôt a abouti.
  beebs: /beebs\.app\/[a-z]{2}\/(?:p\/\d+|listing\/success)/,
};
// (07/11, point 3 — Ciddjy 49342549, et ayoub 246477ff le 04/11) Un essai Beebs arrêté à la BORNE du remplissage ou sur un
// canal muet a pu cliquer « Mettre en vente » : après la borne, le remplissage CONTINUAIT dans la page (ayoub : annonce
// 34296690 parue 12 min après « délai dépassé »). Beebs ne relayait aucune étape (jusqu'à la 0.6.176) : un tel essai est
// donc SUSPECT, comme pour les publications (depot-sans-numero.js) — les annonces sont relues avant tout redépôt.
const ESSAI_MUET_RE = /pas de réponse du content script|message channel closed|Receiving end does not exist|borne \d+ min dépassée/i;
const PLATEFORMES_SANS_ETAPE_ENVOI = new Set(["beebs"]);

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
  // (07/11, point 3) Beebs : un essai arrêté à la borne ou muet depuis le retrait (error_technique et ses précédents).
  if (PLATEFORMES_SANS_ETAPE_ENVOI.has(platform)) {
    const et = pf.error_technique && typeof pf.error_technique === "object" ? pf.error_technique : null;
    const traces = et ? [et, ...(Array.isArray(et.precedents) ? et.precedents : [])] : [];
    for (const e of traces) {
      const t = ms(e?.at);
      if (t == null || t <= retrait || !ESSAI_MUET_RE.test(String(e?.brut ?? ""))) continue;
      if (!dernier || t > dernier.t) dernier = { t, raison: "essai arrêté sans réponse du formulaire Beebs (le clic « Mettre en vente » a pu partir)" };
    }
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
 *   · { verdict: "doublons_nos_essais", retenue, aRetirer, essais } → (07/11, `doublons` passé) plusieurs annonces, toutes
 *     NOS dépôts en double : la plus ancienne rattachée, chacune des autres retirée par le circuit ordinaire
 *     (doublonsDeNosEssais) ;
 *   · { verdict: "incertaine", raisons, liens }  → needs_user avec les liens.
 * Sans `doublons`, les verdicts d'avant le 07/11, à l'identique.
 * @param {{ candidates: any[], listingIdProuve?: string | null, empreintesCopie?: any[] | null, empreintesParCandidate?: Map<string, any[]> | null, doublons?: { essais: any[] | number, fiche: any, deletedAt: any, ancienId?: any, jobId?: any, inventaireId?: any, releveDepuis?: any } | null }} arg
 */
export function jugerCandidates({ candidates, listingIdProuve = null, empreintesCopie = null, empreintesParCandidate = null, doublons = null }) {
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
      // (07/11, Ciddjy 49342549) Toutes aux photos de notre copie, pas plus que nos essais suspects, une fiche à un
      // exemplaire : nos propres dépôts en double (doublonsDeNosEssais). Sinon la question, comme avant.
      const d = doublons && typeof doublons === "object" ? doublonsDeNosEssais({ candidates, niveaux: ph.niveaux, ...doublons }) : null;
      if (d?.ok) {
        return {
          verdict: "doublons_nos_essais", retenue: d.retenue, aRetirer: d.aRetirer, essais: d.essais, liens,
          preuve: `${candidates.length} annonces aux photos de notre copie pour ${d.essais} essai(s) suspect(s) de cette remise en ligne, fiche à un exemplaire`,
          photos: ph.niveaux,
        };
      }
      return { verdict: "incertaine", raisons: [`${candidates.length} annonces apparues depuis le retrait`], liens, photos: ph.niveaux, ...(d ? { doublons_refus: d.raison } : {}) };
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

// ═══════════════════════════════════════════════════════════════════════════
// NOS PROPRES DÉPÔTS EN DOUBLE : LA PLUS ANCIENNE RESTE, LES AUTRES PARTENT (07/11, Ciddjy 49342549)
// ═══════════════════════════════════════════════════════════════════════════
// Beebs, « Lot 4 pantalons garçon 18 mois » (fiche 1790852574684002, UN exemplaire), annonce 34177027 retirée le 07/11 à
// 06:27 (Paris). Quatre essais de remise en ligne (06:34, 06:54, 07:15, 07:49) arrêtés chacun à la borne de 10 min ;
// le remplissage CONTINUAIT dans la page jusqu'au clic « Mettre en vente » (0.6.176 et avant). Le relevé de 13:37 voit
// quatre annonces neuves EN LIGNE : 34309782, 34309820, 34309865, 34309939 — même photo de couverture, à 0 bit de la
// photo 1 de notre copie (dHash et pHash), et leurs numéros (Beebs numérote tout le site dans l'ordre) tombent chacun
// dans la fenêtre d'un de nos essais, dans l'ordre. Aucune n'était connue de FillSell. La garde du 25/09 a bien relu
// avant tout 5e dépôt, et posé la question « 4 annonces apparues depuis le retrait ».
// LA RÈGLE (Nico, 07/11 : « S'il y en a, c'est l'app qui les détecte et les traite par une RÈGLE, jamais un retrait à
// la main ») — l'exception à « deux annonces d'une plateforme = deux exemplaires », réservée à la PREUVE que ce sont nos
// propres dépôts en double. Toutes les conditions, sinon la question d'avant :
//   · au moins DEUX annonces apparues depuis le retrait (une seule : la cascade d'avant, inchangée) ;
//   · TOUTES aux photos de NOTRE copie (niveau « meme » de trancherParPhotos, mêmes seuils que le moteur) ;
//   · leur nombre ≤ le nombre d'essais SUSPECTS de CE job depuis le retrait (essaisSuspectsDepuisRetrait : chacune peut
//     venir d'un de nos clics, au plus une par essai) ;
//   · la fiche n'a qu'UN exemplaire (inventaire.quantite ≤ 1 ; NULL vaut 1), n'est ni vendue ni fusionnée ;
//   · chacune apparue APRÈS le retrait (première vue ≥ retrait ; numéro > l'annonce retirée), inconnue de FillSell
//     (aucun autre job, aucune autre fiche), en ligne ou en vérification, et vue par le DERNIER relevé complet.
// Alors la plus ANCIENNE (le plus petit numéro : Beebs et Leboncoin numérotent dans l'ordre) est rattachée à la tâche
// (comme le verdict « certaine » : étape recreated, lien, numéro) et chacune des autres reçoit un RETRAIT par le circuit
// ordinaire — un job « delete » sur son numéro exact et son lien, armé comme le doublon_de_republication du 02/10 et du
// 18/10 (get-pending-jobs, inventaire_rattache_recreation_vinted), motif « doublon_de_nos_essais », tâche source et
// numéros tracés ; gardes de la base comprises (retrait unique par annonce, annonce vendue, cible remplacée).
// Pur (Deno + Node) : scripts/doublons-de-nos-essais-selftest.mjs.

/** La borne fixe du remplissage jusqu'à la 0.6.176 (« borne 10 min dépassée »), et la marge de mesure. */
export const BORNE_REMPLISSAGE_MS = 10 * 60_000;
const MARGE_BORNE_MS = 30_000;
const MARGE_SIGNE_AVANT_MS = 2 * 60_000;
const MARGE_SIGNE_APRES_MS = 5 * 60_000;
const ECART_ESSAIS_DISTINCTS_MS = 3 * 60_000;
const COUPE_EN_ROUTE_RE = /coupé en route/i;
export const MOTIF_DOUBLON_DE_NOS_ESSAIS = "doublon_de_nos_essais";

/**
 * Les essais de remise en ligne de CE job, depuis le retrait, qui ont PU cliquer l'envoi. Pur.
 * Les essais se lisent dans le journal du SERVEUR (journal_etapes, trigger zz_journal_etapes_republication : chaque
 * passage « deleted / processing » = un essai pris par l'extension, jusqu'à l'entrée suivante). Un essai est suspect si :
 *   · une fin relevée dans sa fenêtre est sur une page d'envoi (Leboncoin : étape « depot »/« options », pages
 *     options/confirmation ; Beebs : page produit ou de succès) ;
 *   · Beebs : un brut « muet / borne » (error_technique et ses précédents, recreation_reprise, et celle mise de côté par
 *     une relance : recreation_essais_avant_relance) est daté dans sa fenêtre ;
 *   · Beebs : il a duré la borne du remplissage (≥ 10 min − 30 s) sans aboutir — après la borne, le remplissage
 *     continuait jusqu'au clic (ayoub 04/11, Ciddjy 07/11) ;
 *   · le marqueur « essai coupé en route » de handler-watch est daté dans sa fenêtre.
 * Un essai dont la fin est inconnue n'est PAS compté (les fins sont bornées à 8 : compter l'absence gonflerait le
 * nombre) — en moins, la règle des doublons ne joue pas, et la question reste. Journal absent ou tronqué : les signes
 * datés d'avant sa première entrée comptent chacun pour un essai (à plus de 3 min l'un de l'autre).
 * @param {any} platform
 * @param {any} pf
 * @returns {Array<{ debut: string, fin: string | null, raison: string }>}
 */
export function essaisSuspectsDepuisRetrait(platform, pf) {
  if (!pf || typeof pf !== "object") return [];
  const retrait = ms(pf.deleted_at);
  const urlRe = URL_ENVOI_RE[String(platform ?? "")];
  if (retrait == null || !urlRe) return [];
  const sansEtape = PLATEFORMES_SANS_ETAPE_ENVOI.has(String(platform));
  // 1. Les signes datés d'un envoi possible.
  const signes = [];
  const wws = pf.work_window_state && typeof pf.work_window_state === "object" ? pf.work_window_state : {};
  for (const f of [...(Array.isArray(wws.fins) ? wws.fins : []), ...(wws.at_end ? [wws.at_end] : [])]) {
    const t = ms(f?.at);
    if (t == null || t <= retrait) continue;
    const etape = String(f?.fill_step ?? "");
    const url = String(f?.tab_url ?? "");
    if ((platform === "leboncoin" && ETAPES_ENVOI.has(etape)) || urlRe.test(url)) {
      signes.push({ t, raison: `fin d'essai à l'étape « ${etape || "?"} » sur ${url || "?"}` });
    }
  }
  if (sansEtape) {
    const et = pf.error_technique && typeof pf.error_technique === "object" ? pf.error_technique : null;
    const avantRelance = pf.recreation_essais_avant_relance && typeof pf.recreation_essais_avant_relance === "object"
      ? pf.recreation_essais_avant_relance : null;
    const traces = [
      ...(et ? [et, ...(Array.isArray(et.precedents) ? et.precedents : [])] : []),
      pf.recreation_reprise, avantRelance?.recreation_reprise,
    ];
    for (const e of traces) {
      const t = ms(e?.at);
      if (t == null || t <= retrait || !ESSAI_MUET_RE.test(String(e?.brut ?? ""))) continue;
      signes.push({ t, raison: "essai muet ou arrêté à la borne du remplissage" });
    }
  }
  const coupe = pf.recreation_depot_parti && typeof pf.recreation_depot_parti === "object" ? pf.recreation_depot_parti : null;
  const tc = ms(coupe?.at);
  if (tc != null && tc > retrait && COUPE_EN_ROUTE_RE.test(String(coupe?.raison ?? ""))) {
    signes.push({ t: tc, raison: "essai coupé en route (ordinateur muet)" });
  }
  // 2. Les essais, lus dans le journal du serveur.
  const journal = (Array.isArray(pf.journal_etapes) ? pf.journal_etapes : [])
    .map((e) => ({ t: ms(e?.le), etape: String(e?.etape ?? ""), statut: String(e?.statut ?? "") }))
    .filter((e) => e.t != null)
    .sort((a, b) => a.t - b.t);
  const fenetres = [];
  for (let i = 0; i < journal.length; i++) {
    const e = journal[i];
    if (e.etape !== "deleted" || e.statut !== "processing" || e.t < retrait - MARGE_SIGNE_AVANT_MS) continue;
    const suite = journal[i + 1] ?? null;
    const fin = suite ? suite.t : null;
    fenetres.push({ debut: e.t, fin, suite, haut: (fin ?? e.t + 3 * BORNE_REMPLISSAGE_MS) + MARGE_SIGNE_APRES_MS, signes: [] });
  }
  // Chaque signe compte pour UN essai au plus : le dernier commencé avant lui (à 2 min près — heure du poste), jamais
  // deux fenêtres voisines pour le même signe.
  const couverts = new Set();
  for (const s of signes) {
    const possibles = fenetres.filter((w) => s.t >= w.debut - MARGE_SIGNE_AVANT_MS && s.t <= w.haut);
    if (!possibles.length) continue;
    const avant = possibles.filter((w) => w.debut <= s.t);
    const w = avant.length ? avant[avant.length - 1] : possibles[0];
    w.signes.push(s);
    couverts.add(s);
  }
  const out = [];
  for (const w of fenetres) {
    let raison = w.signes[0]?.raison ?? null;
    if (!raison && sansEtape && w.fin != null && w.fin - w.debut >= BORNE_REMPLISSAGE_MS - MARGE_BORNE_MS
      && w.suite.statut !== "published" && w.suite.etape !== "recreated") {
      raison = "essai arrêté à la borne du remplissage, sans aboutir (le clic a pu partir après)";
    }
    if (raison) out.push({ debut: new Date(w.debut).toISOString(), fin: w.fin != null ? new Date(w.fin).toISOString() : null, raison });
  }
  // 3. Le journal ne couvre pas tout (absent, ou tronqué à 30 entrées) : un signe d'avant sa première entrée = un essai.
  const couvreDepuis = journal.length ? journal[0].t : Infinity;
  let dernier = -Infinity;
  for (const s of signes.filter((x) => !couverts.has(x) && x.t < couvreDepuis - MARGE_SIGNE_AVANT_MS).sort((a, b) => a.t - b.t)) {
    if (s.t - dernier <= ECART_ESSAIS_DISTINCTS_MS) continue;
    dernier = s.t;
    out.push({ debut: new Date(s.t).toISOString(), fin: null, raison: s.raison });
  }
  return out.sort((a, b) => Date.parse(a.debut) - Date.parse(b.debut));
}

/**
 * NOS DÉPÔTS EN DOUBLE ? Pur. `{ ok: true, retenue, aRetirer, essais }` quand TOUTES les conditions de la règle tiennent
 * (en-tête de section), sinon `{ ok: false, raison }` — et la question d'avant.
 * @param {{ candidates: any[], niveaux: Record<string, string> | null, essais: any[] | number, fiche: any, deletedAt: any, ancienId?: any, jobId?: any, inventaireId?: any, releveDepuis?: any }} arg
 */
export function doublonsDeNosEssais({ candidates, niveaux, essais, fiche, deletedAt, ancienId = null, jobId = null, inventaireId = null, releveDepuis = null }) {
  const non = (raison) => ({ ok: false, raison });
  const cs = Array.isArray(candidates) ? candidates : [];
  if (cs.length < 2) return non("une seule annonce apparue : la cascade d'avant");
  const nEssais = Array.isArray(essais) ? essais.length : (Number.isFinite(Number(essais)) ? Number(essais) : 0);
  if (cs.length > nEssais) return non(`${cs.length} annonces pour ${nEssais} essai(s) suspect(s) de cette remise en ligne`);
  if (inventaireId == null) return non("tâche sans fiche");
  if (!fiche || typeof fiche !== "object") return non("fiche illisible");
  const q = fiche.quantite == null ? 1 : Number(fiche.quantite);
  if (!(q <= 1)) return non(`fiche à ${fiche.quantite} exemplaires : deux annonces peuvent être deux exemplaires`);
  if (fiche.fusionne_dans != null) return non("fiche fusionnée dans une autre");
  if (String(fiche.statut ?? "") === "vendu") return non("article vendu");
  const retrait = ms(deletedAt);
  if (retrait == null) return non("heure du retrait illisible");
  const ancien = idNum(ancienId);
  const releve = ms(releveDepuis);
  for (const c of cs) {
    const id = txtId(c?.listing_id);
    if (!NUMERO_RE.test(id)) return non(`numéro d'annonce illisible (${id || "?"})`);
    const niveau = niveaux && typeof niveaux === "object" ? niveaux[id] : undefined;
    if (niveau !== "meme") return non(`l'annonce ${id} ne porte pas les photos de notre copie (${niveau ?? "non comparée"})`);
    if (!/^(en_ligne|en_verification)$/.test(String(c?.statut_plateforme ?? ""))) return non(`l'annonce ${id} n'est pas en ligne (${c?.statut_plateforme ?? "?"})`);
    const vu = ms(c?.created_at);
    if (vu == null || vu < retrait) return non(`l'annonce ${id} est apparue avant le retrait`);
    if (ancien != null && BigInt(id) <= ancien) return non(`l'annonce ${id} est plus ancienne que l'annonce retirée`);
    if (c?.job_id != null && (jobId == null || txtId(c.job_id) !== txtId(jobId))) return non(`l'annonce ${id} est rattachée à un autre job`);
    if (c?.inventaire_id != null && String(c.inventaire_id) !== String(inventaireId)) return non(`l'annonce ${id} est rattachée à une autre fiche`);
    const prop = c?.proposition && typeof c.proposition === "object" ? c.proposition : null;
    if (prop?.job_id != null && (jobId == null || txtId(prop.job_id) !== txtId(jobId))) return non(`l'annonce ${id} est proposée pour un autre job`);
    if (releve != null) {
      const v = ms(c?.vu_le);
      if (v == null || v < releve - 60_000) return non(`l'annonce ${id} n'a pas été revue par le dernier relevé complet`);
    }
  }
  const tri = [...cs].sort((a, b) => (BigInt(txtId(a.listing_id)) < BigInt(txtId(b.listing_id)) ? -1 : 1));
  return { ok: true, retenue: tri[0], aRetirer: tri.slice(1), essais: nEssais };
}

/**
 * La ligne cross_post_jobs du RETRAIT d'un de nos doublons : le circuit ordinaire (job « delete », numéro exact et lien,
 * voie extension), armé comme le doublon_de_republication (02/10, 18/10), motif « doublon_de_nos_essais ». Pur.
 * @param {{ userId: any, job: any, annonce: any, garde: any, numeros?: any[], essais?: number, lien?: string | null, maintenant?: string }} arg
 */
export function retraitDoublonDeNosEssais({ userId, job, annonce, garde, numeros = [], essais = 0, lien = null, maintenant = new Date().toISOString() }) {
  const n = txtId(annonce?.listing_id);
  return {
    user_id: userId, inventaire_id: job?.inventaire_id ?? null, platform: String(job?.platform ?? ""),
    action: "delete", status: "pending", photo_option: "original", voie: "extension",
    title: String(annonce?.titre ?? job?.title ?? "").slice(0, 200),
    listing_url: String(lien ?? annonce?.url ?? "") || null, platform_listing_id: n,
    platform_fields: {
      arme_par: {
        chemin: "doublon_de_republication", motif: MOTIF_DOUBLON_DE_NOS_ESSAIS,
        republication: txtId(job?.id), garde: txtId(garde), numeros: numeros.map(txtId), essais_suspects: essais,
        preuve: "photos identiques à celles de notre copie, apparue depuis le retrait, pas plus d'annonces que d'essais suspects, fiche à un exemplaire",
        le: maintenant, pose_par: "get-pending-jobs (redépôt interrompu : doublons de nos propres essais)",
      },
    },
  };
}

/** Le relevé « annonces » complet qui peut prouver une absence avant redépôt (même lecture que get-pending-jobs, 27/09). */
export function releveCompletAvantRedepot(r) {
  const err = String(r?.erreur ?? "");
  if (r?.status !== "done") return false;
  if (err.startsWith("[incomplet]")) return false;
  if (err.includes("n'a pas rendu sa liste") || err.includes("Hub vendeur n'a pas rendu son compteur")) return false;
  return Number(r?.items_vus ?? 0) > 0 || err.startsWith("[vide]");
}

// ── LES QUESTIONS DÉJÀ POSÉES SONT REJUGÉES PAR CETTE RÈGLE (bornées) ──────────────────────────────────────────────
// Une question « recreation_deja_partie » posée avant la règle (ou avant que les photos des annonces aient une
// empreinte) n'est relue par aucun chemin qui sache trancher des doublons (handler-watch, depot-coupe-tranche.js : « N
// annonces encore en ligne » → la question reste). get-pending-jobs la rejuge, au plus QUESTIONS_DOUBLONS_PAR_PASSAGE
// par passage, REJUGES_DOUBLONS_MAX fois par question, espacées de REJUGE_DOUBLONS_ESPACEMENT_MS ; chaque refus est
// tracé une fois (`doublons_rejuge`) — jamais une ligne réécrite à chaque passage.
export const QUESTIONS_DOUBLONS_PAR_PASSAGE = 2;
export const REJUGES_DOUBLONS_MAX = 4;
export const REJUGE_DOUBLONS_ESPACEMENT_MS = 30 * 60_000;
const PLATEFORMES_REDEPOT = new Set(["leboncoin", "beebs"]);

/** La question est-elle à rejuger par la règle des doublons de nos essais ? Pur. */
export function questionDoublonsARejuger(job, maintenant = Date.now()) {
  if (!job || job.status !== "needs_user" || job.action !== "republish") return false;
  if (!PLATEFORMES_REDEPOT.has(String(job.platform ?? ""))) return false;
  if (job.inventaire_id == null) return false;
  const pf = job.platform_fields && typeof job.platform_fields === "object" ? job.platform_fields : {};
  if (pf.needs_user_source !== "recreation_deja_partie" || pf.republish_step !== "deleted" || ms(pf.deleted_at) == null) return false;
  const q = pf.recreation_deja_partie && typeof pf.recreation_deja_partie === "object" ? pf.recreation_deja_partie : null;
  if (!q || q.verdict !== "incertaine" || !Array.isArray(q.liens) || q.liens.length < 2) return false;
  const r = pf.doublons_rejuge && typeof pf.doublons_rejuge === "object" ? pf.doublons_rejuge : null;
  if (!r || String(r.question ?? "") !== String(q.le ?? "")) return true;
  if ((Number(r.n) || 0) >= REJUGES_DOUBLONS_MAX) return false;
  const t = ms(r.le);
  return t == null || Number(maintenant) - t >= REJUGE_DOUBLONS_ESPACEMENT_MS;
}

/**
 * La trace d'un rejugement sans doublons prouvés (la question reste). Pur.
 * @param {any} pf
 * @param {{ raison?: string | null, maintenant?: string }} [opts]
 */
export function marqueDoublonsRejuge(pf, { raison = null, maintenant = new Date().toISOString() } = {}) {
  const q = pf?.recreation_deja_partie && typeof pf.recreation_deja_partie === "object" ? pf.recreation_deja_partie : {};
  const r = pf?.doublons_rejuge && typeof pf.doublons_rejuge === "object" ? pf.doublons_rejuge : null;
  const memeQuestion = r && String(r.question ?? "") === String(q.le ?? "");
  return { le: maintenant, question: q.le ?? null, n: (memeQuestion ? Number(r.n) || 0 : 0) + 1, raison: raison ? String(raison).slice(0, 300) : null };
}
