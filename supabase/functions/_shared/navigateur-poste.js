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
  edge: "Microsoft Edge", chrome: "Google Chrome", opera: "Opera", firefox: "Firefox", safari: "Safari", brave: "Brave",
});

// ── BRAVE, ET LE NOM DANS LES MESSAGES (30/10, lot E — Amiral) ──────────────
// Brave envoie l'User-Agent de Chrome : lu sur l'en-tête, il passait pour « chrome », et le message anti-robot disait
// « ouvre leboncoin.fr dans Chrome ». L'extension (0.6.161) déclare désormais son navigateur, lu DANS le navigateur
// (navigator.brave, marques UA-CH), dans le corps de get-pending-jobs et d'update-job-status (`navigateur`). Ordre :
// la déclaration de l'extension, l'en-tête d'indices client sec-ch-ua s'il arrive, l'User-Agent (Edge, Opera) ;
// « chrome » lu sur le seul User-Agent n'est PAS une preuve (Brave s'y cache) : il ne nomme rien dans un message.
const DECLARES = Object.freeze({ chrome: "chrome", "google chrome": "chrome", brave: "brave", edge: "edge", "microsoft edge": "edge", opera: "opera" });
/** Le code du navigateur déclaré par l'extension ("brave", "edge"…), ou null (valeur hors liste ignorée). */
export function navigateurDeclare(v) {
  return DECLARES[String(v ?? "").trim().toLowerCase()] ?? null;
}
const entete = (headers, nom) => {
  try { return String((typeof headers?.get === "function" ? headers.get(nom) : headers?.[nom]) ?? ""); } catch { return ""; }
};
/**
 * Le navigateur d'une requête d'extension : { code, sur } — `sur` = vrai quand le nom peut être écrit dans un message
 * (déclaré, sec-ch-ua, ou Edge/Opera sur l'User-Agent ; « chrome » du seul User-Agent ne l'est pas).
 */
export function navigateurDeLaRequete(body, headers) {
  const declare = navigateurDeclare(body?.navigateur);
  if (declare) return { code: declare, sur: true };
  const ch = entete(headers, "sec-ch-ua");
  if (/"Brave"/i.test(ch)) return { code: "brave", sur: true };
  if (/Microsoft Edge/i.test(ch)) return { code: "edge", sur: true };
  if (/"Opera"/i.test(ch)) return { code: "opera", sur: true };
  if (/Google Chrome/i.test(ch)) return { code: "chrome", sur: true };
  const ua = navigateurDeUA(entete(headers, "user-agent"));
  if (ua === "edge" || ua === "opera") return { code: ua, sur: true };
  return { code: ua, sur: false };
}
const COURT = Object.freeze({ chrome: "Chrome", brave: "Brave", edge: "Edge", opera: "Opera", firefox: "Firefox", safari: "Safari" });
/** Le nom court à écrire (« Brave », « Chrome »…) quand il est sûr, sinon null. */
export function nomCourtSur(nav) {
  return nav && nav.sur && COURT[nav.code] ? COURT[nav.code] : null;
}
/** « dans Brave » / « dans Chrome » / « dans ton navigateur » — jamais « Chrome » au hasard. */
export function dansLeNavigateur(nomCourt) {
  const n = Object.values(COURT).includes(String(nomCourt ?? "")) ? String(nomCourt) : null;
  return n ? `dans ${n}` : "dans ton navigateur";
}

/**
 * Un message déjà écrit qui nomme « Chrome » en dur (« … dans Chrome », « Ouvre Chrome », « et Chrome est ouvert ») :
 * le navigateur RÉEL (nom court sûr), sinon « ton navigateur ». Chrome connu : le texte ne change pas. Ce n'est
 * jamais une marque produit (« Chrome Web Store ») qui est remplacée.
 */
export function nommerLeNavigateur(texte, nomCourt) {
  if (typeof texte !== "string" || !texte.includes("Chrome")) return texte;
  const n = Object.values(COURT).includes(String(nomCourt ?? "")) ? String(nomCourt) : null;
  if (n === "Chrome") return texte;
  return texte
    .replace(/\bdans Chrome\b(?! Web Store)/g, n ? `dans ${n}` : "dans ton navigateur")
    .replace(/\b(O|o)uvre Chrome\b(?! Web Store)/g, (_m, o) => `${o}uvre ${n ?? "ton navigateur"}`)
    .replace(/\bet Chrome est ouvert\b/g, `et ${n ?? "ton navigateur"} est ouvert`);
}

/** Code pays ISO à deux lettres de l'en-tête cf-ipcountry, sinon null (XX, T1 = inconnu / Tor). */
export function paysDeEntete(v) {
  const p = String(v ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(p) && p !== "XX" && p !== "T1" ? p : null;
}

// ── LE PAYS DE L'APPAREIL (15/10, lot B — Marta) ────────────────────────────
// L'en-tête cf-ipcountry est vu par la passerelle Supabase (journaux : « IT »
// pour Marta) mais n'arrive JAMAIS au code de la fonction : sur 138 postes vus
// en 7 jours, 0 portait un pays — le bouton « Autoriser vinted.it » conçu pour
// elle (0.6.106) ne pouvait donc pas paraître. Le signal qui arrive vraiment :
// le FUSEAU de l'appareil où tourne l'app (Intl), noté par l'app quand Vinted
// n'est pas connecté (platform_settings.vinted.pays_appareil). C'est une
// DÉDUCTION, comme le réseau : le popup ne l'affirme pas (« Si ton compte
// Vinted est sur… »). Le pays du COMPTE (sonde) prime toujours.
// Fuseaux IANA des 18 pays Vinted de la zone euro (_shared/vinted-pays.ts).
const FUSEAUX_PAYS = Object.freeze({
  "Europe/Paris": "FR", "Europe/Monaco": "FR",
  "Europe/Brussels": "BE", "Europe/Luxembourg": "LU", "Europe/Amsterdam": "NL",
  "Europe/Berlin": "DE", "Europe/Busingen": "DE", "Europe/Vienna": "AT",
  "Europe/Rome": "IT", "Europe/Vatican": "IT", "Europe/San_Marino": "IT",
  "Europe/Madrid": "ES", "Atlantic/Canary": "ES", "Africa/Ceuta": "ES",
  "Europe/Lisbon": "PT", "Atlantic/Madeira": "PT", "Atlantic/Azores": "PT",
  "Europe/Dublin": "IE", "Europe/Helsinki": "FI", "Europe/Tallinn": "EE",
  "Europe/Riga": "LV", "Europe/Vilnius": "LT", "Europe/Bratislava": "SK",
  "Europe/Ljubljana": "SI", "Europe/Zagreb": "HR", "Europe/Athens": "GR",
});

/** Code pays ISO de la zone euro Vinted pour un fuseau IANA, sinon null. */
export function paysDeFuseau(fuseau) {
  return FUSEAUX_PAYS[String(fuseau ?? "").trim()] ?? null;
}

/** Le pays d'appareil retenu dans platform_settings (vinted.pays_appareil), sinon null. */
export function paysAppareilDesReglages(ps) {
  const v = ps && typeof ps === "object" && ps.vinted && typeof ps.vinted === "object" ? ps.vinted.pays_appareil : null;
  const p = String(v ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(p) ? p : null;
}

/**
 * Le vendeur Vinted ÉTRANGER à qui l'extension propose « Autoriser vinted.<cc> ».
 * Jamais un Français : pays FR, session vinted.fr vivante, ou pays fermé → null.
 * @param {{ paysSonde?: string|null, paysAppareil?: string|null, paysReseau?: string|null, ouverts: Set<string>,
 *           sessionVintedFr?: boolean|null, domaines: Record<string, {domaine: string}> }} p
 */
export function vintedEtranger({ paysSonde = null, paysAppareil = null, paysReseau = null, ouverts, sessionVintedFr = null, domaines }) {
  // Le pays du COMPTE Vinted (sonde) prime ; puis celui de l'appareil (15/10),
  // puis celui du réseau (jamais reçu à ce jour, gardé s'il arrive un jour).
  const pays = paysSonde || paysAppareil || paysReseau;
  if (!pays || pays === "FR") return null;
  if (sessionVintedFr === true) return null;   // il travaille déjà sur vinted.fr (Alberto, mpoe11raw)
  if (!ouverts || !ouverts.has(pays)) return null;
  const d = domaines?.[pays]?.domaine;
  if (!d) return null;
  return { pays, domaine: d, source: paysSonde ? "compte_vinted" : paysAppareil ? "appareil" : "reseau" };
}
