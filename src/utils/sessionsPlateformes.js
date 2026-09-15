// ═══════════════════════════════════════════════════════════════════════════
// ÉTAT DE SESSION D'UNE PLATEFORME — CÔTÉ APP (2026-09-15)
//
// ⚠️ MIROIR de FILLSELL_CONFIG.SESSIONS (chrome-extension/config.js). Les deux
// bundles n'ont aucun module en commun — le popup est un <script> classique
// chargé par popup.html, l'app est de l'ESM compilé par Vite — donc deux
// copies de la même règle. Toute modification ici se reporte là-bas, et
// réciproquement ; les deux fichiers se citent pour qu'on ne l'oublie pas.
//
// TROIS ÉTATS, et pas un de plus :
//   'ok'     connecté       — sonde `true` fraîche, OU publication réussie
//                             récente (< 72 h)
//   'ko'     pas connecté   — `false` UNIQUEMENT. Jamais un 401, jamais un
//                             403, jamais un null (décision du 08/09 : le 401
//                             Vinted est ambigu — c'est la PAGE qui rafraîchit
//                             le token, pas un fetch de service worker — et le
//                             403 Leboncoin est un challenge DataDome).
//   null     jamais vérifié — on n'affirme rien.
//
// ⚠️ LE PLUS RÉCENT TRANCHE entre la sonde et la publication. Une déconnexion
//    observée il y a dix minutes prime sur un dépôt d'hier ; un dépôt d'il y a
//    dix minutes prime sur une sonde muette d'hier. On compare les DEUX
//    horodatages, on n'ordonne pas les sources par préférence.
// ═══════════════════════════════════════════════════════════════════════════

export const PLATEFORMES_SESSION = ["vinted", "leboncoin", "ebay", "beebs"];

// Fraîcheur exigée d'une SONDE, par plateforme — six fois sa cadence
// (Vinted 10 min, les trois autres 60 min depuis la 0.6.40). Au-delà, la
// valeur n'est pas fausse : elle est trop vieille pour être affirmée ici.
export const FRAICHEUR_SONDE_MS = {
  vinted: 60 * 60 * 1000,
  leboncoin: 3 * 60 * 60 * 1000,
  ebay: 3 * 60 * 60 * 1000,
  beebs: 3 * 60 * 60 * 1000,
};

// Une publication prouve la session pendant 72 h. Borne ARBITRÉE : les cookies
// de ces quatre places tiennent des semaines, mais « il a publié il y a trois
// semaines » ne dit plus rien d'aujourd'hui.
export const PUBLICATION_PROUVE_MS = 72 * 60 * 60 * 1000;

/**
 * L'état d'UNE plateforme, à partir du relevé de l'extension et de la date de
 * la dernière publication réussie.
 *
 * @param {object|null} sessions  profiles.extension_sessions, tel quel
 * @param {string} pf             plateforme
 * @param {number|null} publieLe  ms de la dernière publication réussie, ou null
 * @returns {'ok'|'ko'|null}
 */
export function etatSession(sessions, pf, publieLe = null) {
  const maintenant = Date.now();

  // ⚠️ FRAÎCHEUR PAR PLATEFORME, jamais le `checked_at` global (2026-09-15).
  // Le global est rafraîchi toutes les 10 min par la sonde Vinted : le lire
  // pour eBay laissait passer une valeur eBay vieille de trois heures comme si
  // elle datait de la minute. checked_at_par_plateforme existe pour ça.
  const brut = sessions?.checked_at_par_plateforme?.[pf] ?? sessions?.checked_at ?? null;
  const sondeVu = brut ? Date.parse(brut) : NaN;
  const sondeFraiche = Number.isFinite(sondeVu) && maintenant - sondeVu < (FRAICHEUR_SONDE_MS[pf] ?? 60 * 60 * 1000);
  const v = sessions?.[pf];
  const sondeDit = sondeFraiche && (v === true || v === false);

  const pub = Number(publieLe) || 0;
  const pubRecente = pub > 0 && maintenant - pub < PUBLICATION_PROUVE_MS;

  if (pubRecente && (!sondeDit || pub >= sondeVu)) return "ok";
  if (sondeDit) return v === true ? "ok" : "ko";
  return null;
}

/**
 * Le relevé RÉDUIT à ce qu'on a le droit d'afficher : true / false / absent.
 * Les lecteurs testent `=== true` et `=== false` — une plateforme dont on ne
 * sait rien n'a simplement pas de clé, et ne peut donc rien déclencher.
 */
export function sessionsAffichables(sessions, publicationsOk = {}) {
  if (!sessions || typeof sessions !== "object") return null;
  const out = {};
  let quelqueChose = false;
  for (const pf of PLATEFORMES_SESSION) {
    const e = etatSession(sessions, pf, publicationsOk?.[pf] ?? null);
    if (e === null) continue;
    out[pf] = e === "ok";
    quelqueChose = true;
  }
  // vinted_identite suit son état : si Vinted n'est pas affirmée, l'identité
  // de boutique ne doit pas l'être non plus.
  if (out.vinted === true && sessions.vinted_identite) out.vinted_identite = sessions.vinted_identite;
  return quelqueChose ? out : null;
}
