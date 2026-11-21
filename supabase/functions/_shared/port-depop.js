// ═══════════════════════════════════════════════════════════════════════════
// DEPOP — LES FRAIS DE PORT PAR DÉFAUT, AU SERVICE DU JOB (09/10/2026 soir)
// ═══════════════════════════════════════════════════════════════════════════
// En France, Depop ne fournit aucune étiquette : le vendeur fixe le prix de
// livraison que paie l'acheteur (`national_shipping_cost`, obligatoire,
// strictement moins de 100 €). Le connecteur (extension 0.6.106) refuse un
// job sans `platform_fields.depopPort` : à la publication il pose sa propre
// question ; à la REPUBLICATION il s'arrête avant tout retrait SANS champ à
// remplir — les annonces importées par la synchro (aucun port relevé) ne
// pouvaient donc jamais repartir.
//
// get-pending-jobs, avant de servir un job Depop sans port :
//   · le compte a un prix par défaut (platform_settings.depop.
//     frais_port_defaut, Réglages) → il est posé sur le job (jamais par-dessus
//     un port déjà dit, ni une réponse de la personne) ;
//   · sinon, une REPUBLICATION qui n'a encore rien retiré passe en needs_user
//     avec LA question « Frais de port Depop » — un champ, jamais un arrêt
//     sans moyen de débloquer ; l'annonce reste en ligne, intacte ;
//   · sinon (publication), rien : le connecteur pose sa question.
// Aucune modification de l'extension. Pur : scripts/port-depop-selftest.mjs.
// ═══════════════════════════════════════════════════════════════════════════

export const DEPOP_PORT_MAX = 100;

/**
 * Lit un port saisi (« 4,90 », « 4.9 », « 4,90 € », 5) → { valeur, erreur }.
 * valeur : nombre arrondi au centime, ou null.
 * erreur : null | "vide" | "invalide" | "trop_haut". L'app (utils/fraisPortDepop)
 * et le serveur lisent le port par CETTE fonction, et par elle seule.
 */
export function lirePortSaisi(brut) {
  if (brut == null) return { valeur: null, erreur: "vide" };
  if (typeof brut === "number") {
    if (!Number.isFinite(brut) || brut < 0) return { valeur: null, erreur: "invalide" };
    if (brut >= DEPOP_PORT_MAX) return { valeur: null, erreur: "trop_haut" };
    return { valeur: Math.round(brut * 100) / 100, erreur: null };
  }
  const s = String(brut).replace(/€|eur(os?)?/gi, "").replace(/\s+/g, "").replace(",", ".").trim();
  if (!s) return { valeur: null, erreur: "vide" };
  if (!/^(\d+(\.\d{0,2})?|\.\d{1,2})$/.test(s)) return { valeur: null, erreur: "invalide" };
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return { valeur: null, erreur: "invalide" };
  if (n >= DEPOP_PORT_MAX) return { valeur: null, erreur: "trop_haut" };
  return { valeur: Math.round(n * 100) / 100, erreur: null };
}

/** Le port d'une valeur (nombre ou « 4,90 »), arrondi au centime, ou null. */
export const portDepopValide = (v) => lirePortSaisi(v).valeur;

/** Le port par défaut d'un objet platform_settings, ou null. */
export function portDepopParDefaut(ps) {
  const d = ps && typeof ps === "object" ? ps.depop : null;
  return d && typeof d === "object" ? portDepopValide(d.frais_port_defaut) : null;
}

/** (21/11/2026, lot du 21/11, point 8) Les frais de port INTERNATIONAUX des Réglages (facultatifs), ou null = France seule. */
export const CLE_PORT_INTERNATIONAL_DEPOP = "frais_port_international";
export function portDepopInternationalParDefaut(ps) {
  const d = ps && typeof ps === "object" ? ps.depop : null;
  return d && typeof d === "object" ? portDepopValide(d[CLE_PORT_INTERNATIONAL_DEPOP]) : null;
}

// Les étapes d'une republication où RIEN n'a encore été retiré chez Depop.
const ETAPES_AVANT_RETRAIT = new Set(["", "a_capturer", "captured"]);

export const QUESTION_PORT_DEPOP = Object.freeze({
  field_key: "depopPort",
  field_label: "Frais de port Depop (€)",
  input_type: "number",
  explication: "Le prix que l'acheteur paie pour l'envoi en France. Depop ne fournit pas d'étiquette : tu expédies en envoi suivi.",
  target: { root: null, key: "depopPort" },
});

export const MESSAGE_PORT_DEPOP_REPUBLICATION =
  "Republication Depop en attente, AVANT tout retrait : indique les frais de port (le prix de livraison que paie l'acheteur). " +
  "Ton annonce est toujours en ligne, rien n'a été touché.";

/**
 * Que faire d'un job Depop avant de le servir ?
 * @returns {{ action: "rien" } | { action: "poser", valeur: number } | { action: "demander" }}
 */
export function decisionPortDepop(job, portDefaut) {
  if (!job || job.platform !== "depop") return { action: "rien" };
  const action = String(job.action ?? "");
  if (action !== "publish" && action !== "republish") return { action: "rien" };
  const pf = job.platform_fields && typeof job.platform_fields === "object" ? job.platform_fields : {};
  if (pf.depopPort != null && String(pf.depopPort).trim() !== "") return { action: "rien" }; // dit (même mal dit : le connecteur le dira)
  const d = portDepopValide(portDefaut);
  if (d != null) return { action: "poser", valeur: d };
  if (action === "republish" && ETAPES_AVANT_RETRAIT.has(String(pf.republish_step ?? ""))
    && !pf.deleted_at && !pf.republish_retrait) return { action: "demander" };
  return { action: "rien" };
}

// ═════════════════════════════════════════════════════════════════════════════
// (20/11/2026, urgence de Nico — compte Business, 336 annonces Depop à 4,15 € pour un réglage à 5,99 €)
// LE RÉGLAGE DU VENDEUR FAIT FOI. Un job Depop portait le port HÉRITÉ de l'ancien dépôt de la fiche (l'app reprend les
// champs Depop de la fiche ; la republication copie ceux de l'annonce d'avant ; le prix par défaut de l'app est lu une
// fois par session) : seules les fiches neuves prenaient le réglage — 5 sur 10 dans le même lot du 20/11. Avant de
// servir un job Depop (publication ou republication), le port est celui des Réglages
// (platform_settings.depop.frais_port_defaut), sauf un port SAISI pour CET article par la personne (marqué
// `depop_port_source = "saisie_article"` par l'app). Sans réglage : rien ne change (decisionPortDepop).
// ═════════════════════════════════════════════════════════════════════════════
export const SOURCE_PORT_SAISI_ARTICLE = "saisie_article";
export const SOURCE_PORT_REGLAGE = "defaut_reglages";

/**
 * Le port à servir d'après le réglage du vendeur (pure).
 * @returns {{ action: "rien" } | { action: "remplacer", valeur: number, avant: number }}
 */
export function portDepopAServir(job, portDefaut) {
  if (!job || job.platform !== "depop") return { action: "rien" };
  const action = String(job.action ?? "");
  if (action !== "publish" && action !== "republish") return { action: "rien" };
  const d = portDepopValide(portDefaut);
  if (d == null) return { action: "rien" };
  const pf = job.platform_fields && typeof job.platform_fields === "object" ? job.platform_fields : {};
  const actuel = portDepopValide(pf.depopPort);
  if (actuel == null) return { action: "rien" };   // sans port : decisionPortDepop le pose
  if (pf.depop_port_source === SOURCE_PORT_SAISI_ARTICLE) return { action: "rien" };   // le choix de la personne pour CET article
  if (actuel === d) return { action: "rien" };
  return { action: "remplacer", valeur: d, avant: actuel };
}
