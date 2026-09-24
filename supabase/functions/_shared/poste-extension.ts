// ═══════════════════════════════════════════════════════════════════════════
// LE POSTE — UN COMPTE, PLUSIEURS CHROME (2026-09-24)
// ═══════════════════════════════════════════════════════════════════════════
// Cas fondateur : Louis (Business), 13 kits Opla bloqués une nuit entière.
// Les logs edge montrent UNE adresse IP, UN Chrome, mais DEUX sessions
// Supabase qui pollent en parallèle (deux profils Chrome, extension installée
// dans chacun, connectés au même compte). Le profil A a l'autorisation Opla,
// le profil B ne l'a pas. B prend un job Opla, le parque « Opla attend ton
// autorisation » ; A le relance au réveil de son service worker ; B le
// reprend… 131 parcages en une nuit, et Louis lit « Autorise Opla » alors
// qu'il l'a fait.
//
// Le serveur ne voyait qu'UN compte. Il doit voir des POSTES. L'identité d'un
// poste, c'est la SESSION du JWT (claim `session_id`) : stable tant que
// l'extension reste connectée, différente d'un profil Chrome à l'autre.
// `profiles.extension_postes` porte, par session : l'accès Opla (true /
// false / inconnu), la dernière fois qu'on l'a vu poller, son build.
//
// ⛔ Un poste SANS accès Opla ne reçoit plus AUCUN job Opla (get-pending-jobs).
// ⛔ Un parcage « Autoriser Opla » posé par un poste SANS accès, alors qu'un
//    AUTRE poste du compte a l'accès, est RELÂCHÉ en pending pour l'autre
//    (update-job-status) — jamais un « à toi » pour un geste déjà fait.
// ⛔ Les entrées vivent 48 h : un profil supprimé disparaît tout seul.

export type Poste = {
  opla_acces?: boolean | null;   // true = permission d'hôte opla.co présente ; false = absente ; absent = inconnu
  le?: string;                    // dernière fois vu (poll ou statut de job)
  build?: string;
  rearme_le?: string;             // dernière relance des jobs parqués faite pour ce poste
};

export const POSTE_TTL_MS = 48 * 3600_000;
/** « Vu récemment » : un poste qui polle est vu toutes les ~1-2 min. */
export const POSTE_FRAIS_MS = 30 * 60_000;
export const POSTES_MAX = 12;

/** Le claim `session_id` du JWT porté par la requête (sans vérification : la
 *  plateforme ou auth.getUser() l'a déjà faite en amont). null si illisible. */
export function sessionIdDuJwt(authHeader: string | null | undefined): string | null {
  try {
    const token = String(authHeader ?? "").replace(/^Bearer\s+/i, "").trim();
    const part = token.split(".")[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (part.length % 4)) % 4);
    const payload = JSON.parse(atob(b64));
    const sid = String(payload?.session_id ?? "").trim();
    return sid || null;
  } catch {
    return null;
  }
}

/** Les postes encore vivants (≤ 48 h), les plus récents d'abord, 12 au plus. */
export function postesVivants(brut: unknown, maintenant = Date.now()): Record<string, Poste> {
  const out: Record<string, Poste> = {};
  if (!brut || typeof brut !== "object" || Array.isArray(brut)) return out;
  const entrees = Object.entries(brut as Record<string, unknown>)
    .map(([sid, p]) => [sid, (p && typeof p === "object" ? p : {}) as Poste] as const)
    .filter(([, p]) => {
      const le = Date.parse(String(p.le ?? ""));
      return Number.isFinite(le) && maintenant - le <= POSTE_TTL_MS;
    })
    .sort((a, b) => Date.parse(String(b[1].le)) - Date.parse(String(a[1].le)))
    .slice(0, POSTES_MAX);
  for (const [sid, p] of entrees) out[sid] = { ...p };
  return out;
}

type Options = { saufSession?: string | null; depuisMs?: number; maintenant?: number };

function chercher(postes: Record<string, Poste>, acces: boolean, o: Options): { session: string; le: string } | null {
  const maintenant = o.maintenant ?? Date.now();
  const depuis = o.depuisMs ?? POSTE_FRAIS_MS;
  let meilleur: { session: string; le: string } | null = null;
  for (const [sid, p] of Object.entries(postes)) {
    if (o.saufSession && sid === o.saufSession) continue;
    if (p.opla_acces !== acces) continue;
    const le = Date.parse(String(p.le ?? ""));
    if (!Number.isFinite(le) || maintenant - le > depuis) continue;
    if (!meilleur || le > Date.parse(meilleur.le)) meilleur = { session: sid, le: String(p.le) };
  }
  return meilleur;
}

/** Un poste (autre que `saufSession`) dont l'accès Opla est PROUVÉ et vu depuis `depuisMs`. */
export function posteAvecAccesOpla(postes: Record<string, Poste>, o: Options = {}) {
  return chercher(postes, true, o);
}

/** Un poste dont l'ABSENCE d'accès Opla est connue et vu depuis `depuisMs`. */
export function posteSansAccesOpla(postes: Record<string, Poste>, o: Options = {}) {
  return chercher(postes, false, o);
}

/** Pour les journaux : les 8 premiers caractères, jamais la session entière. */
export function posteCourt(sid: string | null | undefined): string {
  return String(sid ?? "").slice(0, 8) || "?";
}
