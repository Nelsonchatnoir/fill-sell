// ═══════════════════════════════════════════════════════════════════════════
// QUELLE BOUTIQUE VINTED EST OUVERTE DANS CHROME — UNE RÈGLE, DEUX LECTEURS
// (03/10, point 16 — Ornella, @ornella-vend et @luciatrendyshop)
// ═══════════════════════════════════════════════════════════════════════════
// get-pending-jobs RETIENT les republications et retraits Vinted d'une autre
// boutique que celle ouverte dans Chrome (garde du 04/09, élargie le 06/09).
// L'app, elle, lisait la boutique ouverte avec une AUTRE règle : la sonde
// seule, sans fraîcheur, sans le relevé du dressing — exactement la lecture
// que le serveur appelle « À L'ENVERS » juste après une bascule. Et la file
// des jobs ne regardait pas du tout la boutique : un job retenu y était « en
// attente de son tour ».
//
// LA RÈGLE, ici seulement : deux relevés d'identité — la sonde de l'extension
// (profiles.extension_sessions, au plus toutes les 10 min) et le dernier
// relevé du dressing (vinted_sync_runs, le compte RÉELLEMENT lu) ; le plus
// RÉCENT tranche, et il ne décide que s'il a moins de 30 min. Au-delà, on ne
// devine pas (le serveur sert, l'extension garde à la capture).
// (11/10, Rémi — sonde users/current en 403 la moitié du temps) TROISIÈME
// relevé, facultatif : la boutique lue SUR LA PAGE de l'annonce par la
// dernière capture de republication (vinted_republish_captures.payload.
// boutique_preuve : session, login_session, lu_le) — c'est le compte
// réellement connecté dans Chrome à cet instant, prouvé par Vinted.
// ES module sans import : lu par Deno (get-pending-jobs) et par l'app (Vite).

export const BOUTIQUE_FRAICHEUR_MS = 30 * 60 * 1000;

/**
 * @param {{ sessions?: Record<string, unknown> | null,
 *           run?: { vinted_user_id?: unknown, vinted_login?: unknown, started_at?: unknown } | null,
 *           capture?: { session?: unknown, login_session?: unknown, lu_le?: unknown } | null,
 *           maintenant?: number }} p
 * @returns {{ userId: string, login: string | null, source: "sonde" | "sync_dressing" | "capture", at: number, fraiche: boolean } | null}
 */
export function boutiqueConnecteeVinted({ sessions = null, run = null, capture = null, maintenant = Date.now() } = {}) {
  const ident = sessions && typeof sessions === "object" ? sessions["vinted_identite"] : null;
  const sources = [
    {
      source: "sonde",
      userId: ident && ident.user_id != null ? String(ident.user_id).trim() : "",
      login: ident && ident.login != null ? String(ident.login) : null,
      at: Date.parse(String(sessions && typeof sessions === "object" ? sessions["checked_at"] ?? "" : "")),
    },
    {
      source: "sync_dressing",
      userId: run && run.vinted_user_id != null ? String(run.vinted_user_id).trim() : "",
      login: run && run.vinted_login != null ? String(run.vinted_login) : null,
      at: Date.parse(String(run?.started_at ?? "")),
    },
    {
      source: "capture",
      userId: capture && capture.session != null ? String(capture.session).trim() : "",
      login: capture && capture.login_session != null ? String(capture.login_session) : null,
      at: Date.parse(String(capture?.lu_le ?? "")),
    },
  ].filter((s) => s.userId && Number.isFinite(s.at));
  sources.sort((a, b) => b.at - a.at);
  const vu = sources[0];
  if (!vu) return null;
  return { ...vu, fraiche: maintenant - vu.at <= BOUTIQUE_FRAICHEUR_MS };
}

/** Pseudo de chaque boutique confirmée (profiles.vinted_sync_pin) — jamais deviné. */
export function loginsDesBoutiques(pin) {
  const liste = pin && typeof pin === "object" && Array.isArray(pin.boutiques) ? pin.boutiques : [];
  const out = new Map();
  for (const b of liste) {
    if (!b || typeof b !== "object") continue;
    const id = String(b.user_id ?? "").trim();
    const login = b.login != null ? String(b.login).trim() : "";
    if (id) out.set(id, login || null);
  }
  return out;
}
