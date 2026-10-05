// Les tickets de la page de connexion AUTONOME (servie par l'orchestrateur, pour
// le test sur le compte de Nico avant que l'écran de l'app soit livré) : un lien
// à usage court, signé HMAC-SHA256, qui ne porte qu'un compte et une échéance.
// Dans l'app, c'est la session Supabase de la personne qui fait foi (jeton).
import { createHmac, timingSafeEqual } from 'node:crypto';

const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64u = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

export function signerTicket({ user, minutes = 30, maintenant = Date.now() }, cle) {
  if (!/^[0-9a-f-]{36}$/i.test(String(user))) throw new Error('ticket : compte invalide');
  const corps = b64u(JSON.stringify({ u: user, e: Math.floor(maintenant / 1000) + Math.max(1, Math.min(120, minutes)) * 60 }));
  const sig = b64u(createHmac('sha256', Buffer.from(cle, 'base64')).update(corps).digest());
  return `${corps}.${sig}`;
}

/** Rend le compte du ticket, ou null (mal formé, falsifié, échu). */
export function verifierTicket(ticket, cle, maintenant = Date.now()) {
  const [corps, sig] = String(ticket ?? '').split('.');
  if (!corps || !sig) return null;
  const attendu = createHmac('sha256', Buffer.from(cle, 'base64')).update(corps).digest();
  const recu = deB64u(sig);
  if (recu.length !== attendu.length || !timingSafeEqual(recu, attendu)) return null;
  let p;
  try { p = JSON.parse(deB64u(corps).toString('utf8')); } catch { return null; }
  if (!p?.u || !Number.isFinite(p.e) || p.e * 1000 < maintenant) return null;
  return p.u;
}
