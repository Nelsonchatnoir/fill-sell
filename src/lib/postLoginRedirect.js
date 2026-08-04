// ── Cible à honorer après le login (2026-08-04) ──────────────────────────────
// Posée par RequireAuth quand un visiteur déconnecté vise une page protégée
// qui n'est pas /app. Cas réel : le lien fillsell.app/extension envoyé par
// e-mail depuis l'accroche extension (ExtensionPitchScreen) — l'utilisateur
// l'ouvre sur son ordinateur, doit se connecter, et le login avalait la
// destination (tous les chemins font navigate('/app') en dur). C'est le
// maillon central de l'accroche : sans ça, l'écran de pitch ne sert à rien.
//
// localStorage et non le state du routeur : le flux OAuth web (Google/Apple)
// QUITTE le site et revient par /auth/callback — tout state React est perdu
// en route. La cible survit aussi au détour par la landing (RequireAuth
// renvoie vers /, l'utilisateur clique « Se connecter », puis /login).
//
// Garde-fous :
//  - liste FERMÉE de cibles (jamais une URL arbitraire venue du storage) ;
//  - TTL 30 min : pas de téléportation surprise vers /extension au login de
//    la semaine suivante si la visite du lien n'a pas abouti sur le moment.
const KEY = 'fs_next_after_login';
const ALLOWED_TARGETS = ['/extension'];
const TTL_MS = 30 * 60 * 1000;

export function rememberPostLoginTarget(path) {
  if (!ALLOWED_TARGETS.includes(path)) return;
  try { localStorage.setItem(KEY, JSON.stringify({ path, ts: Date.now() })); } catch { /* storage indisponible : le login retombera sur /app */ }
}

// Lit ET efface (consommation unique). null = rien à honorer → /app.
export function consumePostLoginTarget() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    localStorage.removeItem(KEY);
    const { path, ts } = JSON.parse(raw);
    if (!ALLOWED_TARGETS.includes(path)) return null;
    if (!Number.isFinite(ts) || Date.now() - ts > TTL_MS) return null;
    return path;
  } catch { return null; }
}
