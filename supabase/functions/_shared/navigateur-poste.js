// ═══════════════════════════════════════════════════════════════════════════
// LE NAVIGATEUR ET LE PAYS D'UN POSTE (09/10, Marta) — module PUR
// ═══════════════════════════════════════════════════════════════════════════
// Marta (Pro, Italie) : l'app ouverte dans Chrome, l'extension installée dans
// Edge (le lien du mail s'est ouvert dans son navigateur par défaut). Sa
// session Vinted n'était pas dans Edge : neuf « Synchroniser » refusés en
// « connecte-toi sur vinted.fr », sans jamais nommer le navigateur.
// Ici : le navigateur se lit sur l'en-tête User-Agent de la requête du poste
// (« Edg/ » = Edge — à tester AVANT Chrome, qu'Edge cite aussi), le pays sur
// l'en-tête cf-ipcountry posé par le réseau. Rejoué par
// scripts/vinted-etranger-selftest.mjs.

/** "edge" | "opera" | "chrome" | "firefox" | "safari" | null */
export function navigateurDeUA(ua) {
  const s = String(ua ?? "");
  if (!s) return null;
  if (/\bEdg(e|A|iOS)?\//.test(s)) return "edge";
  if (/\bOPR\/|\bOpera\b/.test(s)) return "opera";
  if (/\bFirefox\//.test(s)) return "firefox";
  if (/\bChrome\/|\bCriOS\//.test(s)) return "chrome";
  if (/\bSafari\//.test(s)) return "safari";
  return null;
}

export const NOM_NAVIGATEUR = Object.freeze({
  edge: "Microsoft Edge", chrome: "Google Chrome", opera: "Opera", firefox: "Firefox", safari: "Safari",
});

/** Code pays ISO à deux lettres de l'en-tête cf-ipcountry, sinon null (XX, T1 = inconnu / Tor). */
export function paysDeEntete(v) {
  const p = String(v ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(p) && p !== "XX" && p !== "T1" ? p : null;
}

/**
 * Le vendeur Vinted ÉTRANGER à qui l'extension propose « Autoriser vinted.<cc> ».
 * Jamais un Français : pays FR, session vinted.fr vivante, ou pays fermé → null.
 * @param {{ paysSonde?: string|null, paysReseau?: string|null, ouverts: Set<string>,
 *           sessionVintedFr?: boolean|null, domaines: Record<string, {domaine: string}> }} p
 */
export function vintedEtranger({ paysSonde = null, paysReseau = null, ouverts, sessionVintedFr = null, domaines }) {
  // Le pays du COMPTE Vinted (sonde) prime sur celui du réseau.
  const pays = paysSonde || paysReseau;
  if (!pays || pays === "FR") return null;
  if (sessionVintedFr === true) return null;   // il travaille déjà sur vinted.fr (Alberto, mpoe11raw)
  if (!ouverts || !ouverts.has(pays)) return null;
  const d = domaines?.[pays]?.domaine;
  if (!d) return null;
  return { pays, domaine: d, source: paysSonde ? "compte_vinted" : "reseau" };
}
