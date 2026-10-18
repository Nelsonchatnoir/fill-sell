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
// RÈGLE (servie par get-pending-jobs à TOUTES les versions d'extension) : une
// republication Vinted « retirée, pas revenue » dont un essai a eu lieu
// (retrait de la une-passe ou tentative de recréation) n'est plus servie tant
// qu'un relevé COMPLET du dressing (toutes les pages), commencé au moins
// ATTENTE_RELEVE_MIN après le dernier essai, n'a pas tourné :
//   · le relevé importe la copie → la base la rattache à la fiche et clôt la
//     republication (migration 20261018170000) : plus rien à servir ;
//   · aucune copie au relevé → servie, UNE fois (trace recreation_verifiee) ;
//   · une fiche déjà présente ressemble à notre copie (importée pendant un
//     essai) → la question, jamais un essai de plus ;
//   · pas de relevé au bout d'ATTENTE_RELEVE_MAX_H → la question, honnête.
// Pur (Deno + Node). Testé par scripts/recreation-vinted-verifiee-selftest.mjs.

export const ATTENTE_RELEVE_MIN = 12;
export const ATTENTE_RELEVE_MAX_H = 6;
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

/** Un relevé complet du dressing, commencé assez tard après l'essai. */
export function releveQualifiant(releves, essai) {
  return (Array.isArray(releves) ? releves : []).find((r) =>
    r && r.status === "done" && (r.kind == null || r.kind === "dressing")
    && ms(r.started_at) >= essai + ATTENTE_RELEVE_MIN * 60_000
    && Number(r.total_entries) > 0 && Number(r.items_vus) >= Number(r.total_entries)) ?? null;
}

/** Les fiches du compte qui ressemblent à une copie née de nos envois. */
export function copiesProbables(job, fiches) {
  const pf = objet(job?.platform_fields) ?? {};
  const cible = titreNorm(objet(pf.republish_snapshot)?.titre || job?.title);
  if (!cible) return [];
  const envois = envoisDe(pf);
  const retrait = retraitLe(pf);
  if (!envois.length || !Number.isFinite(retrait)) return [];
  const ancien = String(pf.vinted_item_id ?? "").trim();
  const boutique = String(pf.vinted_account_id ?? "").trim();
  return (Array.isArray(fiches) ? fiches : []).filter((f) => {
    if (!f?.vinted_item_id || String(f.vinted_item_id) === ancien) return false;
    if (job.inventaire_id != null && String(f.id) === String(job.inventaire_id)) return false;
    if (titreNorm(f.titre) !== cible) return false;
    if (boutique && f.vinted_account_id && String(f.vinted_account_id) !== boutique) return false;
    const t = ms(f.listed_at_guess);
    return Number.isFinite(t) && t >= retrait - AVANT_MS && envois.some((e) => t >= e - AVANT_MS && t <= e + APRES_MS);
  });
}

export const MESSAGE_ATTENTE =
  "Ton annonce a été retirée de Vinted et sa remise en ligne est en cours de vérification : un essai précédent l'a " +
  "peut-être déjà remise en ligne. On relit ton dressing avant tout nouvel essai, pour qu'elle ne parte jamais en double. " +
  "Rien à faire de ton côté. Rien n'est perdu : titre, description, photos et champs sont conservés.";

/**
 * @param {any} job  republication Vinted servie (pending, étape 'deleted')
 * @param {{ releves?: any[], fiches?: any[], maintenant?: number }} ctx
 * @returns {null | { action: 'servir'|'retenir'|'demander_releve'|'question', platform_fields: object, error: string|null, copies?: any[] }}
 */
export function decisionVerificationRecreation(job, { releves = [], fiches = [], maintenant = Date.now() } = {}) {
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
  const fait = releveQualifiant(releves, v.essai);
  if (fait) {
    delete pf.recreation_attente_releve;
    pf.recreation_verifiee = { essai: iso(v.essai), releve: fait.id ?? null, le: iso(maintenant), copies: 0 };
    return { action: "servir", platform_fields: pf, error: null };
  }
  const depuis = ms(objet(pf0.recreation_attente_releve)?.depuis);
  const depuisMs = Number.isFinite(depuis) ? depuis : maintenant;
  pf.recreation_attente_releve = { depuis: iso(depuisMs), essai: iso(v.essai) };
  if (maintenant - depuisMs > ATTENTE_RELEVE_MAX_H * 3600_000) {
    pf.needs_user_source = "recreation_deja_partie";
    return {
      action: "question", platform_fields: pf,
      error: "Un essai précédent a peut-être déjà remis ton annonce en ligne sur Vinted, et ton dressing n'a pas pu être relu " +
        "depuis. Pour ne jamais la mettre en double, on ne la redépose pas à l'aveugle : regarde ton dressing Vinted — si elle y " +
        "est, il n'y a rien à faire ; sinon relance la republication d'un clic.",
    };
  }
  const tot = maintenant >= v.essai + ATTENTE_RELEVE_MIN * 60_000;
  return { action: tot ? "demander_releve" : "retenir", platform_fields: pf, error: MESSAGE_ATTENTE };
}
