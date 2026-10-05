// LA SESSION FILLSELL DU NAVIGATEUR CLOUD — posée par le SERVEUR, jamais par
// un mot de passe (aucun mot de passe FillSell n'est stocké nulle part).
//
// Le mécanisme éprouvé le 26/09 (prototype, GO de Nico) et celui de la
// fonction extension-session de la prod : admin/generate_link (magiclink,
// AUCUN e-mail envoyé) → /verify (token_hash) → une session NEUVE, famille de
// refresh token propre. Elle est rangée CHIFFRÉE au coffre (ligne 'fillsell')
// et posée dans le stockage de l'extension (fillsell_session_own), au format
// exact qu'elle lit. Son auth.sessions.id devient le « poste » du compte :
// c'est par lui que la réservation atomique des jobs sait qui les tient.
//
// ⛔ UN SEUL DÉTENTEUR DU REFRESH TOKEN À LA FOIS (Supabase le fait tourner, et
//    le réemploi d'un jeton déjà utilisé révoque toute la famille) :
//    · navigateur ÉTEINT  : le coffre détient la session ;
//    · navigateur ALLUMÉ  : l'extension la détient ; l'orchestrateur la RELIT
//      (jamais ne la rafraîchit) toutes les 10 min et à la fermeture.
//    Session morte (famille révoquée, extension sans session) → on en fabrique
//    une neuve et on révoque l'ancienne. Jamais de boucle : au plus une
//    fabrication par compte et par heure.
import { createHash } from 'node:crypto';

export const CLE_OWN = 'fillsell_session_own';
export const CLE_USER = 'fillsell_last_user';

export const claims = (jwt) => {
  try { return JSON.parse(Buffer.from(String(jwt).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); } catch { return null; }
};

/** L'identifiant Chrome d'une extension non empaquetée, depuis la clé publique de son manifest. */
export function idExtensionDepuisCle(cleBase64) {
  const der = Buffer.from(String(cleBase64), 'base64');
  return [...createHash('sha256').update(der).digest('hex').slice(0, 32)].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
}

/** Une session telle que l'extension la lit. Refuse tout ce qui n'est pas au bon compte. */
export function sessionPourExtension(d, user) {
  const c = claims(d?.access_token);
  if (!c || c.sub !== user) throw new Error('session refusée : pas celle de ce compte');
  if (!d.refresh_token) throw new Error('session refusée : refresh token absent');
  return {
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    expires_at: d.expires_at ?? (Math.floor(Date.now() / 1000) + (d.expires_in ?? 3600)),
    email: d.user?.email ?? d.email ?? null,
  };
}

export function creerSessionsFillsell({ config, base, journal }) {
  const derniereFabrication = new Map();

  /** Fabrique une session NEUVE pour ce compte. Rend { own, sessionId }. */
  async function fabriquer(user) {
    const avant = derniereFabrication.get(user) ?? 0;
    if (Date.now() - avant < 60 * 60_000) throw new Error('fabrication refusée : déjà une dans l\'heure (jamais de boucle)');
    derniereFabrication.set(user, Date.now());
    const { data: u, error: e0 } = await base.auth.admin.getUserById(user);
    if (e0 || !u?.user?.email) throw new Error(`compte illisible : ${e0?.message ?? 'sans e-mail'}`);
    const r1 = await fetch(`${config.supabaseUrl}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: config.cleService, Authorization: `Bearer ${config.cleService}` },
      body: JSON.stringify({ type: 'magiclink', email: u.user.email }),
    });
    const d1 = await r1.json().catch(() => ({}));
    if (!r1.ok) throw new Error(`generate_link → HTTP ${r1.status}`);
    const uid = d1.id ?? d1.user?.id;
    const hashed = d1.hashed_token ?? d1.properties?.hashed_token;
    if (uid !== user) throw new Error('generate_link : un autre compte a été rendu — rien n\'est échangé');
    if (!hashed) throw new Error('generate_link : hashed_token absent');
    const r2 = await fetch(`${config.supabaseUrl}/auth/v1/verify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: config.cleAnon },
      body: JSON.stringify({ type: 'magiclink', token_hash: hashed }),
    });
    const d2 = await r2.json().catch(() => ({}));
    if (!r2.ok || !d2.access_token) throw new Error(`verify → HTTP ${r2.status}`);
    const own = sessionPourExtension(d2, user);
    const sessionId = claims(own.access_token)?.session_id ?? null;
    journal.info('session_fillsell_fabriquee', { user, session: sessionId?.slice(0, 8) });
    return { own, sessionId };
  }

  /** Révoque CETTE session (et elle seule) : auth.sessions par la RPC du socle. */
  async function revoquer(user, sessionId) {
    if (!sessionId) return { revoquee: true, rien: true };
    const { data, error } = await base.rpc('cloud_session_revoquer', { p_user: user, p_session: sessionId });
    if (error) throw new Error(`cloud_session_revoquer : ${error.message}`);
    return { revoquee: true, lignes: Number(data ?? 0) };
  }

  /** Une session (navigateur éteint) est-elle encore vivante ? Rafraîchie si besoin : rend la nouvelle. */
  async function rafraichirHorsNavigateur(own) {
    const restant = (own.expires_at ?? 0) * 1000 - Date.now();
    if (restant > 10 * 60_000) {
      const r = await fetch(`${config.supabaseUrl}/auth/v1/user`, { headers: { apikey: config.cleAnon, Authorization: `Bearer ${own.access_token}` } });
      if (r.ok) return own;
    }
    const r = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: config.cleAnon },
      body: JSON.stringify({ refresh_token: own.refresh_token }),
    });
    if (!r.ok) return null;
    const d = await r.json();
    return { ...own, access_token: d.access_token, refresh_token: d.refresh_token, expires_at: d.expires_at ?? Math.floor(Date.now() / 1000) + (d.expires_in ?? 3600) };
  }

  return { fabriquer, revoquer, rafraichirHorsNavigateur };
}

// ── Dans le navigateur : le stockage de l'extension ───────────────────────────

/** Évalue dans l'extension : son service worker s'il tourne, sinon sa page popup (ouverte puis fermée). */
export async function evaluerDansExtension(cdp, idExtension, expression) {
  const cibles = (await cdp.send('Target.getTargets')).targetInfos;
  const sw = cibles.find((t) => t.type === 'service_worker' && t.url.startsWith(`chrome-extension://${idExtension}/`));
  let targetId = null;
  if (!sw) {
    ({ targetId } = await cdp.send('Target.createTarget', { url: `chrome-extension://${idExtension}/popup.html`, background: true }));
  }
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: sw?.targetId ?? targetId, flatten: true });
  try {
    if (targetId) await new Promise((r) => setTimeout(r, 1500));
    const res = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (res?.exceptionDetails) throw new Error("évaluation dans l'extension : exception");
    return res?.result?.value;
  } finally {
    await cdp.send('Target.detachFromTarget', { sessionId }).catch(() => {});
    if (targetId) await cdp.send('Target.closeTarget', { targetId }).catch(() => {});
  }
}

export async function poserDansExtension(cdp, idExtension, own, user) {
  const valeur = { [CLE_OWN]: own, [CLE_USER]: { sub: user, email: own.email ?? null, vu_le: new Date().toISOString() } };
  const expr = `chrome.storage.local.set(${JSON.stringify(valeur)}).then(() => chrome.storage.local.get(${JSON.stringify(CLE_OWN)}))`
    + `.then((v) => Boolean(v[${JSON.stringify(CLE_OWN)}] && v[${JSON.stringify(CLE_OWN)}].refresh_token))`;
  return (await evaluerDansExtension(cdp, idExtension, expr)) === true;
}

export async function lireDansExtension(cdp, idExtension) {
  const expr = `chrome.storage.local.get([${JSON.stringify(CLE_OWN)}, ${JSON.stringify(CLE_USER)}]).then((s) => ({ own: s[${JSON.stringify(CLE_OWN)}] || null, user: s[${JSON.stringify(CLE_USER)}] || null }))`;
  return evaluerDansExtension(cdp, idExtension, expr);
}
