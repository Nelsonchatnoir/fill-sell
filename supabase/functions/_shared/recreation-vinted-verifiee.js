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
//   · une fiche déjà présente ressemble à notre copie (importée pendant un essai)
//     → la question, jamais un essai de plus (tous les comptes) ;
//   · (18/10 soir) le cas Régis seulement — page 1 du dressing PLEINE DE
//     BROUILLONS (≥ BROUILLONS_PAGE_UNE) et extension d'avant la 0.6.128 (sa
//     relecture ne lit que la page 1 : elle ne peut pas voir la copie) : une
//     republication retirée dont un essai a eu lieu n'est plus resservie
//     automatiquement. Un relevé AUTOMATIQUE n'importe aucun article neuf
//     (règle de Nico du 05/10) : il ne prouve rien. Seul un relevé fait PAR LA
//     PERSONNE (Synchroniser), complet, commencé ≥ ATTENTE_RELEVE_MIN après
//     l'essai, l'importe — la base rattache alors la copie (migration
//     20261018170000) ; s'il n'en apporte aucune, l'essai suivant part, une fois.
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
// La copie se compare par memeTitre (même règle que l'extension) : un titre qui a
// perdu son saut de ligne reste le même titre.
// Pur (Deno + Node). Testé par scripts/recreation-vinted-verifiee-selftest.mjs.
import { memeTitre } from "./titre-copie-vinted.js";

export const ATTENTE_RELEVE_MIN = 12;
export const ATTENTE_RELEVE_MAX_H = 6;
/** Page 1 du dressing propriétaire (96 annonces) pleine de brouillons : la relecture d'avant la 0.6.128 est aveugle. */
export const BROUILLONS_PAGE_UNE = 90;
const GESTE_RE = /^(bouton|bouton_distant|app)(:redemande)?$/;
const AVANT_MS = 2 * 60_000;
const APRES_MS = 20 * 60_000;

const objet = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
const ms = (v) => { const t = Date.parse(String(v ?? "")); return Number.isFinite(t) ? t : NaN; };

/** Même normalisation que recreation_vinted_titre_norm (base). */
export function titreNorm(t) {
  return String(t ?? "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
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

/** Les fiches du compte qui ressemblent à une copie née de nos envois. */
export function copiesProbables(job, fiches) {
  const pf = objet(job?.platform_fields) ?? {};
  // (25/10) Les titres que la copie peut porter : celui de la recréation
  // (titre_saisi, servi d'abord), le titre relu dans le champ (titre_pose), le
  // titre capturé — comparés par memeTitre (saut de ligne perdu = même titre).
  const references = [pf.titre_saisi, pf.titre_pose, objet(pf.republish_snapshot)?.titre || job?.title]
    .filter((t) => typeof t === "string" && titreNorm(t));
  if (!references.length) return [];
  const envois = envoisDe(pf);
  const retrait = retraitLe(pf);
  if (!envois.length || !Number.isFinite(retrait)) return [];
  const ancien = String(pf.vinted_item_id ?? "").trim();
  const boutique = String(pf.vinted_account_id ?? "").trim();
  return (Array.isArray(fiches) ? fiches : []).filter((f) => {
    if (!f?.vinted_item_id || String(f.vinted_item_id) === ancien) return false;
    if (job.inventaire_id != null && String(f.id) === String(job.inventaire_id)) return false;
    if (!references.some((t) => memeTitre(t, f.titre))) return false;
    if (boutique && f.vinted_account_id && String(f.vinted_account_id) !== boutique) return false;
    const t = ms(f.listed_at_guess);
    return Number.isFinite(t) && t >= retrait - AVANT_MS && envois.some((e) => t >= e - AVANT_MS && t <= e + APRES_MS);
  });
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

/**
 * @param {any} job  republication Vinted servie (pending, étape 'deleted')
 * @param {{ releves?: any[], fiches?: any[], maintenant?: number, pageUneAveugle?: boolean }} ctx
 * @returns {null | { action: 'servir'|'retenir'|'question', platform_fields: object, error: string|null, copies?: any[] }}
 */
export function decisionVerificationRecreation(job, { releves = [], fiches = [], maintenant = Date.now(), pageUneAveugle = true } = {}) {
  const v = recreationAVerifier(job);
  if (!v) return null;
  const pf0 = objet(job.platform_fields) ?? {};
  const pf = { ...pf0 };
  const iso = (t) => new Date(t).toISOString();
  const copies = copiesProbables(job, fiches);
  if (copies.length) {
    delete pf.recreation_attente_releve;
    pf.needs_user_source = "recreation_deja_partie";
    pf.recreation_deja_partie = { le: iso(maintenant), essai: iso(v.essai), copies: copies.slice(0, 5).map((c) => String(c.vinted_item_id)) };
    const liens = copies.slice(0, 3).map((c) => `https://www.vinted.fr/items/${c.vinted_item_id}`).join(" , ");
    return {
      action: "question", platform_fields: pf, copies,
      error: `Ta republication est sans doute déjà en ligne sur Vinted (${liens}), mais elle est entrée dans ton stock comme une fiche ` +
        "séparée. Rien n'a été recréé de plus. Vérifie-la sur Vinted, puis fusionne les deux fiches de cet article depuis l'app.",
    };
  }
  // (25/10) Un dépôt d'issue inconnue après le dernier envoi : retenue pour TOUTES
  // les versions, jusqu'à la preuve (cf. en-tête) — jamais un second envoi sans elle.
  const incertain = depotIncertainApresEnvoi(pf0, v.essai);
  // Relecture de l'extension fiable (pas de mur de brouillons, ou 0.6.128+) : servie comme avant.
  if (!pageUneAveugle && !incertain) return null;
  const fait = releveQualifiant(releves, v.essai);
  if (fait) {
    delete pf.recreation_attente_releve;
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
