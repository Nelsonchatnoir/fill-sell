// ═══════════════════════════════════════════════════════════════════════════
// L'ABSENCE DE MARQUE, DITE AUTREMENT — UNE SEULE LISTE (04/10/2026, Louis)
// ═══════════════════════════════════════════════════════════════════════════
// Louis (Business) : ses fiches portent « Marque générique » (recopiée de ses
// annonces Opla). Vinted ne la connaît pas : CHAQUE article tombait en
// « À régler » (needs_user champ_a_choisir) jusqu'à ce qu'il choisisse « pas
// de marque » à la main. Beebs et Leboncoin recevaient « Autre ».
// Règle de Nico : les équivalents d'absence de marque sont traduits
// AUTOMATIQUEMENT vers la valeur « sans marque » de chaque plateforme, sans
// rien demander — et JAMAIS une vraie marque n'est remplacée.
//
// ⛔ LISTE FERMÉE, ÉGALITÉ EXACTE après normalisation (accents, casse,
//    ponctuation de bord) : jamais une recherche de sous-chaîne. « Generic
//    Surplus », « Générique & Co » sont de vraies marques et restent.
// ⛔ PAS « autre », « vintage », « fait main », « divers », « inconnue » :
//    ce ne sont pas des absences de marque (la liste des doublons
//    MARQUES_VIDES, elle, les contient — elle sert à autre chose).
// ES module SANS import (Deno + navigateur + Node).

export const SANS_MARQUE = "Sans marque";

const ABSENCES = new Set([
  "sans marque", "marque generique", "generique", "sans marque generique", "sans marque / generique",
  "aucune", "aucune marque", "pas de marque", "non marque", "non marquee",
  "no brand", "unbranded", "unbranded generic", "unbranded / generic", "generic", "generic brand",
  "nobrand",
]);

/** Le texte, ramené à sa forme comparable. */
export function marqueComparable(v) {
  return String(v ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[\s\-–—_.,;:!?()[\]"'«»]+$/g, "")
    .replace(/^[\s\-–—_.,;:!?()[\]"'«»]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Cette valeur dit-elle « pas de marque » ? (liste fermée, égalité exacte) */
export function estSansMarque(v) {
  const c = marqueComparable(v);
  if (!c) return false;
  if (ABSENCES.has(c)) return true;
  // « - Sans marque/Générique - » d'eBay, « Sans marque / générique » :
  // les deux moitiés sont des absences, chacune de la liste.
  const parties = c.split(/\s*\/\s*/).filter(Boolean);
  return parties.length > 1 && parties.every((p) => ABSENCES.has(p));
}

/** Plateformes où le serveur traduit l'absence de marque au service du job.
 *  eBay (API) traduit de son côté, vers l'entrée générique de SA liste
 *  (ebay-publication.ts, assemblerAspects). */
export const PLATEFORMES_TRADUITES = ["vinted", "beebs", "leboncoin", "opla"];

/**
 * Traduit, dans le platform_fields d'un job publish/republish, chaque valeur
 * d'absence de marque en « Sans marque ». Modifie `job.platform_fields` en
 * place et rend la trace posée (`marque_traduite`), ou null si rien n'a bougé.
 * ⛔ Une vraie marque n'est jamais touchée (estSansMarque : liste fermée).
 */
export function traduireAbsenceMarqueJob(job, maintenant = new Date()) {
  if (!job || !PLATEFORMES_TRADUITES.includes(String(job.platform))) return null;
  if (!["publish", "republish"].includes(String(job.action ?? "publish"))) return null;
  const pf = (job.platform_fields && typeof job.platform_fields === "object") ? job.platform_fields : null;
  if (!pf) return null;
  const traduit = [];
  const traduire = (obj, cle, nom) => {
    const v = obj[cle];
    if (typeof v === "string" && v.trim() && v.trim() !== SANS_MARQUE && estSansMarque(v)) {
      traduit.push({ champ: nom, de: v });
      obj[cle] = SANS_MARQUE;
    }
  };
  traduire(pf, "marque", "marque");
  for (const [racine, cle] of [["vintedAspects", "brand"], ["beebsAspects", "Marque"]]) {
    const o = pf[racine];
    if (o && typeof o === "object") traduire(o, cle, `${racine}.${cle}`);
  }
  const lbc = pf.lbcAspects;
  if (lbc && typeof lbc === "object") {
    for (const k of Object.keys(lbc)) if (/brand$/i.test(k)) traduire(lbc, k, `lbcAspects.${k}`);
  }
  if (!traduit.length) return null;
  pf.marque_traduite = {
    de: traduit[0].de, vers: SANS_MARQUE, champs: traduit.map((x) => x.champ),
    le: maintenant.toISOString(), pose_par: "get-pending-jobs (_shared/marque-absente.js)",
  };
  return pf.marque_traduite;
}
