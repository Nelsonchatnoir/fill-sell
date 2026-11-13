// ═══════════════════════════════════════════════════════════════════════════
// JAMAIS DEUX ESSAIS DE REMISE EN LIGNE VINTED SANS RELIRE LE DRESSING (18/10)
// ═══════════════════════════════════════════════════════════════════════════
// Régis (juchsregis, 18/10) : 7 copies du short Levi's, 4 du bloc-feuillet.
// Chaque essai « échouait » en canal coupé alors que Vinted avait créé
// l'annonce (Vinted renvoie désormais vers /member/<vendeur> après un dépôt
// réussi : ni l'adresse ni la sonde ne le voient), et l'extension repartait
// 5 puis 10 min plus tard sur la foi d'une relecture de la seule page 1 du
// dressing. Même famille que les Petites Fioles (Leboncoin, 25/09) et
// qu'Ornella (09/10, 2 copies).
//
// RÈGLE (servie par get-pending-jobs à TOUTES les versions d'extension) :
//   · une fiche déjà présente est PROUVÉE être notre copie (importée pendant un essai ;
//     numéro ou photos, jamais le titre — 13/11, ci-dessous) → la question, jamais un
//     essai de plus (tous les comptes) ; une fiche qui PEUT l'être → retenue ;
//   · (18/10 soir) le cas Régis seulement — page 1 du dressing PLEINE DE
//     BROUILLONS (≥ BROUILLONS_PAGE_UNE) et extension d'avant la 0.6.128 (sa
//     relecture ne lit que la page 1 : elle ne peut pas voir la copie) : une
//     republication retirée dont un essai a eu lieu n'est plus resservie
//     automatiquement. Un relevé AUTOMATIQUE n'importe aucun article neuf
//     (règle de Nico du 05/10) : il ne prouve rien. Seul un relevé fait PAR LA
//     PERSONNE (Synchroniser), complet, commencé ≥ ATTENTE_RELEVE_MIN après
//     l'essai, l'importe — la base rattache alors la copie (migration
//     20261018170000 ; par le numéro ou un jeton de photo de notre envoi depuis
//     20261113190000) ; s'il n'en apporte aucune, l'essai suivant part, une fois.
//     Sans lui au bout d'ATTENTE_RELEVE_MAX_H → la question, honnête ;
//   · tout autre compte : servi comme avant (la relecture de l'extension voit la
//     copie en page 1 — 153 recréations sur 154 prouvées ainsi en 3 jours).
// ── (25/10) UN DÉPÔT D'ISSUE INCONNUE N'EST JAMAIS SUIVI D'UN SECOND ENVOI SANS PREUVE ──
// Vincent A., job 9138772c (« Champavert, le lycanthrope\nPar Pétrus Borel »,
// extension 0.6.131) : retrait 18:52:54, envoi 18:53:11, onglet renvoyé sur
// /member (dépôt réussi), copie non reconnue (titre tapé sans le saut de ligne,
// _shared/titre-copie-vinted.js) → `depot_incertain` ; resservi au bout de
// 15 min (compte sans mur de brouillons : « servie comme avant »), redéposé à
// 19:46:01 → DEUX annonces en ligne. RÈGLE, toutes versions d'extension : à
// l'étape 'deleted', un `depot_incertain` posé APRÈS le dernier envoi retient
// la republication — jamais resservie — jusqu'à la preuve :
//   · la copie rattachée (l'annonce du dressing reconnue : le job quitte
//     'deleted') ou une fiche au stock qui ressemble à la copie → la question ;
//   · un relevé COMPLET fait par la personne, commencé ≥ ATTENTE_RELEVE_MIN
//     après l'envoi, sans copie → l'essai suivant part, une fois ;
//   · sans preuve au bout d'ATTENTE_RELEVE_MAX_H → la question
//     `recreation_deja_partie`, motif vrai (heure de l'envoi, à Paris).
// Une relance faite par la personne APRÈS ce dépôt incertain la tranche.
// ── (13/11, décision K1 de Nico) LA COPIE SE RECONNAÎT À SON NUMÉRO OU À SES PHOTOS, JAMAIS À SON TITRE ──
// « Passe les deux rattachements serveur restants (recreation-vinted-verifiee et la base) à l'empreinte des
// photos. Plus aucun rattachement par le titre. » Deux articles d'un revendeur portent souvent le même titre, et
// une copie peut naître sous un autre titre (9138772c, compte 67a8b907 : le champ de Vinted avait retiré le saut
// de ligne) : le titre faisait une question à tort, ou laissait partir un second envoi. Une fiche est CANDIDATE
// (candidatesCopie, sans titre) si : numéro inconnu de la tâche, PLUS GRAND que l'annonce retirée (Vinted numérote
// dans l'ordre), même boutique, mise en ligne pendant un de NOS envois et après le retrait, et pas créée par une
// AUTRE tâche de dépôt du compte (numerosDeposes / creeeParUneAutreTache : 46569b9d, compte 8a2eba68 — les remises
// en ligne d'autres fiches du même lot ; compte 2bde8576 — des remises en ligne sans fiche ; un dépôt de la MÊME
// fiche reste candidat). Puis la preuve (jugerCandidatesCopie), dans l'ordre :
//   1. le NUMÉRO que Vinted a rendu à notre envoi (pf.copie_par_numero, 0.6.187) ;
//   2. un JETON de photo de notre envoi (pf.recreation_photos_envoyees.jetons, 0.6.187) dans ses photos ;
//   3. ses photos contre celles de NOTRE copie (republish_snapshot.photos : photo_empreintes, seuils du moteur,
//      niveauPhoto) — ou contre celles de la fiche (« même article » = la question, jamais un rattachement).
// Copie prouvée → la question (comme avant). Photos prouvées différentes de notre copie → pas une copie. Sinon le
// DOUTE : la remise en ligne est RETENUE (jamais servie) pendant que les photos manquantes sont empreintées
// (empreintes_a_calculer, une demande par 10 min) ; 6 h sans preuve → la question, avec les liens à regarder.
// Pur (Deno + Node). Testé par scripts/recreation-vinted-verifiee-selftest.mjs et
// scripts/recreation-vinted-par-empreinte-selftest.mjs (verrou du 13/11).
import { niveauPhoto } from "./annonce-partagee.js";
import { photoDepuisEmpreinte, comparerPhotos } from "./rapprochement/photos.js";

export const ATTENTE_RELEVE_MIN = 12;
export const ATTENTE_RELEVE_MAX_H = 6;
/** Page 1 du dressing propriétaire (96 annonces) pleine de brouillons : la relecture d'avant la 0.6.128 est aveugle. */
export const BROUILLONS_PAGE_UNE = 90;
const GESTE_RE = /^(bouton|bouton_distant|app)(:redemande)?$/;
const AVANT_MS = 2 * 60_000;
const APRES_MS = 20 * 60_000;

const objet = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
const ms = (v) => { const t = Date.parse(String(v ?? "")); return Number.isFinite(t) ? t : NaN; };
const txt = (v) => String(v ?? "").trim();
const NUMERO_RE = /^\d{6,}$/;
const IMPORT_RE = /sync-dressing|releve/i;

/** (13/11) Les photos demandées à empreintes-urls par appel, et l'espacement de deux demandes pour une tâche. */
export const EMPREINTES_PAR_APPEL = 5;
export const EMPREINTES_RELANCE_MS = 10 * 60_000;

/** Le jeton d'une image Vinted (…/t/<jeton>/… ou …/tc/<jeton>/…) — même lecture que l'extension (jetonPhotoVinted). */
export function jetonPhotoVinted(url) {
  return String(url ?? "").match(/\/(?:t|tc)\/([A-Za-z0-9_-]{12,})\//)?.[1] ?? null;
}

/** Les URL https d'un champ photos (chaînes ou objets { url }), dans l'ordre, sans doublon. */
export function urlsDesPhotos(v, n = 8) {
  const out = [];
  for (const x of Array.isArray(v) ? v : []) {
    const u = typeof x === "string" ? x : objet(x)?.url;
    if (typeof u === "string" && /^https:\/\//.test(u) && !out.includes(u)) out.push(u);
    if (out.length >= n) break;
  }
  return out;
}

/** Les jetons des photos (URL Vinted) d'une fiche ou d'une annonce. */
export function jetonsDesPhotos(v) {
  return new Set(urlsDesPhotos(v, 60).map(jetonPhotoVinted).filter(Boolean));
}

/** Les photos de NOTRE copie : celles que la recréation envoie (republish_snapshot.photos), puis celles du job. */
export function urlsCopieRecreation(job) {
  const pf = objet(job?.platform_fields) ?? {};
  return urlsDesPhotos([...(Array.isArray(objet(pf.republish_snapshot)?.photos) ? pf.republish_snapshot.photos : []),
    ...(Array.isArray(job?.photos) ? job.photos : [])], 8);
}

/**
 * (13/11) Les numéros d'annonce que les tâches de DÉPÔT du compte désignent (publication ou remise en ligne — jamais
 * un import du relevé) : Map(numéro → [{ job_id, inventaire_id }]). Lignes de cross_post_jobs (id, inventaire_id,
 * action, handler_build, platform_listing_id, listing_url, new_id = platform_fields->>new_vinted_item_id). Pur.
 */
export function numerosDeposes(jobs) {
  const out = new Map();
  for (const j of Array.isArray(jobs) ? jobs : []) {
    if (!j || IMPORT_RE.test(txt(j.handler_build))) continue;
    if (j.action !== "publish" && j.action !== "republish") continue;
    const nums = new Set([txt(j.platform_listing_id), String(j.listing_url ?? "").match(/\/items\/(\d+)/)?.[1] ?? "",
      txt(j.new_id ?? objet(j.platform_fields)?.new_vinted_item_id)].filter((n) => NUMERO_RE.test(n)));
    for (const n of nums) {
      if (!out.has(n)) out.set(n, []);
      out.get(n).push({ job_id: txt(j.id), inventaire_id: j.inventaire_id == null ? null : String(j.inventaire_id) });
    }
  }
  return out;
}

/**
 * L'annonce n° `n` est-elle créée par une AUTRE tâche de dépôt que `job` (une autre remise en ligne ou publication du
 * compte — 46569b9d, compte 8a2eba68 ; les tâches sans fiche du compte 2bde8576) ? Le moindre signe de la MÊME fiche
 * (ou de cette tâche) la garde candidate : un autre dépôt du même article reste une annonce de cet article. Pur.
 */
export function creeeParUneAutreTache(job, n, deposes) {
  const par = deposes instanceof Map ? deposes.get(txt(n)) : null;
  if (!Array.isArray(par) || !par.length) return false;
  const fiche = job?.inventaire_id == null ? null : String(job.inventaire_id);
  if (par.some((p) => p.job_id === txt(job?.id) || (fiche != null && p.inventaire_id === fiche))) return false;
  return true;
}

/** Toutes les heures de NOS envois (retrait compris), en ms, triées. */
export function envoisDe(pf) {
  const p = objet(pf) ?? {};
  const out = [];
  const pousser = (v) => { const t = ms(v); if (Number.isFinite(t)) out.push(t); };
  pousser(objet(p.suppression_verdict)?.date_serveur);
  pousser(p.deleted_at_client);
  pousser(p.deleted_at);
  pousser(p.deleted_at_serveur);
  pousser(objet(p.recreation_tentee)?.at);
  if (Array.isArray(p.recreation_envois)) for (const e of p.recreation_envois) pousser(typeof e === "string" ? e : objet(e)?.at);
  return out.sort((a, b) => a - b);
}

/** Le plus tôt possible du retrait (horloge Vinted, client, serveur), ou NaN. */
export function retraitLe(pf) {
  const p = objet(pf) ?? {};
  const t = [objet(p.suppression_verdict)?.date_serveur, p.deleted_at_client, p.deleted_at, p.deleted_at_serveur]
    .map(ms).filter(Number.isFinite);
  return t.length ? Math.min(...t) : NaN;
}

/** Le dernier essai (retrait de la une-passe ou tentative), en ms, ou NaN. */
export function dernierEssai(pf) {
  const p = objet(pf) ?? {};
  const t = [ms(objet(p.recreation_tentee)?.at), ...(Array.isArray(p.recreation_envois)
    ? p.recreation_envois.map((e) => ms(typeof e === "string" ? e : objet(e)?.at)) : [])].filter(Number.isFinite);
  return t.length ? Math.max(...t) : NaN;
}

/** La republication est-elle à vérifier avant d'être servie ? → { essai } | null */
export function recreationAVerifier(job) {
  if (!job || job.platform !== "vinted" || job.action !== "republish" || job.status !== "pending") return null;
  const pf = objet(job.platform_fields) ?? {};
  if (String(pf.republish_step ?? "") !== "deleted") return null;
  const essai = dernierEssai(pf);
  if (!Number.isFinite(essai)) return null;
  const verifiee = ms(objet(pf.recreation_verifiee)?.essai);
  if (Number.isFinite(verifiee) && verifiee >= essai - 1_000) return null;
  return { essai };
}

/** Un relevé complet du dressing FAIT PAR LA PERSONNE (il importe), commencé assez tard après l'essai. */
export function releveQualifiant(releves, essai) {
  return (Array.isArray(releves) ? releves : []).find((r) =>
    r && r.status === "done" && (r.kind == null || r.kind === "dressing")
    && GESTE_RE.test(String(r.declencheur ?? ""))
    && ms(r.started_at) >= essai + ATTENTE_RELEVE_MIN * 60_000
    && Number(r.total_entries) > 0 && Number(r.items_vus) >= Number(r.total_entries)) ?? null;
}

/**
 * (13/11, décision K1) Les fiches du compte qui PEUVENT être une copie née de nos envois — sans jamais lire leur
 * titre : numéro inconnu de la tâche et plus grand que l'annonce retirée, même boutique, mise en ligne pendant un de
 * NOS envois et après le retrait, pas créée par une AUTRE tâche de dépôt du compte (deposes : numerosDeposes). Pur.
 * @returns {{ candidates: any[], ecartees: Array<{ numero: string, motif: string }> }}
 */
export function candidatesCopie(job, fiches, { deposes = null } = {}) {
  const pf = objet(job?.platform_fields) ?? {};
  const envois = envoisDe(pf);
  const retrait = retraitLe(pf);
  const candidates = [];
  const ecartees = [];
  if (!envois.length || !Number.isFinite(retrait)) return { candidates, ecartees };
  const ancien = txt(pf.vinted_item_id);
  const ancienOld = txt(pf.old_vinted_item_id);
  const plancher = [ancienOld, ancien].find((n) => NUMERO_RE.test(n)) ?? null;
  const boutique = txt(pf.vinted_account_id);
  for (const f of Array.isArray(fiches) ? fiches : []) {
    const n = txt(f?.vinted_item_id);
    if (!n || n === ancien || n === ancienOld) continue;
    if (job.inventaire_id != null && String(f.id) === String(job.inventaire_id)) continue;
    if (boutique && f.vinted_account_id && String(f.vinted_account_id) !== boutique) continue;
    const t = ms(f.listed_at_guess);
    if (!(Number.isFinite(t) && t >= retrait - AVANT_MS && envois.some((e) => t >= e - AVANT_MS && t <= e + APRES_MS))) continue;
    // Vinted numérote ses annonces dans l'ordre : une copie née après le retrait porte un numéro plus grand.
    if (plancher && NUMERO_RE.test(n) && BigInt(n) <= BigInt(plancher)) { ecartees.push({ numero: n, motif: "numero_anterieur_a_l_annonce_retiree" }); continue; }
    // L'annonce créée par une AUTRE tâche de dépôt du compte (une autre remise en ligne du même lot) n'est pas notre copie.
    if (creeeParUneAutreTache(job, n, deposes)) { ecartees.push({ numero: n, motif: "creee_par_une_autre_tache" }); continue; }
    candidates.push(f);
  }
  return { candidates, ecartees };
}

/**
 * (13/11, décision K1) La preuve, candidate par candidate : numéro rendu par Vinted, jeton de photo de notre envoi,
 * empreintes (photo_empreintes) contre NOTRE copie ou contre la fiche. Jamais le titre. Pur.
 *   empreinte(url) : la ligne photo_empreintes de l'URL, ou undefined ; photosFiche : photos de la fiche d'origine.
 * @returns {{ copies: Array<{ fiche: any, preuve: string }>, douteuses: Array<{ fiche: any, raison: string }>,
 *             ecartees: Array<{ numero: string, motif: string }>, aEmpreinter: string[] }}
 */
export function jugerCandidatesCopie(job, candidates, { empreinte = null, photosFiche = null } = {}) {
  const pf = objet(job?.platform_fields) ?? {};
  const lire = typeof empreinte === "function" ? empreinte : () => undefined;
  const numeroRendu = txt(objet(pf.copie_par_numero)?.id);
  const envoyees = objet(pf.recreation_photos_envoyees);
  const nosJetons = new Set((Array.isArray(envoyees?.jetons) ? envoyees.jetons : []).map(txt).filter(Boolean));
  const urlsCopie = urlsCopieRecreation(job);
  const urlsFiche = urlsDesPhotos(photosFiche, 8);
  const photosDe = (urls) => urls.map((u) => photoDepuisEmpreinte(lire(u))).filter(Boolean);
  const copie = photosDe(urlsCopie);
  const fiche = photosDe(urlsFiche);
  const copies = [], douteuses = [], ecartees = [];
  const aEmpreinter = [];
  for (const f of Array.isArray(candidates) ? candidates : []) {
    const n = txt(f?.vinted_item_id);
    if (numeroRendu && n === numeroRendu) { copies.push({ fiche: f, preuve: "numero_vinted" }); continue; }
    if (nosJetons.size && [...jetonsDesPhotos(f?.photos)].some((j) => nosJetons.has(j))) { copies.push({ fiche: f, preuve: "jeton_photo" }); continue; }
    const urlsF = urlsDesPhotos(f?.photos, 6);
    const siennes = photosDe(urlsF);
    const contreCopie = copie.length && siennes.length ? niveauPhoto(comparerPhotos(copie, siennes)) : "inconnu";
    const contreFiche = fiche.length && siennes.length ? niveauPhoto(comparerPhotos(fiche, siennes)) : "inconnu";
    if (contreCopie === "meme") { copies.push({ fiche: f, preuve: "photos_copie" }); continue; }
    if (contreFiche === "meme") { copies.push({ fiche: f, preuve: "photos_fiche" }); continue; }
    if (contreCopie === "autre") { ecartees.push({ numero: n, motif: "photos_differentes_de_notre_copie" }); continue; }
    douteuses.push({ fiche: f, raison: contreCopie === "proche" ? "photos_proches" : "photos_a_comparer" });
    // Les photos manquantes : celles de NOTRE copie d'abord (elles seules peuvent prouver « pas une copie »), puis les siennes.
    if (!copie.length) for (const u of urlsCopie.slice(0, 3)) if (!lire(u) && !aEmpreinter.includes(u)) aEmpreinter.push(u);
    if (!siennes.length) for (const u of urlsF.slice(0, 2)) if (!lire(u) && !aEmpreinter.includes(u)) aEmpreinter.push(u);
  }
  return { copies, douteuses, ecartees, aEmpreinter: aEmpreinter.slice(0, EMPREINTES_PAR_APPEL) };
}

/** Les fiches du compte PROUVÉES être une copie née de nos envois (numéro ou photos, jamais le titre). */
export function copiesProbables(job, fiches, { deposes = null, empreinte = null, photosFiche = null } = {}) {
  const { candidates } = candidatesCopie(job, fiches, { deposes });
  return jugerCandidatesCopie(job, candidates, { empreinte, photosFiche }).copies.map((c) => c.fiche);
}

export const MESSAGE_ATTENTE =
  "Ton annonce a sans doute déjà été remise en ligne sur Vinted, mais FillSell ne la voit pas encore : ton dressing " +
  "commence par beaucoup de brouillons. Elle sera retrouvée à la prochaine lecture complète de ton dressing (« Synchroniser », " +
  "ou toute seule avec la prochaine mise à jour de l'extension) — elle ne sera jamais remise en ligne une deuxième fois. " +
  "Rien n'est perdu : titre, description, photos et champs sont conservés.";

// (25/10) Le dépôt d'issue inconnue retenu : ce qui se passe, rien d'autre.
export const MESSAGE_DEPOT_INCERTAIN =
  "Ton annonce a été envoyée à Vinted, mais FillSell ne l'a pas encore retrouvée dans ton dressing : il vérifie que ta " +
  "nouvelle annonce est bien en ligne avant tout nouvel envoi — jamais deux annonces. Rien à faire de ton côté ; rien n'est " +
  "perdu : titre, description, photos et champs sont conservés.";

const MOTIF_PROFIL = "redirection_profil_sans_copie_lue";
const DEPOT_INCERTAIN_TOLERANCE_MS = 5 * 60_000;

function heureParis(t) {
  try {
    return new Date(t).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return null;
  }
}

/** (25/10) La question posée au bout d'ATTENTE_RELEVE_MAX_H sans preuve, après un dépôt d'issue inconnue. */
export function messageQuestionDepotIncertain(envoiMs, motif = MOTIF_PROFIL) {
  const quand = Number.isFinite(envoiMs) ? heureParis(envoiMs) : null;
  const constat = motif === MOTIF_PROFIL
    ? "et Vinted a aussitôt affiché ton profil, comme après un dépôt réussi, mais FillSell ne l'a pas retrouvée depuis dans ton dressing"
    : "mais FillSell n'a pas pu vérifier depuis qu'elle est bien en ligne";
  return `Ton annonce a été envoyée à Vinted${quand ? ` le ${quand}` : ""} ${constat}. Pour ne jamais la mettre en ligne ` +
    "deux fois, rien n'est redéposé à l'aveugle : regarde ton dressing Vinted — si elle y est, il n'y a rien à faire ; " +
    "sinon, relance la republication d'un clic.";
}

/**
 * (25/10) Le « dépôt incertain » posé APRÈS le dernier envoi (l'extension n'a pas
 * su dire si l'annonce est en ligne : onglet renvoyé au profil, copie pas encore
 * lue — retenirDepotIncertain), ou null. Une relance faite par la personne après
 * lui le tranche (c'est ce que la question lui demande).
 * @returns {null | { at: number, motif: string }}
 */
export function depotIncertainApresEnvoi(pf, essai) {
  const p = objet(pf) ?? {};
  const d = objet(p.depot_incertain);
  const t = ms(d?.at);
  // Tolérance de 5 min : `at` est l'horloge du poste, les envois mêlent celle de
  // Vinted et du serveur (horloge_client_ecart_s) ; un envoi suivant ne part
  // jamais moins de 15 min après un dépôt incertain (next_action_after).
  if (!Number.isFinite(t) || !Number.isFinite(essai) || t < essai - DEPOT_INCERTAIN_TOLERANCE_MS) return null;
  const relance = ms(p.derniere_relance_manuelle);
  if (Number.isFinite(relance) && relance > t) return null;
  return { at: t, motif: String(d.motif ?? "") };
}

// (13/11) Le doute sur une annonce apparue pendant nos envois : ce qui se passe, rien d'autre.
export const MESSAGE_COPIE_A_VERIFIER =
  "Une annonce est apparue sur ton Vinted pendant la remise en ligne : FillSell compare ses photos à celles de ton " +
  "annonce avant tout nouvel envoi — jamais deux annonces. Rien à faire de ton côté ; rien n'est perdu : titre, " +
  "description, photos et champs sont conservés.";

/** (13/11) La question posée au bout d'ATTENTE_RELEVE_MAX_H quand les photos n'ont pas pu trancher. */
export function messageQuestionCopiePossible(numeros) {
  const liens = (Array.isArray(numeros) ? numeros : []).slice(0, 3).map((n) => `https://www.vinted.fr/items/${n}`).join(" , ");
  return `Une annonce apparue sur ton Vinted pendant la remise en ligne est peut-être déjà ta republication${liens ? ` (${liens})` : ""}, ` +
    "mais FillSell n'a pas pu comparer ses photos. Pour ne jamais la mettre en ligne deux fois, rien n'est redéposé à " +
    "l'aveugle : regarde-la sur Vinted — si c'est ton article, fusionne les deux fiches depuis l'app ; sinon, relance la " +
    "republication d'un clic.";
}

/**
 * @param {any} job  republication Vinted servie (pending, étape 'deleted')
 * @param {{ releves?: any[], fiches?: any[], maintenant?: number, pageUneAveugle?: boolean,
 *           empreinte?: ((url: string) => any) | null, photosFiche?: any[] | null, deposes?: Map<string, any[]> | null }} ctx
 * @returns {null | { action: 'servir'|'retenir'|'question', platform_fields: object, error: string|null, copies?: any[],
 *                    douteuses?: any[], empreintes_a_calculer?: string[] }}
 */
export function decisionVerificationRecreation(job, { releves = [], fiches = [], maintenant = Date.now(), pageUneAveugle = true,
  empreinte = null, photosFiche = null, deposes = null } = {}) {
  const v = recreationAVerifier(job);
  if (!v) return null;
  const pf0 = objet(job.platform_fields) ?? {};
  const pf = { ...pf0 };
  const iso = (t) => new Date(t).toISOString();
  // (13/11, décision K1) Les candidates sans titre, puis la preuve par le numéro ou les photos.
  const { candidates } = candidatesCopie(job, fiches, { deposes });
  const juge = jugerCandidatesCopie(job, candidates, { empreinte, photosFiche });
  const copies = juge.copies.map((c) => c.fiche);
  if (copies.length) {
    delete pf.recreation_attente_releve;
    delete pf.recreation_empreintes_demandees;
    pf.needs_user_source = "recreation_deja_partie";
    pf.recreation_deja_partie = { le: iso(maintenant), essai: iso(v.essai), copies: copies.slice(0, 5).map((c) => String(c.vinted_item_id)),
      preuves: juge.copies.slice(0, 5).map((c) => ({ numero: String(c.fiche.vinted_item_id), preuve: c.preuve })) };
    const liens = copies.slice(0, 3).map((c) => `https://www.vinted.fr/items/${c.vinted_item_id}`).join(" , ");
    return {
      action: "question", platform_fields: pf, copies,
      error: `Ta republication est sans doute déjà en ligne sur Vinted (${liens}), mais elle est entrée dans ton stock comme une fiche ` +
        "séparée. Rien n'a été recréé de plus. Vérifie-la sur Vinted, puis fusionne les deux fiches de cet article depuis l'app.",
    };
  }
  // (13/11) Une annonce apparue pendant nos envois que les photos ne tranchent pas encore : RETENUE, quelle que soit
  // l'extension (jamais servie : ce serait peut-être un second envoi) ; ses photos sont empreintées ; 6 h → la question.
  if (juge.douteuses.length) {
    const numeros = juge.douteuses.map((d) => String(d.fiche.vinted_item_id));
    const depuis = ms(objet(pf0.recreation_attente_releve)?.depuis);
    const depuisMs = Number.isFinite(depuis) ? depuis : maintenant;
    pf.recreation_attente_releve = { depuis: iso(depuisMs), essai: iso(v.essai), motif: "copie_possible_photos_a_comparer",
      copies_possibles: numeros.slice(0, 5) };
    if (maintenant - depuisMs > ATTENTE_RELEVE_MAX_H * 3600_000) {
      delete pf.recreation_empreintes_demandees;
      pf.needs_user_source = "recreation_deja_partie";
      pf.recreation_deja_partie = { le: iso(maintenant), essai: iso(v.essai), copies_possibles: numeros.slice(0, 5), motif: "photos_non_comparees" };
      return { action: "question", platform_fields: pf, douteuses: juge.douteuses, error: messageQuestionCopiePossible(numeros) };
    }
    const demandee = ms(objet(pf0.recreation_empreintes_demandees)?.le);
    const relancer = juge.aEmpreinter.length && !(Number.isFinite(demandee) && maintenant - demandee < EMPREINTES_RELANCE_MS);
    if (relancer) pf.recreation_empreintes_demandees = { le: iso(maintenant), n: juge.aEmpreinter.length };
    return { action: "retenir", platform_fields: pf, douteuses: juge.douteuses, error: MESSAGE_COPIE_A_VERIFIER,
      empreintes_a_calculer: relancer ? juge.aEmpreinter : [] };
  }
  // (25/10) Un dépôt d'issue inconnue après le dernier envoi : retenue pour TOUTES
  // les versions, jusqu'à la preuve (cf. en-tête) — jamais un second envoi sans elle.
  const incertain = depotIncertainApresEnvoi(pf0, v.essai);
  // Relecture de l'extension fiable (pas de mur de brouillons, ou 0.6.128+) : servie comme avant.
  if (!pageUneAveugle && !incertain) return null;
  const fait = releveQualifiant(releves, v.essai);
  if (fait) {
    delete pf.recreation_attente_releve;
    delete pf.recreation_empreintes_demandees;
    pf.recreation_verifiee = { essai: iso(v.essai), releve: fait.id ?? null, le: iso(maintenant), copies: 0, ...(incertain ? { apres: "depot_incertain" } : {}) };
    return { action: "servir", platform_fields: pf, error: null };
  }
  const depuis = ms(objet(pf0.recreation_attente_releve)?.depuis);
  const depuisMs = Number.isFinite(depuis) ? depuis : maintenant;
  pf.recreation_attente_releve = { depuis: iso(depuisMs), essai: iso(v.essai), ...(incertain ? { motif: "depot_incertain" } : {}) };
  if (maintenant - depuisMs > ATTENTE_RELEVE_MAX_H * 3600_000) {
    pf.needs_user_source = "recreation_deja_partie";
    return {
      action: "question", platform_fields: pf,
      error: incertain ? messageQuestionDepotIncertain(v.essai, incertain.motif || MOTIF_PROFIL)
        : "Un essai précédent a peut-être déjà remis ton annonce en ligne sur Vinted, et ton dressing n'a pas pu être relu " +
        "depuis. Pour ne jamais la mettre en double, on ne la redépose pas à l'aveugle : regarde ton dressing Vinted — si elle y " +
        "est, il n'y a rien à faire ; sinon relance la republication d'un clic.",
    };
  }
  return { action: "retenir", platform_fields: pf, error: incertain ? MESSAGE_DEPOT_INCERTAIN : MESSAGE_ATTENTE };
}
