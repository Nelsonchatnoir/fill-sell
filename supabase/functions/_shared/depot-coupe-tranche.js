// ═══════════════════════════════════════════════════════════════════════════
// UN DÉPÔT OU UNE REMISE EN LIGNE COUPÉS SE TRANCHENT AU RELEVÉ (25/10 nuit, Nico)
// ═══════════════════════════════════════════════════════════════════════════
// « Un dépôt ou une recréation coupé(e) doit être tranché(e) seul(e) par le
// relevé (rattacher si l'annonce existe, relancer une fois si elle n'existe
// pas), jamais laissé(e) des jours en « à confirmer ». » (Nico, 24/10 nuit)
//
// CE QUI SE PASSAIT (prouvé en base le 25/10) :
//  · louis (Amiral, Leboncoin), remises en ligne coupées le 21/10 sur la page
//    /deposer-une-annonce/options (« message channel closed ») : la question
//    « une annonce pourrait correspondre » (recreation_deja_partie) était posée
//    une fois puis plus jamais relue. Les deux annonces suspectes (3292326913,
//    3292489182) ont été vues deux fois le 21/10 puis plus jamais par AUCUN des
//    relevés complets suivants (quatre de louis, sept de la boutique partagée) :
//    l'article n'était plus en ligne nulle part, la question attendait toujours ;
//  · les empreintes des photos des annonces candidates n'étaient jamais
//    calculées (aucune ligne photo_empreintes) : la preuve par les photos de
//    notre copie ne pouvait pas jouer, ni à la question, ni ensuite ;
//  · les dépôts Beebs coupés (depot_deja_parti, Ciddjy) n'étaient relus par
//    personne après la question.
//
// LA RÈGLE (Leboncoin et Beebs, publication et remise en ligne — les seules
// plateformes où ces questions existent ; jamais Vinted, qui a sa règle :
// recreation-vinted-verifiee.js) — un job en question « peut-être déjà
// partie » est relu après chaque relevé :
//  · une annonce apparue depuis l'essai, ENCORE relevée, que l'identifiant
//    conservé ou les photos de NOTRE copie désignent (seule) → rattachée
//    (published), aucun redépôt ;
//  · ses photos (ou celles de notre copie) n'ont pas encore d'empreinte → on
//    les fait calculer et on rejuge au passage suivant ;
//  · plus aucune candidate en ligne — chacune absente de DEUX relevés COMPLETS
//    du compte commencés après sa dernière vue (même exigence que les retraits
//    et les introuvables), ou aucune candidate du tout après un relevé complet
//    postérieur à l'essai → le dépôt n'existe pas : le job repart UNE fois,
//    vérification tracée (plus de nouvelle question pour le même essai) ;
//  · une candidate encore en ligne qu'aucune preuve ne désigne → la question
//    reste : le doute ne se tranche jamais seul (titre, prix, date ne prouvent
//    rien) ;
//  · déjà relancé une fois par cette règle → plus rien d'automatique.
// La « dernière vue » d'une annonce se lit sur TOUTES ses lignes (une boutique
// partagée entre deux comptes FillSell écrit parfois sous l'autre compte).
// Pur (Deno + Node) : scripts/depot-coupe-tranche-selftest.mjs.

import { releveComplet } from "./introuvable-a-confirmer.js";
import { trancherParPhotos } from "./annonce-partagee.js";
import { numeroteeAvantLeDepot } from "./retrait-introuvable.js";
import { urlsPhotos, depotInacheveLbc } from "./recreation-deja-partie.js";

export const SOURCES_DEPOT_COUPE = Object.freeze(["recreation_deja_partie", "depot_deja_parti"]);
export const PLATEFORMES_DEPOT_COUPE = Object.freeze(["leboncoin", "beebs"]);
export const RELEVES_POUR_ABSENCE = 2;
export const RELANCES_MAX = 1;
export const EMPREINTES_PAR_APPEL = 8;
// Aucune annonce apparue : le relevé qui le prouve doit commencer au moins 1 h après l'essai (une annonce en
// vérification chez la plateforme a eu le temps d'apparaître dans « Mes annonces » — les dépôts de louis y
// figuraient 3 à 8 min après l'envoi).
export const DELAI_SANS_CANDIDATE_MS = 60 * 60_000;

const MARGE_DEPOT_MS = 10 * 60_000;
const MARGE_VUE_MS = 60_000;
const ms = (v) => { const t = Date.parse(String(v ?? "")); return Number.isFinite(t) ? t : NaN; };
const idNum = (s) => (/^\d+$/.test(String(s ?? "")) ? BigInt(String(s)) : null);

/** Le job est-il une question « peut-être déjà partie » que cette règle relit ? */
export function estDepotCoupe(job) {
  const pf = job?.platform_fields ?? {};
  if (job?.status !== "needs_user") return false;
  if (!PLATEFORMES_DEPOT_COUPE.includes(String(job?.platform ?? ""))) return false;
  const src = String(pf.needs_user_source ?? "");
  if (src === "recreation_deja_partie") return job.action === "republish" && pf.republish_step === "deleted" && !!pf.deleted_at;
  if (src === "depot_deja_parti") return job.action === "publish";
  return false;
}

/** L'essai suspect (celui qui a pu envoyer le dépôt) et le point de départ des candidates. */
export function reperesDuJob(job) {
  const pf = job?.platform_fields ?? {};
  const src = String(pf.needs_user_source ?? "");
  if (src === "recreation_deja_partie") {
    const retrait = ms(pf.deleted_at);
    const essai = ms(pf.recreation_deja_partie?.essai?.at);
    return {
      source: src,
      essai: Number.isFinite(essai) ? essai : retrait,
      depuis: retrait,
      ancienId: String(pf.old_platform_listing_id ?? "").trim()
        || (String(pf.old_listing_url ?? "").match(/(\d{6,})(?:[/?#]|$)/)?.[1] ?? ""),
      question: ms(pf.recreation_deja_partie?.le),
    };
  }
  const essai = ms(pf.depot_deja_parti?.essai?.at);
  return {
    source: src,
    essai,
    depuis: Number.isFinite(essai) ? essai - MARGE_DEPOT_MS : NaN,
    ancienId: "",
    question: ms(pf.depot_deja_parti?.le),
  };
}

/** La dernière vue d'une annonce, toutes ses lignes confondues. */
export function derniereVue(listingId, lignes) {
  let max = NaN;
  for (const l of Array.isArray(lignes) ? lignes : []) {
    if (String(l?.listing_id ?? "") !== String(listingId)) continue;
    const v = ms(l?.vu_le);
    if (Number.isFinite(v) && !(max >= v)) max = v;
  }
  return max;
}

/** Les relevés qui peuvent prouver une absence (complets, non vides, finis). */
export function relevesProbants(runs, platform) {
  return (Array.isArray(runs) ? runs : []).filter((r) => releveComplet(r, { platform }));
}

/**
 * Une candidate est-elle encore en ligne ? « absente » = deux relevés complets du compte, commencés après sa
 * dernière vue (toutes lignes), ne l'ont pas vue ; ou le relevé l'a datée disparue et ne l'a pas revue depuis.
 */
export function presenceCandidate(c, lignes, probants) {
  const vu = derniereVue(c?.listing_id, lignes);
  const vuLe = Number.isFinite(vu) ? vu : ms(c?.created_at);
  const disparu = ms(c?.disparu_le);
  if (Number.isFinite(disparu) && !(vuLe > disparu)) return { etat: "absente", preuve: "datée disparue par le relevé" };
  const sans = probants.filter((r) => ms(r?.started_at) - MARGE_VUE_MS > vuLe);
  if (sans.length >= RELEVES_POUR_ABSENCE) {
    return { etat: "absente", preuve: `absente de ${sans.length} relevés complets faits après sa dernière vue`, releves: sans.map((r) => String(r.id ?? "")) };
  }
  return { etat: "presente", preuve: sans.length ? "absente d'un seul relevé complet depuis sa dernière vue" : "vue au dernier relevé" };
}

/** Les annonces qui peuvent être ce dépôt (sans juger leur présence). */
export function candidatesDepotCoupe(job, lignes) {
  const rep = reperesDuJob(job);
  if (!Number.isFinite(rep.depuis)) return [];
  const ancien = idNum(rep.ancienId);
  const inv = job?.inventaire_id == null ? null : String(job.inventaire_id);
  const vus = new Set();
  const out = [];
  for (const l of Array.isArray(lignes) ? lignes : []) {
    if (!l || !l.listing_id) continue;
    // Une seule ligne par annonce : celle du compte du job d'abord.
    if (l.user_id != null && job?.user_id != null && String(l.user_id) !== String(job.user_id)) continue;
    const id = String(l.listing_id);
    if (vus.has(id) || id === String(rep.ancienId || "")) continue;
    if (l.retiree_le) continue;
    // Rattachée à un autre job ou à une autre fiche : ce n'est pas ce dépôt.
    if (l.job_id && String(l.job_id) !== String(job?.id)) {
      const memeFiche = inv != null && l.inventaire_id != null && String(l.inventaire_id) === inv;
      if (!memeFiche) continue;
    }
    if (l.inventaire_id != null && inv != null && String(l.inventaire_id) !== inv) continue;
    const cree = ms(l.created_at);
    if (!Number.isFinite(cree) || cree < rep.depuis) continue;
    const n = idNum(id);
    if (ancien != null && n != null && n <= ancien) continue;
    if (rep.source === "depot_deja_parti"
      && numeroteeAvantLeDepot(String(job.platform), l, { lignes, depotLe: new Date(rep.essai).toISOString() })) continue;
    vus.add(id);
    out.push(l);
  }
  return out;
}

/** Les URL de photos d'une annonce relevée (capture d'abord, vignette ensuite). */
export function urlsCandidate(c) {
  return [...new Set([...urlsPhotos(c?.capture?.photos, 4), ...urlsPhotos([c?.photo_url], 1)])];
}

/**
 * LA DÉCISION, pure.
 * @param {{ job: any, lignes: any[], runs: any[], empreinte: (url: string) => any }} arg
 *   job       : le job en question (id, user_id, platform, action, status, photos, inventaire_id, platform_fields) ;
 *   lignes    : annonces_plateforme de la plateforme créées depuis le retrait / l'essai — celles du compte, et les
 *               lignes d'AUTRES comptes portant les mêmes numéros (boutique partagée : leur vu_le compte) ;
 *   runs      : relevés « annonces » de CE compte sur la plateforme (status, started_at, finished_at, items_vus,
 *               total_entries, erreur, id) ;
 *   empreinte : url → ligne photo_empreintes, ou undefined.
 * @returns {{ decision: 'rattacher'|'relancer'|'empreintes'|'question'|'attendre', raison: string, [k: string]: any }}
 */
export function decisionDepotCoupe({ job, lignes = [], runs = [], empreinte = () => undefined }) {
  if (!estDepotCoupe(job)) return { decision: "attendre", raison: "pas une question « peut-être déjà partie »" };
  const pf = job.platform_fields ?? {};
  if ((Number(pf.relance_depot_coupe?.n) || 0) >= RELANCES_MAX) {
    return { decision: "attendre", raison: "déjà relancé une fois par le relevé" };
  }
  const rep = reperesDuJob(job);
  if (!Number.isFinite(rep.essai)) return { decision: "attendre", raison: "essai suspect illisible" };
  const platform = String(job.platform);
  const probants = relevesProbants(runs, platform);
  const apresEssai = probants.filter((r) => ms(r.started_at) > rep.essai);
  if (!apresEssai.length) return { decision: "attendre", raison: "aucun relevé complet après l'essai" };
  const dernier = apresEssai.reduce((a, b) => (ms(b.started_at) > ms(a.started_at) ? b : a));

  const candidates = candidatesDepotCoupe(job, lignes);
  // (29/10, louis 68e39f7c) Le dépôt Leboncoin inachevé d'un essai arrêté sur /options (statut « inactive », aucune
  // date de mise en ligne) n'est pas en ligne et ne le sera jamais : il ne retient pas le redépôt
  // (recreation-deja-partie.js depotInacheveLbc).
  const etats = candidates.map((c) => (depotInacheveLbc(platform, pf, c, { depuis: rep.depuis })
    ? { c, etat: "absente", preuve: "dépôt Leboncoin inachevé (essai arrêté sur l'écran « options », jamais vu en ligne, aucune date de mise en ligne)" }
    : { c, ...presenceCandidate(c, lignes, probants) }));
  const presentes = etats.filter((e) => e.etat === "presente").map((e) => e.c);
  const absentes = etats.filter((e) => e.etat === "absente");

  if (!presentes.length) {
    if (!candidates.length && !apresEssai.some((r) => ms(r.started_at) >= rep.essai + DELAI_SANS_CANDIDATE_MS)) {
      return { decision: "attendre", raison: "aucune annonce apparue, mais aucun relevé complet 1 h après l'essai" };
    }
    return {
      decision: "relancer",
      raison: candidates.length
        ? `${candidates.length} annonce(s) apparue(s) depuis l'essai, plus en ligne (${absentes.map((e) => e.preuve).join(" ; ")})`
        : "aucune annonce apparue depuis l'essai, relevé complet à l'appui",
      releve: String(dernier.id ?? ""),
      absentes: absentes.map((e) => ({ listing_id: String(e.c.listing_id), preuve: e.preuve })),
    };
  }

  // Une candidate encore en ligne : l'identifiant conservé d'abord, puis les photos de NOTRE copie.
  const prouve = String(pf.new_platform_listing_id ?? "").trim();
  if (prouve && presentes.length === 1 && String(presentes[0].listing_id) === prouve
    && /^(en_ligne|en_verification)$/.test(String(presentes[0].statut_plateforme ?? ""))) {
    return { decision: "rattacher", raison: "identifiant conservé après le dépôt", annonce: presentes[0], preuve: "identifiant conservé après le dépôt" };
  }
  const urlsCopie = urlsPhotos(job.photos);
  const manquantes = [];
  const copie = [];
  for (const u of urlsCopie) { const e = empreinte(u); if (e) copie.push(e); else manquantes.push(u); }
  const parCandidate = new Map();
  for (const c of presentes) {
    const us = urlsCandidate(c);
    const es = [];
    for (const u of us) { const e = empreinte(u); if (e) es.push(e); else manquantes.push(u); }
    parCandidate.set(String(c.listing_id), es);
  }
  const sansEmpreinte = !copie.length || [...parCandidate.values()].some((es) => !es.length);
  if (sansEmpreinte && manquantes.length) {
    return { decision: "empreintes", raison: "photos pas encore empreintées", urls: [...new Set(manquantes)].slice(0, EMPREINTES_PAR_APPEL) };
  }
  const ph = trancherParPhotos(copie, parCandidate);
  const retenue = ph.fiche ? presentes.find((c) => String(c.listing_id) === String(ph.fiche)) : null;
  if (retenue && /^(en_ligne|en_verification)$/.test(String(retenue.statut_plateforme ?? ""))) {
    return { decision: "rattacher", raison: "photos identiques à celles de notre copie", annonce: retenue, preuve: "photos identiques à celles de notre copie", photos: ph.niveaux };
  }
  return {
    decision: "question",
    raison: presentes.length > 1 ? `${presentes.length} annonces encore en ligne depuis l'essai` : "une annonce encore en ligne qu'aucune preuve ne désigne",
    presentes: presentes.map((c) => String(c.listing_id)),
    photos: ph.niveaux,
  };
}

/**
 * Appariement mutuel sur un compte : une annonce désignée par deux jobs n'est donnée à aucun (deux exemplaires
 * aux mêmes photos) — ils restent en question. Pur. `decisions` : Map(jobId → décision).
 */
export function appariementMutuel(decisions) {
  const parAnnonce = new Map();
  for (const [id, d] of decisions) {
    if (d?.decision !== "rattacher") continue;
    const lid = String(d.annonce?.listing_id ?? "");
    parAnnonce.set(lid, [...(parAnnonce.get(lid) ?? []), id]);
  }
  const out = new Map(decisions);
  for (const [lid, ids] of parAnnonce) {
    if (ids.length < 2) continue;
    for (const id of ids) out.set(id, { decision: "question", raison: `l'annonce ${lid} est désignée par ${ids.length} dépôts`, presentes: [lid] });
  }
  return out;
}

// Les champs d'attente que « Relancer » (app) efface.
const CHAMPS_LEVES = [
  "needs_user_source", "needsUserField", "needs_user_tick_le", "needs_user_actif_ms", "needs_user_vu_le",
  "needs_user_vu_erreur", "next_action_after", "processing_since", "attente_session", "refus_passager",
  "recreation_attente_depuis", "depot_attente_releve_depuis",
];

/**
 * Le patch d'une relance (aucune annonce en ligne) : même geste que « Relancer », plus la vérification tracée
 * qui empêche get-pending-jobs de reposer la même question pour le même essai. L'archivage du motif est fait
 * par l'appelant (archiverErreur). Pur.
 * @param {any} job
 * @param {any} d
 * @param {{ maintenant?: string, posePar?: string }} [opts]
 */
export function patchRelanceDepotCoupe(job, d, { maintenant = new Date().toISOString(), posePar = "handler-watch" } = {}) {
  const pf = { ...(job?.platform_fields ?? {}) };
  for (const k of CHAMPS_LEVES) delete pf[k];
  pf.needsUserAttempts = 0;
  const trace = { apres: maintenant, le: maintenant, releve: d?.releve ?? null, verdict: "aucune_en_ligne", absentes: d?.absentes ?? [] };
  if (job?.action === "republish") pf.recreation_verifiee = trace;
  else pf.depot_verifie = trace;
  pf.relance_depot_coupe = {
    le: maintenant, n: (Number(pf.relance_depot_coupe?.n) || 0) + 1, raison: d?.raison ?? null,
    releve: d?.releve ?? null, absentes: d?.absentes ?? [], statut_avant: job?.status ?? null,
    pose_par: `${posePar} (dépôt coupé tranché au relevé : aucune annonce en ligne, relance unique)`,
  };
  return { status: "pending", error: null, platform_fields: pf };
}

/**
 * Le patch d'un rattachement (identité prouvée) : le job devient « published » sur l'annonce déjà partie, sans
 * redépôt. Remise en ligne : étape « recreated » (même forme que get-pending-jobs) ; dépôt : `lien_par_photos`
 * (même forme que le dépôt Beebs vérifié). Pur.
 * @param {any} job
 * @param {any} d
 * @param {{ maintenant?: string, posePar?: string, lienDepuisId?: ((platform: string, id: unknown) => string | null) | null }} [opts]
 */
export function patchRattachementDepotCoupe(job, d, { maintenant = new Date().toISOString(), posePar = "handler-watch", lienDepuisId = null } = {}) {
  const c = d?.annonce ?? {};
  const listingId = String(c.listing_id ?? "");
  const statutEnLigne = String(c.statut_plateforme ?? "") === "en_ligne";
  // (26/10, Elodie82) Un lien Leboncoin de relevé sans rayon réel (/ad/<id>) mène à une 404 : jamais recopié tel quel.
  const lienReleve = String(c.url ?? "");
  const lienFauxLbc = String(job?.platform) === "leboncoin" && lienReleve && !/^https:\/\/www\.leboncoin\.fr\/ad\/(?!ad\/|x\/)[a-z_]+\/\d{6,}/.test(lienReleve);
  const url = (lienFauxLbc ? null : lienReleve) || ((statutEnLigne || lienFauxLbc) && typeof lienDepuisId === "function" ? lienDepuisId(String(job?.platform), listingId) : null) || null;
  const pf = { ...(job?.platform_fields ?? {}) };
  for (const k of CHAMPS_LEVES) delete pf[k];
  const trace = { apres: maintenant, le: maintenant, verdict: "certaine", listing_id: listingId, preuve: d?.preuve ?? null };
  if (job?.action === "republish") {
    pf.republish_step = "recreated";
    pf.recreated_at = String(c.created_at ?? maintenant);
    pf.new_listing_url = url;
    pf.recreation_verifiee = trace;
    pf.rattachement_recreation = {
      le: maintenant, listing_id: listingId, preuve: d?.preuve ?? null, ...(d?.photos ? { photos: d.photos } : {}),
      pose_par: `${posePar} (remise en ligne coupée, annonce déjà partie : identité prouvée)`,
    };
  } else {
    pf.depot_verifie = trace;
    pf.lien_par_photos = { at: maintenant, listing_id: listingId, preuve: d?.preuve ?? null, photos: d?.photos ?? null, statut: c.statut_plateforme ?? null };
  }
  return {
    status: "published", error: null, published_at: job?.action === "republish" ? maintenant : (pf.depot_deja_parti?.essai?.at ?? maintenant),
    platform_listing_id: listingId, ...(url ? { listing_url: url } : {}), platform_fields: pf,
  };
}
