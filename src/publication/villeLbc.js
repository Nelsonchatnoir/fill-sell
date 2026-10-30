// ═══════════════════════════════════════════════════════════════════════════
// LEBONCOIN — LA VILLE DE L'ANNONCE, LA RÈGLE (30/10/2026, lot E) — pur
// ═══════════════════════════════════════════════════════════════════════════
// Le réglage par défaut : platform_settings.leboncoin.ville_publication
// = { code_postal, ville } (absent = la ville de l'adresse de remise, comme
// avant). Le choix de la carte : platform_fields.ville_publication_lbc
// = { code_postal, ville }, ou « adresse » (l'adresse de remise entière, même
// quand un réglage existe). Le job porte la ville retenue, ou rien (adresse).
// Lecture et écriture du réglage : utils/villeAnnonceLbc.js.

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

/** La ville qui part sur le job : le choix de la carte, sinon le réglage ; « adresse » → null (adresse entière). */
export function villePourLeJob(choixCarte, reglage) {
  if (choixCarte === CHOIX_ADRESSE) return null;
  return villeValide(choixCarte) ?? villeValide(reglage);
}
