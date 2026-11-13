// ═══════════════════════════════════════════════════════════════════════════
// LEBONCOIN — LA VILLE DE L'ANNONCE, LA RÈGLE (30/10/2026, lot E) — pur
// ═══════════════════════════════════════════════════════════════════════════
// Le réglage par défaut : platform_settings.leboncoin.ville_publication
// = { code_postal, ville } (absent = la ville de l'adresse de remise, comme
// avant). Le choix de la carte : platform_fields.ville_publication_lbc
// = { code_postal, ville }, ou « adresse » (l'adresse de remise entière, même
// quand un réglage existe). Le job porte la ville retenue, ou rien (adresse).
// Lecture et écriture du réglage : utils/villeAnnonceLbc.js.
//
// (13/11, lot du 13/11, N6b — décision de Nico) À LA SAISIE, une ville de l'annonce ne porte jamais un code d'aucune
// commune (CEDEX, code général comme 75000) : compte 98b72757, « Cholet 49308 » enregistré le 11/11 (le champ
// acceptait n'importe quels cinq chiffres) → 12 publications Leboncoin refusées. controleVilleLbc refuse ce code et
// propose le vrai code de la commune quand l'adresse de remise est dans la même commune (jamais une valeur
// devinée). La table des codes est PAR SITE : supabase/functions/_shared/ville-publication-code-postal.js (le
// serveur, get-pending-jobs, applique le même repli aux villes déjà enregistrées).

import { vraiCodePostalDeLaCommune } from "../../supabase/functions/_shared/ville-publication-code-postal.js";

export const CLE_VILLE_PUBLICATION_LBC = "ville_publication";
export const CHOIX_ADRESSE = "adresse";

/** { code_postal, ville } valide (code postal français à 5 chiffres, ville non vide), sinon null. */
export function villeValide(v) {
  if (!v || typeof v !== "object") return null;
  const code_postal = String(v.code_postal ?? "").trim();
  const ville = String(v.ville ?? "").replace(/\s+/g, " ").trim();
  return /^\d{5}$/.test(code_postal) && ville ? { code_postal, ville } : null;
}

/** « Le Mans (72000) ». */
export function libelleVille(v) {
  const x = villeValide(v);
  return x ? `${x.ville} (${x.code_postal})` : "";
}

/** Les deux villes connues d'un compte : celle du réglage, celle de l'adresse de remise. */
export function villesDesReglages(platformSettings) {
  const lbc = platformSettings?.leboncoin ?? {};
  return {
    reglage: villeValide(lbc[CLE_VILLE_PUBLICATION_LBC]),
    adresse: villeValide({ code_postal: lbc.code_postal, ville: lbc.ville }),
  };
}

/**
 * (13/11, N6b) La saisie d'une ville de l'annonce (Réglages ou carte Leboncoin). Pur.
 * @param {{ code_postal: string, ville: string }} v  la saisie
 * @param {{ code_postal: string, ville: string } | null} adresse  la ville de l'adresse de remise (villesDesReglages)
 * @returns {{ ok: true, v: { code_postal: string, ville: string } }
 *   | { ok: false, motif: "forme" }
 *   | { ok: false, motif: "cp_non_commune" | "plusieurs_codes", saisie: { code_postal: string, ville: string },
 *       suggestion: { code_postal: string, ville: string } | null, codes: string }}
 */
export function controleVilleLbc(v, adresse = null) {
  const x = villeValide(v);
  if (!x) return { ok: false, motif: "forme" };
  const a = villeValide(adresse);
  const r = vraiCodePostalDeLaCommune({ site: "leboncoin", ville: x.ville, code_postal: x.code_postal, adresses: a ? [a] : [] });
  if (r.verdict === "deja_commune" || r.verdict === "site_sans_table") return { ok: true, v: x };
  if (r.verdict === "repli") {
    return { ok: false, motif: "cp_non_commune", saisie: x, suggestion: { code_postal: r.code_postal, ville: x.ville }, codes: r.code_postal };
  }
  return { ok: false, motif: r.motif === "plusieurs_codes" ? "plusieurs_codes" : "cp_non_commune", saisie: x, suggestion: null,
    codes: r.codes?.length ? r.codes.join(", ") : (r.codes_proches ?? "") };
}

/** Le message de saisie d'un refus de controleVilleLbc (fr, en). */
export function messageVilleLbc(c, lang = "fr") {
  if (!c || c.ok || c.motif === "forme") return "";
  const cp = c.saisie?.code_postal ?? "";
  const ville = c.saisie?.ville ?? "";
  if (lang === "en") {
    const base = `${cp} isn't a town's postcode (it's a CEDEX code or a general code such as 75000): Leboncoin would place your listings elsewhere.`;
    if (c.suggestion) return `${base} ${ville}'s postcode in your address is ${c.suggestion.code_postal}: it's been put in — check, then save.`;
    return `${base} Enter your town's postcode${c.codes ? ` (${String(c.codes).replace(/ à /g, " to ")})` : ""}.`;
  }
  const base = `${cp} n'est pas le code postal d'une commune (c'est un code CEDEX ou un code général comme 75000) : Leboncoin placerait tes annonces ailleurs.`;
  if (c.suggestion) return `${base} Le code postal de ${ville} dans ton adresse est ${c.suggestion.code_postal} : il est mis à sa place — vérifie, puis enregistre.`;
  return `${base} Mets le code postal de ta commune${c.codes ? ` (${c.codes})` : ""}.`;
}

/** La ville qui part sur le job : le choix de la carte, sinon le réglage ; « adresse » → null (adresse entière). */
export function villePourLeJob(choixCarte, reglage) {
  if (choixCarte === CHOIX_ADRESSE) return null;
  return villeValide(choixCarte) ?? villeValide(reglage);
}
