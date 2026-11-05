// ═══════════════════════════════════════════════════════════════════════════
// LES RETRAITS NON TERMINÉS DEPUIS PLUS DE 24 H : LE VRAI RISQUE DE DOUBLE VENTE D'ABORD (05/11, R3)
// ═══════════════════════════════════════════════════════════════════════════
// Le 05/11, l'ops-digest (section 3) listait 34 retraits non terminés > 24 h, TOUS sous « risque de double vente » :
// 20 n'en étaient pas (15 suppressions d'article sans vente, 5 dépôts Beebs jamais en ligne), plus des postes muets
// depuis août et septembre, réécrits chaque jour — les 8 vrais risques étaient noyés.
// LA RÈGLE (tout le parc) : chaque retrait est jugé avec ce qui existe déjà en base, sans rien écrire —
//   · la vente de la fiche (inventaire.statut, ventes) ;
//   · la dernière preuve que l'annonce est en ligne (annonces_plateforme vu_le / statut_plateforme / disparu_le /
//     retiree_le du MÊME numéro, cross_post_jobs.vu_en_ligne_le et sale_signal du dépôt source, la page relue pendant
//     le retrait — lecture_etat_retrait —, le dernier instantané Vinted de l'annonce) ;
//   · le mur nommé (règles de src/utils/retraitsBloques.js, celles de « À régler » : connexion, boutique Vinted,
//     compte Vinted bloqué, Opla quittée ; plus la pause Leboncoin, l'autorisation Depop, le mur de connexion lu dans
//     « Mes annonces » Beebs, un needs_user) ;
//   · le poste qui doit le faire (profiles.extension_last_seen_at, l'exécutant d'une délégation Leboncoin compris).
// Trois blocs :
//   🔴 ROUGE  : article VENDU (fiche « vendu ») ET annonce vue en ligne après la vente, ou au plus 48 h avant elle sans
//              qu'aucune preuve plus récente ne la dise retirée — elle est achetable, le risque est réel ;
//   🟠 ORANGE : un geste attendu de la personne (mur nommé), ou un retrait qui n'avance pas sans mur ni preuve ;
//   ⚪ BLANC  : poste éteint, dépôt Beebs jamais en ligne (en vérification), suppression sans vente (fiche supprimée
//              ou article encore en stock), annonce déjà indisponible. Un poste muet depuis plus de 30 jours tient en
//              UNE ligne par compte, quel que soit le motif (le compte du rouge éventuel y est dit).
// Pur (Deno + Node) : ops-digest lit la base, ce module juge. Selftest : scripts/retraits-en-retard-selftest.mjs.
import {
  NOMS_PLATEFORME_RETRAIT, retraitBloqueParConnexion, retraitBloqueParCompteVinted, retraitBloqueParBoutique,
  retraitOplaQuittee, retraitBeebsEnVerification, retraitApresVente,
} from "../../../src/utils/retraitsBloques.js";
import { executantDe, pauseLeboncoinActive } from "./attente-extension-active.js";
import { numeroAnnonceDuJob } from "./retrait-deja-absent.js";

export const RETARD_MS = 24 * 3600_000;
/** Au plus 48 h entre la dernière vue en ligne et la vente : l'annonce était en vente quand l'article est parti. */
export const FENETRE_AVANT_VENTE_MS = 48 * 3600_000;
/** Un poste qui ne s'est pas montré depuis 24 h ne fera pas le retrait de lui-même. */
export const POSTE_ETEINT_MS = 24 * 3600_000;
/** Au-delà de 30 jours de silence : une ligne par compte, jamais une ligne par retrait. */
export const POSTE_MUET_LONG_MS = 30 * 86_400_000;

const objet = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
const ms = (v) => { if (v == null || v === "") return null; const t = Date.parse(String(v)); return Number.isFinite(t) ? t : null; };
const pfDe = (job) => objet(job?.platform_fields) ?? {};
const nomPf = (p) => NOMS_PLATEFORME_RETRAIT[p] ?? String(p ?? "?");
const plusRecente = (liste) => liste.filter((x) => x && x.le != null).sort((a, b) => b.le - a.le)[0] ?? null;

/** Date et heure de Paris, « 05/11 16:31 ». */
export function heureParis(t) {
  if (t == null || !Number.isFinite(t)) return "?";
  try {
    const d = new Date(t);
    const j = d.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit" });
    const h = d.toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });
    return `${j} ${h}`;
  } catch { return new Date(t).toISOString().slice(0, 16).replace("T", " "); }
}
const jours = (dureeMs) => Math.max(0, Math.floor(dureeMs / 86_400_000));
const duree = (dureeMs) => {
  const m = Math.max(0, Math.round(dureeMs / 60_000));
  if (m < 60) return `${m} min`;
  if (m < 48 * 60) return `${Math.round(m / 60)} h`;
  return `${Math.round(m / 1440)} j`;
};

// ── LE MUR DE CONNEXION LU DANS « MES ANNONCES » BEEBS (05/11, R1 — f3aec8cc, « Peignoir spiderman ») ──────────────
// beebs.js nomme le mur quand la lecture de « Mes annonces » est renvoyée vers la page de connexion de Beebs
// (onglets[].mur = "connexion", resumeLectureMesAnnonces) — et le retrait rendait un « nouvel essai, rien à faire »
// générique. Le mur ne compte que si AUCUN onglet n'a été lu (un onglet lu = la session est bonne).
/** Le mur de connexion porté par la dernière lecture de « Mes annonces » (Beebs), ou null. */
export function murConnexionLectureBeebs(pf) {
  const lu = objet(objet(pf)?.beebs_lecture_mes_annonces);
  const onglets = Array.isArray(lu?.onglets) ? lu.onglets.filter((o) => objet(o)) : [];
  if (!onglets.length || onglets.some((o) => o.ok === true)) return null;
  const murs = onglets.filter((o) => o.mur === "connexion");
  if (!murs.length) return null;
  return { lu_le: typeof lu.lu_le === "string" ? lu.lu_le : null, onglets: murs.length, motif: String(murs[0].motif ?? "").slice(0, 120) || null };
}

/**
 * Pour update-job-status : le mur lu par CE rapport d'un retrait Beebs (jamais un reste d'un essai précédent).
 * La lecture est de cet essai quand elle est datée de la prise en main (processing_since, 5 s de marge — même
 * horloge, celle du poste), ou quand le message de ce rapport parle de « Mes annonces » (le background ne réécrit
 * pas une lecture identique : un mur qui persiste garde la date du premier). Jamais après une suppression envoyée
 * (beebs_suppression_envoyee) : on ne dirait pas « encore en ligne » sans le savoir.
 */
export function murConnexionBeebsDeCeRapport(pf, erreur = "") {
  const p = objet(pf);
  if (!p || p.beebs_suppression_envoyee) return null;
  const mur = murConnexionLectureBeebs(p);
  if (!mur) return null;
  const lu = ms(mur.lu_le);
  const prise = ms(p.processing_since);
  const deCetEssai = (lu != null && prise != null && lu >= prise - 5_000) || /«\s*Mes annonces\s*»/i.test(String(erreur ?? ""));
  return deCetEssai ? mur : null;
}

// ── LA VENTE ─────────────────────────────────────────────────────────────────────────────────────────────────────
/** L'article est-il vendu (pièce unique ou stock épuisé) ? La fiche le dit ; fiche absente : une vente ou un retrait armé par la vente. */
export function articleVendu(job, fiche, ventes = []) {
  if (fiche) return String(fiche.statut ?? "") === "vendu";
  return (Array.isArray(ventes) && ventes.length > 0) || retraitApresVente(job, null);
}

/** Le moment de la vente (ms) : la dernière vente de la fiche (vendu_le, sinon son enregistrement), sinon l'armement du retrait. */
export function momentDeLaVente(job, ventes = []) {
  const t = (Array.isArray(ventes) ? ventes : []).map((v) => ms(v?.vendu_le) ?? ms(v?.created_at)).filter((x) => x != null);
  if (t.length) return Math.max(...t);
  return ms(objet(pfDe(job).arme_par)?.le) ?? ms(job?.created_at);
}

// ── LES PREUVES SUR L'ANNONCE ────────────────────────────────────────────────────────────────────────────────────
/**
 * @param {object} o
 * @param {object} o.job            le retrait (platform_fields : lecture_etat_retrait, retrait_en_attente_verification, beebs_en_moderation)
 * @param {object|null} o.source    le dépôt (arme_par.depot) : { status, vu_en_ligne_le, sale_signal, unavailable_since, pas_encore_visible }
 * @param {object[]} o.annonces     les lignes annonces_plateforme du MÊME numéro (même compte, même plateforme)
 * @param {object|null} o.snapshotVinted  le dernier instantané Vinted de l'annonce { status, captured_at }
 * @returns {{ enLigne: {le:number, par:string}|null, indispo: {le:number, par:string}|null, verification: {le:number, par:string}|null }}
 */
export function preuvesAnnonce({ job, source = null, annonces = [], snapshotVinted = null }) {
  const enLigne = [], indispo = [], verif = [];
  const pf = pfDe(job);
  const lu = objet(pf.lecture_etat_retrait);
  if (lu && ms(lu.lu_le) != null) {
    if (lu.etat === "active") enLigne.push({ le: ms(lu.lu_le), par: "page relue en ligne pendant le retrait" });
    else if (lu.etat === "unavailable" || lu.etat === "sold") indispo.push({ le: ms(lu.lu_le), par: `page relue « ${lu.etat} » pendant le retrait` });
  }
  if (job?.platform === "beebs" && retraitBeebsEnVerification(job)) {
    verif.push({ le: ms(job.created_at) ?? 0, par: "retrait : Beebs garde l'annonce en vérification" });
  }
  if (source) {
    const vu = ms(source.vu_en_ligne_le);
    if (vu != null) enLigne.push({ le: vu, par: "dépôt vu en ligne" });
    const ss = String(source.sale_signal ?? objet(source.platform_fields)?.sale_signal ?? "");
    if (ss === "sold" || ss === "unavailable") {
      indispo.push({ le: ms(source.unavailable_since ?? objet(source.platform_fields)?.unavailable_since) ?? 0, par: `dépôt marqué « ${ss} »` });
    }
    const pev = objet(source.pas_encore_visible ?? objet(source.platform_fields)?.pas_encore_visible);
    if (pev) verif.push({ le: ms(pev.derniere) ?? ms(pev.depuis) ?? 0, par: "dépôt jamais vu en ligne (pas encore visible)" });
  }
  for (const a of Array.isArray(annonces) ? annonces : []) {
    const vu = ms(a?.vu_le);
    const st = String(a?.statut_plateforme ?? "");
    if (st === "en_ligne" && vu != null) enLigne.push({ le: vu, par: "relevé : en ligne" });
    else if ((st === "vendue" || st === "desactivee") && vu != null) indispo.push({ le: vu, par: `relevé : ${st}` });
    else if (st === "en_verification" && vu != null) verif.push({ le: vu, par: "relevé : en vérification" });
    const disp = ms(a?.disparu_le);
    if (disp != null) indispo.push({ le: disp, par: "relevé : disparue" });
    const ret = ms(a?.retiree_le);
    if (ret != null) indispo.push({ le: ret, par: "relevé : retirée" });
  }
  if (snapshotVinted && ms(snapshotVinted.captured_at) != null) {
    const st = String(snapshotVinted.status ?? "");
    (st === "active" ? enLigne : indispo).push({ le: ms(snapshotVinted.captured_at), par: `instantané Vinted « ${st || "?"} »` });
  }
  return { enLigne: plusRecente(enLigne), indispo: plusRecente(indispo), verification: plusRecente(verif) };
}

// ── LE MUR NOMMÉ (GESTE ATTENDU DE LA PERSONNE) ──────────────────────────────────────────────────────────────────
/** @returns {{ mur: string, texte: string }|null} */
export function murNomme(job, { proprietaire = null, executant = null, maintenant = Date.now() } = {}) {
  const pf = pfDe(job);
  const nom = nomPf(job?.platform);
  if (retraitOplaQuittee(job)) return { mur: "opla_sortie", texte: "Opla quittée : à retirer par la personne sur Opla" };
  if (retraitBloqueParCompteVinted(job)) return { mur: "compte_vinted_bloque", texte: "compte Vinted bloqué (« compte bloqué » à la place de l'annonce)" };
  if (job?.platform === "leboncoin") {
    const prof = [executant, proprietaire].find((p) => pauseLeboncoinActive(p)) ?? null;
    const b = objet(prof?.platform_settings?.leboncoin?.blocage_acces);
    const a = objet(pf.attente_blocage_lbc);
    if (b || a) {
      const depuis = ms(b?.depuis ?? a?.depuis);
      return { mur: "pause_leboncoin", texte: `pause Leboncoin${b?.signe ? ` (${b.signe})` : ""}${depuis != null ? ` depuis le ${heureParis(depuis)}` : ""}` };
    }
  }
  const murBeebs = job?.platform === "beebs" ? murConnexionLectureBeebs(pf) : null;
  if (retraitBloqueParConnexion(job, maintenant) || murBeebs) {
    return { mur: "connexion", texte: murBeebs && !retraitBloqueParConnexion(job, maintenant)
      ? `connexion ${nom} à refaire (mur lu dans « Mes annonces » le ${heureParis(ms(murBeebs.lu_le))})`
      : `connexion ${nom} à refaire` };
  }
  const b = retraitBloqueParBoutique(job);
  if (b) return { mur: "boutique", texte: `boutique Vinted ${b.login ? `@${String(b.login).replace(/^@/, "")}` : (b.boutique ?? "non prouvée")} à ouvrir dans Chrome` };
  if (pf.needs_user_source === "depop_acces" || pf.depop_acces_attendu_le) return { mur: "depop_acces", texte: "autorisation Depop attendue" };
  if (job?.status === "needs_user") return { mur: "needs_user", texte: `en attente de la personne (${pf.needs_user_source ?? "motif non nommé"})` };
  return null;
}

// ── LE JUGEMENT D'UN RETRAIT ─────────────────────────────────────────────────────────────────────────────────────
/** Le retrait dépend-il d'un poste (extension) ? eBay passe par l'API, sauf quand il attend une session dans Chrome. */
export function dependDuPoste(job) {
  const pf = pfDe(job);
  return String(job?.platform ?? "") !== "ebay" || Boolean(pf.attente_session || pf.attente_connexion);
}

/**
 * @param {object} o
 * @param {object} o.job          le retrait (id, user_id, platform, status, error, created_at, listing_url, inventaire_id, title, platform_fields)
 * @param {object|null} o.fiche   inventaire { statut, quantite, titre } (null : supprimée)
 * @param {object[]} o.ventes     ventes de la fiche { vendu_le, created_at, plateforme }
 * @param {object|null} o.source  le dépôt visé (voir preuvesAnnonce)
 * @param {object[]} o.annonces   annonces_plateforme du même numéro
 * @param {object|null} o.snapshotVinted
 * @param {Map<string, object>} o.profils  id → { username, email, extension_last_seen_at, beta_flags, platform_settings }
 * @param {number} [o.maintenant]
 */
export function jugerRetraitEnRetard({ job, fiche = null, ventes = [], source = null, annonces = [], snapshotVinted = null, profils = new Map(), maintenant = Date.now() }) {
  const ex = executantDe(job, profils);
  const proprietaire = profils.get(String(job?.user_id ?? "")) ?? null;
  const vuPoste = ms(ex.profil?.extension_last_seen_at);
  const muetMs = vuPoste == null ? Infinity : maintenant - vuPoste;
  const poste = dependDuPoste(job);
  const vendu = articleVendu(job, fiche, ventes);
  const momentVente = vendu ? momentDeLaVente(job, ventes) : null;
  const preuves = preuvesAnnonce({ job, source, annonces, snapshotVinted });
  const mur = murNomme(job, { proprietaire, executant: ex.delegue ? ex.profil : null, maintenant });
  const { enLigne, indispo, verification } = preuves;
  const indispoGagne = indispo != null && (enLigne == null || indispo.le >= enLigne.le);
  const enVerification = job?.platform === "beebs" && verification != null && (enLigne == null || enLigne.le <= verification.le);
  const risque = vendu && !indispoGagne && !enVerification && enLigne != null && momentVente != null
    && enLigne.le >= momentVente - FENETRE_AVANT_VENTE_MS;
  const base = { job, fiche, vendu, momentVente, preuves, mur, risque, vuPoste, muetMs, delegue: ex.delegue, executantNom: ex.delegue ? (ex.nom ?? ex.profil?.username ?? ex.id) : null, proprietaire };
  // L'ordre : le silence long (une ligne par compte), ce qui n'a aucun risque, le risque réel, le geste attendu, le poste éteint.
  if (poste && muetMs > POSTE_MUET_LONG_MS) return { ...base, couleur: "blanc", motif: "poste_muet_long" };
  if (!vendu) return { ...base, couleur: "blanc", motif: "sans_vente" };
  if (enVerification) return { ...base, couleur: "blanc", motif: "beebs_jamais_en_ligne" };
  if (indispoGagne) return { ...base, couleur: "blanc", motif: "deja_indisponible" };
  if (risque) return { ...base, couleur: "rouge", motif: enLigne.le >= momentVente ? "vue_apres_la_vente" : "vue_avant_la_vente" };
  if (mur) return { ...base, couleur: "orange", motif: mur.mur };
  if (poste && muetMs > POSTE_ETEINT_MS) return { ...base, couleur: "blanc", motif: "poste_eteint" };
  return { ...base, couleur: "orange", motif: "sans_mur" };
}

// ── LES LIGNES DU DIGEST ─────────────────────────────────────────────────────────────────────────────────────────
const nomCompte = (j) => {
  const p = j.proprietaire;
  const qui = p?.username || p?.email || null;
  return `${String(j.job?.user_id ?? "?").slice(0, 8)}${qui ? ` (${qui})` : ""}`;
};
const titreDe = (j) => String(j.fiche?.titre ?? j.job?.title ?? "").trim().slice(0, 60) || "(sans titre)";
const posteDe = (j, maintenant) => {
  const qui = j.delegue ? `poste de ${j.executantNom} (délégation)` : "poste";
  if (j.vuPoste == null) return `${qui} jamais vu`;
  return `${qui} vu le ${heureParis(j.vuPoste)}${j.muetMs > POSTE_ETEINT_MS ? ` (muet depuis ${jours(maintenant - j.vuPoste)} j)` : ""}`;
};

export const LIBELLES_BLANCS = Object.freeze({
  poste_muet_long: "poste muet depuis plus de 30 jours",
  sans_vente: "suppression sans vente",
  beebs_jamais_en_ligne: "dépôt Beebs jamais en ligne (en vérification)",
  deja_indisponible: "annonce déjà indisponible",
  poste_eteint: "poste éteint",
});

/** Une ligne rouge ou orange (un retrait). */
export function ligneRetrait(j, maintenant = Date.now()) {
  const { job, preuves, momentVente } = j;
  const ventes = j.vendu && momentVente != null ? `vendu le ${heureParis(momentVente)}` : (j.vendu ? "vendu" : "pas de vente");
  let preuve = "aucune preuve en ligne";
  if (preuves.enLigne) {
    const quand = heureParis(preuves.enLigne.le);
    preuve = momentVente != null && preuves.enLigne.le >= momentVente
      ? `vue en ligne le ${quand} (${preuves.enLigne.par}), APRÈS la vente`
      : momentVente != null
        ? `vue en ligne le ${quand} (${preuves.enLigne.par}), ${duree(momentVente - preuves.enLigne.le)} avant la vente, jamais vue retirée depuis`
        : `vue en ligne le ${quand} (${preuves.enLigne.par})`;
  }
  const mur = j.mur ? ` · mur : ${j.mur.texte}` : (j.couleur === "orange" ? " · aucun mur nommé : le retrait n'avance pas" : "");
  return `[${nomPf(job.platform)}] « ${titreDe(j)} » — compte ${nomCompte(j)} — ${ventes} — ${preuve}`
    + ` — retrait ${String(job.id).slice(0, 8)} ${job.status} depuis le ${heureParis(ms(job.created_at))} (${jours(maintenant - (ms(job.created_at) ?? maintenant))} j)`
    + `${mur} · ${posteDe(j, maintenant)}${job.listing_url ? ` — ${job.listing_url}` : ""}`;
}

/** Les blancs, compacts : une ligne par compte pour les postes muets depuis plus de 30 jours, une par compte et motif sinon. */
export function lignesBlanches(blancs, maintenant = Date.now()) {
  const groupes = new Map();
  for (const j of blancs) {
    const cle = `${j.motif}|${j.job.user_id}`;
    const g = groupes.get(cle) ?? { motif: j.motif, jugements: [] };
    g.jugements.push(j);
    groupes.set(cle, g);
  }
  const ordre = Object.keys(LIBELLES_BLANCS);
  return [...groupes.values()]
    .sort((a, b) => ordre.indexOf(a.motif) - ordre.indexOf(b.motif) || b.jugements.length - a.jugements.length)
    .map((g) => {
      const j0 = g.jugements[0];
      const pfs = new Map();
      for (const j of g.jugements) pfs.set(nomPf(j.job.platform), (pfs.get(nomPf(j.job.platform)) ?? 0) + 1);
      const plateformes = [...pfs.entries()].map(([p, n]) => (n > 1 ? `${p} ×${n}` : p)).join(", ");
      const plusVieux = Math.min(...g.jugements.map((j) => ms(j.job.created_at) ?? maintenant));
      const n = g.jugements.length;
      const titres = g.jugements.slice(0, 3).map((j) => `« ${titreDe(j).slice(0, 40)} »`).join(", ") + (n > 3 ? ", …" : "");
      if (g.motif === "poste_muet_long") {
        const vendus = g.jugements.filter((j) => j.vendu).length;
        const risques = g.jugements.filter((j) => j.risque).length;
        return `${LIBELLES_BLANCS[g.motif]} — compte ${nomCompte(j0)} — ${j0.vuPoste == null ? "poste jamais vu" : `muet depuis le ${heureParis(j0.vuPoste)} (${jours(maintenant - j0.vuPoste)} j)`}`
          + ` — ${n} retrait${n > 1 ? "s" : ""} (${plateformes}), le plus ancien du ${heureParis(plusVieux)}`
          + ` — ${vendus === 0 ? "aucun article vendu" : `${vendus} article${vendus > 1 ? "s" : ""} vendu${vendus > 1 ? "s" : ""}`}`
          + `${risques ? `, dont ${risques} vu${risques > 1 ? "s" : ""} en ligne à la vente (risque non suivi : poste muet)` : ""}`;
      }
      const detail = g.motif === "deja_indisponible"
        ? ` — ${g.jugements.map((j) => `${j.preuves.indispo?.par ?? "?"} le ${heureParis(j.preuves.indispo?.le)}${j.mur ? ` (mur : ${j.mur.texte})` : ""}`).slice(0, 3).join(" ; ")}`
        : g.motif === "poste_eteint" ? ` — ${posteDe(j0, maintenant)}`
          : g.motif === "sans_vente" ? ` — ${g.jugements.some((j) => j.fiche) ? "article encore en stock ou fiche non vendue" : "fiche supprimée, aucune vente"}`
            : "";
      return `${LIBELLES_BLANCS[g.motif] ?? g.motif} — compte ${nomCompte(j0)} — ${n} retrait${n > 1 ? "s" : ""} (${plateformes}), le plus ancien du ${heureParis(plusVieux)} — ${titres}${detail}`;
    });
}

/**
 * Le classement complet, prêt pour le digest.
 * @returns {{ rouges: object[], oranges: object[], blancs: object[], lignesRouges: string[], lignesOranges: string[], lignesBlanches: string[] }}
 */
export function classerRetraitsEnRetard(jugements, maintenant = Date.now()) {
  const par = (c) => jugements.filter((j) => j.couleur === c)
    .sort((a, b) => (ms(a.job.created_at) ?? 0) - (ms(b.job.created_at) ?? 0));
  const rouges = par("rouge"), oranges = par("orange"), blancs = par("blanc");
  return {
    rouges, oranges, blancs,
    lignesRouges: rouges.map((j) => ligneRetrait(j, maintenant)),
    lignesOranges: oranges.map((j) => ligneRetrait(j, maintenant)),
    lignesBlanches: lignesBlanches(blancs, maintenant),
  };
}

/** L'objet du mail commence par le risque réel quand il existe. */
export function sujetAvecDoubleVente(sujet, nRouges) {
  return nRouges > 0 ? `🔴 Double vente possible : ${nRouges} — ${sujet}` : sujet;
}

/** Le numéro d'annonce visé par un job (retrait ou dépôt), par plateforme ; null si illisible. */
export function numeroAnnonce(job) {
  const n = numeroAnnonceDuJob(job);
  return n ? String(n) : null;
}
