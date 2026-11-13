// ═══════════════════════════════════════════════════════════════════════════
// LEBONCOIN : UNE ANNONCE REFUSÉE NE REPART JAMAIS À L'IDENTIQUE (13/11/2026, lot du 13/11 — 3e réponse de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Décision de Nico : « Relance à l'identique d'une annonce déjà refusée : bloquée tant que rien n'a changé. Le vendeur
// est invité à modifier l'annonce avant de la relancer. » Cas : 229c7b07, « Topps … Anna #9 » refusée cinq fois et plus
// (137ea70c relancé tel quel, puis sa copie 5adbc272) — rien n'empêchait la relance à l'identique.
//
// LA RÈGLE (tous comptes, comme Beebs depuis le 29/10 — src/utils/empreinteContenu.js) :
//   · get-pending-jobs note, sur chaque publication Leboncoin qu'il sert, l'empreinte de ce qui part
//     (platform_fields.lbc_envois : { le, servie, brute, regles }) — `servie` sur le titre et le texte NETTOYÉS (ce que
//     Leboncoin reçoit), `brute` sur la tâche telle qu'en base ;
//   · un dépôt refusé porte la marque du juge (depot_jamais_en_ligne « refus_moderation_probable » : la base,
//     trancher_publications_sans_lien ; jamais_en_ligne : handler-watch ; relance_apres_depot_mort : la relance de l'app) ;
//   · une PUBLICATION Leboncoin servie dont l'empreinte est celle d'un dépôt refusé de la MÊME fiche ne part pas :
//     needs_user « refus_lbc_meme_contenu », message qui invite à modifier l'annonce, rien envoyé, aucune tentative ;
//   · refus d'avant cette règle (rien de noté) : le contenu brut de la tâche refusée fait foi, SEULEMENT si le nettoyage
//     d'aujourd'hui sert son titre et son texte tels quels — sinon ce qui partirait a changé (IKKS, f0acd3af : 9 mots-clés
//     servis le 12/11, 5 depuis la règle du 13/11) et l'on ne conclut rien ;
//   · jamais : une autre fiche (jamais sur un titre), une remise en vente (la règle A attend que l'annonce vendue parte),
//     une republication (son contenu est celui de l'annonce en ligne, acceptée), un refus suivi d'une acceptation vue en
//     ligne de la même tâche.
// Le bouton « Relancer » de l'app (StockTab) lit la même règle : tâche retenue, ou dépôt refusé à l'empreinte notée sous
// les règles du texte d'aujourd'hui, et contenu inchangé → il le dit et ne relance pas ; sinon le serveur décide.
// Pur, sans dépendance hors src/utils (navigateur, Deno par ../../../src/utils/relanceRefusLbc.js, Node).
import { empreinteEnvoiLbcDuJob } from "./empreinteContenu.js";

export const SOURCE_REFUS_LBC_MEME_CONTENU = "refus_lbc_meme_contenu";
export const CLE_ENVOIS_LBC = "lbc_envois";
export const MAX_ENVOIS_LBC = 5;
// Les règles du texte SERVI à Leboncoin (supabase/functions/_shared/description-leboncoin.ts : mentions de sites, marques
// tierces, cinq mots-clés, minimum de 10 caractères, titre). Changer ce fichier change ce qui part : changer AUSSI cette
// version et son md5 ci-dessous (verrou : scripts/lbc-relance-identique-selftest.mjs).
export const REGLES_TEXTE_LBC = "lbc-texte-1311";
export const SOURCES_REGLES_TEXTE_LBC = Object.freeze({ "lbc-texte-1311": "0b3e2982ab20ebefde4205a8f05b37db" });

export const MESSAGE_BOUTON_REFUS_LBC = Object.freeze({
  fr: "Modifie d'abord l'annonce (texte, photos, prix ou catégorie) : Leboncoin refuserait la même annonce",
  en: "Change the listing first (text, photos, price or category): Leboncoin would refuse the same listing",
});

const objet = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const ms = (v) => { const t = Date.parse(String(v ?? "")); return Number.isFinite(t) ? t : NaN; };
const actionDe = (job) => String(job?.action ?? "publish");

/**
 * La marque du refus Leboncoin que porte ce job, ou null.
 * @returns {null | { source: string, juge_le: string|null, numero: string|null }}
 */
export function refusLbcDe(job) {
  if (job?.platform !== "leboncoin" || !["publish", "republish"].includes(actionDe(job))) return null;
  const pf = objet(job.platform_fields);
  const dje = objet(pf.depot_jamais_en_ligne);
  if (dje.issue === "refus_moderation_probable") {
    const ids = Array.isArray(dje.identifiants) ? dje.identifiants : [];
    return { source: "depot_jamais_en_ligne", juge_le: dje.le ?? null, numero: String(ids[0] ?? job.platform_listing_id ?? "").trim() || null };
  }
  const jel = objet(pf.jamais_en_ligne);
  if (Object.keys(jel).length && (jel.regle || jel.numero)) {
    return { source: "jamais_en_ligne", juge_le: jel.at ?? null, numero: String(jel.numero ?? "").trim() || null };
  }
  const rad = objet(pf.relance_apres_depot_mort);
  const constat = objet(rad.constat);
  if (rad.issue === "refus_moderation_probable" || constat.issue === "refus_moderation_probable") {
    return { source: "relance_apres_depot_mort", juge_le: constat.le ?? constat.at ?? rad.le ?? null, numero: String(rad.identifiant ?? "").trim() || null };
  }
  return null;
}

/** Le dernier envoi noté AVANT l'instant du refus (celui qui a été refusé), ou null. */
export function envoiLbcAvant(job, jugeLe) {
  const liste = objet(job?.platform_fields)[CLE_ENVOIS_LBC];
  if (!Array.isArray(liste)) return null;
  const t = ms(jugeLe);
  if (!Number.isFinite(t)) return null;
  let trouve = null;
  for (const e of liste) {
    if (!e || typeof e !== "object" || typeof e.servie !== "string") continue;
    const le = ms(e.le);
    if (Number.isFinite(le) && le <= t && (!trouve || le >= ms(trouve.le))) trouve = e;
  }
  return trouve;
}

/**
 * La liste des envois à écrire quand on sert `entree` ({ le, servie, brute, regles }), ou null quand le dernier envoi
 * noté est déjà celui-là (rien à écrire : jamais une ligne inchangée réécrite).
 */
export function envoisLbcApres(pf, entree) {
  const liste = Array.isArray(objet(pf)[CLE_ENVOIS_LBC]) ? objet(pf)[CLE_ENVOIS_LBC].filter((e) => e && typeof e === "object") : [];
  const dernier = liste[liste.length - 1];
  if (dernier && dernier.servie === entree.servie && dernier.brute === entree.brute && dernier.regles === entree.regles) return null;
  return [...liste, { le: entree.le, servie: entree.servie, brute: entree.brute, regles: entree.regles }].slice(-MAX_ENVOIS_LBC);
}

/**
 * Le juge du serveur. `cand` = { job, servie, brute, texteInchange } (empreintes de ce que le serveur servirait
 * maintenant ; texteInchange : le nettoyage d'aujourd'hui sert le titre et le texte de la tâche tels quels) ;
 * `lignes` = les tâches Leboncoin de la même fiche portant une marque de refus, { job, texteInchange }.
 * @returns {null | { refuse: string, numero: string|null, source: string, juge_le: string|null, par: "envoi"|"contenu" }}
 */
export function refusLbcIdentique(cand, lignes = []) {
  const job = cand?.job;
  if (job?.platform !== "leboncoin" || actionDe(job) !== "publish") return null;
  if (objet(job.platform_fields).remise_en_vente) return null;
  if (!cand.servie && !cand.brute) return null;
  const fiche = String(job.inventaire_id ?? "");
  const dossiers = [];
  // Les autres tâches de la fiche d'abord (une copie porte la relance_apres_depot_mort de sa source : le dépôt refusé
  // est celui de la source).
  for (const l of Array.isArray(lignes) ? lignes : []) {
    const r = l?.job;
    if (!r || String(r.id) === String(job.id) || !fiche || String(r.inventaire_id ?? "") !== fiche) continue;
    const refus = refusLbcDe(r);
    if (refus) dossiers.push({ r, refus, texteInchange: l.texteInchange === true, soi: false });
  }
  const propre = refusLbcDe(job);
  if (propre) dossiers.push({ r: job, refus: propre, texteInchange: cand.texteInchange === true, soi: true });
  for (const { r, refus, texteInchange, soi } of dossiers) {
    // Refusée puis relancée, acceptée et vue en ligne depuis : ce refus ne dit plus rien.
    if (!soi && r.status === "published" && ms(r.vu_en_ligne_le) > ms(refus.juge_le)) continue;
    const envoi = envoiLbcAvant(r, refus.juge_le);
    const base = { refuse: String(r.id), numero: refus.numero, source: refus.source, juge_le: refus.juge_le };
    if (envoi) {
      if (cand.servie && envoi.servie === cand.servie) return { ...base, par: "envoi" };
      continue;
    }
    // Refus d'avant la règle : le contenu brut, quand le nettoyage d'aujourd'hui n'y change rien des deux côtés.
    if (!cand.texteInchange || !texteInchange || !cand.brute) continue;
    const e = soi ? cand.brute : empreinteEnvoiLbcDuJob(r);
    if (e && e === cand.brute) return { ...base, par: "contenu" };
  }
  return null;
}

/** Le message de la retenue (écrit en base en français ; l'app le lit en anglais par utils/messagesServeur.js). */
export function messageRefusLbcMemeContenu(lang = "fr") {
  if (lang === "en") {
    return "Leboncoin refused this listing, and it would go out again unchanged: same title, same text, same photos, same "
      + "price, same category — Leboncoin would refuse it again. Nothing was sent to Leboncoin. Change the listing first "
      + "(Leboncoin's reason is in its email “Your listing … was refused”), then publish it again.";
  }
  return "Leboncoin a refusé cette annonce, et elle repartirait à l'identique : même titre, même texte, mêmes photos, même "
    + "prix, même catégorie — Leboncoin la refuserait de même. Rien n'a été envoyé à Leboncoin. Modifie d'abord l'annonce "
    + "(le motif de Leboncoin est dans son mail « Votre annonce … a été refusée »), puis publie-la de nouveau.";
}

/**
 * Ce que le serveur écrit sur la tâche retenue. `verdict` = refusLbcIdentique(…) ; `brute`/`servie` : les empreintes de
 * la tâche. Rend { status, error, platform_fields }.
 * @param {any} job @param {any} verdict
 * @param {{ brute?: string|null, servie?: string|null, maintenant?: number, par?: string }} [o]
 * @returns {{ status: string, error: string, platform_fields: Record<string, any> }}
 */
export function patchRetenueRefusLbc(job, verdict, { brute = null, servie = null, maintenant = Date.now(), par = "get-pending-jobs" } = {}) {
  const pf = { ...objet(job?.platform_fields) };
  pf.needs_user_source = SOURCE_REFUS_LBC_MEME_CONTENU;
  pf[SOURCE_REFUS_LBC_MEME_CONTENU] = {
    le: new Date(maintenant).toISOString(), refuse: verdict?.refuse ?? null, numero_refuse: verdict?.numero ?? null,
    source: verdict?.source ?? null, refuse_le: verdict?.juge_le ?? null, par_empreinte: verdict?.par ?? null,
    brute, servie, regles: REGLES_TEXTE_LBC, pose_par: par,
  };
  delete pf.processing_since;
  return { status: "needs_user", error: messageRefusLbcMemeContenu("fr"), platform_fields: pf };
}

/**
 * Le geste « Relancer » de l'app : relancer ce job redéposerait-il ce que Leboncoin a refusé ?
 * @returns {null | { verdict: "meme_contenu" | "contenu_modifie" | "a_verifier", refus: Record<string, unknown> }}
 *   null : rien de connu (le serveur décide au service) ; « a_verifier » : la liste n'a pas le contenu du job.
 */
export function relanceRefusLbc(job) {
  if (job?.platform !== "leboncoin" || actionDe(job) !== "publish") return null;
  const pf = objet(job.platform_fields);
  const tenue = objet(pf[SOURCE_REFUS_LBC_MEME_CONTENU]);
  if (pf.needs_user_source === SOURCE_REFUS_LBC_MEME_CONTENU && typeof tenue.brute === "string" && tenue.regles === REGLES_TEXTE_LBC) {
    const e = empreinteEnvoiLbcDuJob(job);
    if (!e) return { verdict: "a_verifier", refus: tenue };
    return { verdict: e === tenue.brute ? "meme_contenu" : "contenu_modifie", refus: tenue };
  }
  if (pf.remise_en_vente) return null;
  const refus = refusLbcDe(job);
  if (!refus) return null;
  const envoi = envoiLbcAvant(job, refus.juge_le);
  if (!envoi || envoi.regles !== REGLES_TEXTE_LBC || typeof envoi.brute !== "string") return null;
  const e = empreinteEnvoiLbcDuJob(job);
  if (!e) return { verdict: "a_verifier", refus };
  return { verdict: e === envoi.brute ? "meme_contenu" : "contenu_modifie", refus };
}
