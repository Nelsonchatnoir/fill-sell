// (04/11, décision de Nico : réparation (2) après l'incident de 12:25) LE COFFRE REFAIT DEPUIS UN PROFIL ARCHIVÉ.
// L'entretien a purgé le compte (coffre vidé) ; le profil d'avant est dans une archive. Ce outil lit la base « Cookies »
// de ce profil (Chromium Linux sans trousseau : « v10 », clé de base ; base en version ≥ 24 : 32 octets de condensé de
// l'hôte devant chaque valeur), en tire les cookies des plateformes demandées, et les écrit au coffre par le chemin
// normal (coffre.sauvegarderCookies) ; une plateforme qui était EN VÉRIFICATION le redevient (coffre.bloquer : session
// gardée, plateforme fermée). Jamais Beebs ici. Aucune requête vers une plateforme. Aucune valeur affichée.
//   node outils/restaurer-coffre-profil.mjs <user> <chemin/Cookies> [--ecrire]          (sans --ecrire : simulation)
//   options : --plateformes=vinted,leboncoin,depop  --bloquee=leboncoin  --preuve-le=<iso de l'archive>
import { DatabaseSync } from 'node:sqlite';
import { createDecipheriv, pbkdf2Sync } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { lireConfig } from '../src/config.js';
import { creerCoffre } from '../src/coffre.js';
import { cookiesDe, estConnectee } from '../src/plateformes.js';

const [user, chemin] = process.argv.slice(2);
const opt = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const ecrire = process.argv.includes('--ecrire');
const plateformes = opt('plateformes', 'vinted,leboncoin,depop').split(',').filter((p) => p && p !== 'beebs');
const bloquees = opt('bloquee', '').split(',').filter(Boolean);
const preuveLe = opt('preuve-le', null);
if (!/^[0-9a-f-]{36}$/.test(String(user ?? '')) || !chemin) { console.error('usage : restaurer-coffre-profil.mjs <user> <Cookies> [--ecrire]'); process.exit(2); }

const CLE = pbkdf2Sync('peanuts', 'saltysalt', 1, 16, 'sha1');
const db = new DatabaseSync(chemin, { readOnly: true });
const version = Number(db.prepare("SELECT value FROM meta WHERE key = 'version'").get()?.value ?? 0);
const dechiffrer = (buf) => {
  const b = Buffer.from(buf ?? []);
  if (b.subarray(0, 3).toString() !== 'v10') return null;
  const d = createDecipheriv('aes-128-cbc', CLE, Buffer.alloc(16, 0x20));
  let v = Buffer.concat([d.update(b.subarray(3)), d.final()]);
  if (version >= 24) v = v.subarray(32);
  return v.toString('utf8');
};
const SAMESITE = { 0: 'None', 1: 'Lax', 2: 'Strict' };
const PRIORITE = { 0: 'Low', 1: 'Medium', 2: 'High' };
const SCHEMA = { 0: 'Unset', 1: 'NonSecure', 2: 'Secure' };
const req = db.prepare('SELECT host_key, top_frame_site_key, name, encrypted_value, path, expires_utc, is_secure, is_httponly, is_persistent, priority, samesite, source_scheme, source_port, has_cross_site_ancestor FROM cookies');
req.setReadBigInts(true);
const cookies = [];
let illisibles = 0;
for (const r of req.all()) {
  const value = dechiffrer(r.encrypted_value);
  if (value == null) { illisibles++; continue; }
  const persistant = Number(r.is_persistent) === 1;
  cookies.push({
    name: r.name, value, domain: r.host_key, path: r.path,
    expires: persistant ? Number(r.expires_utc / 1000000n) - 11644473600 : -1, session: !persistant,
    secure: Number(r.is_secure) === 1, httpOnly: Number(r.is_httponly) === 1,
    ...(SAMESITE[Number(r.samesite)] ? { sameSite: SAMESITE[Number(r.samesite)] } : {}),
    ...(PRIORITE[Number(r.priority)] ? { priority: PRIORITE[Number(r.priority)] } : {}),
    ...(SCHEMA[Number(r.source_scheme)] ? { sourceScheme: SCHEMA[Number(r.source_scheme)] } : {}),
    ...(Number(r.source_port) > 0 ? { sourcePort: Number(r.source_port) } : {}),
    ...(r.top_frame_site_key ? { partitionKey: { topLevelSite: r.top_frame_site_key, hasCrossSiteAncestor: Number(r.has_cross_site_ancestor) === 1 } } : {}),
  });
}
const visees = plateformes.flatMap((p) => cookiesDe(cookies, p));
const bilanLu = Object.fromEntries(plateformes.map((p) => [p, { cookies: cookiesDe(cookies, p).length, connectee: estConnectee(cookies, p) }]));
console.log(JSON.stringify({ base_version: version, cookies_lus: cookies.length, illisibles, plateformes: bilanLu, ecrire }));
if (!ecrire) process.exit(0);
if (plateformes.some((p) => !bilanLu[p].connectee)) { console.error('REFUS : une plateforme demandée n\'a pas de session dans ce profil'); process.exit(1); }

const config = lireConfig();
const base = createClient(config.supabaseUrl, config.cleService, { auth: { persistSession: false, autoRefreshToken: false } });
const coffre = creerCoffre({ base, cle: config.cleCoffre, cleVersion: config.cleCoffreVersion, anciennes: config.clesCoffreAnciennes });
const preuve = { le: preuveLe ?? new Date().toISOString(), source: 'restauration_0411 (profil archivé, réparation de Nico)' };
const bilan = await coffre.sauvegarderCookies(user, visees, { verifiees: plateformes, preuves: Object.fromEntries(plateformes.map((p) => [p, preuve])) });
const bloque = {};
for (const p of bloquees) bloque[p] = await coffre.bloquer(user, p, { nature: 'glissiere', detail: 'cadre DataDome dans un onglet de travail (avant la réparation)', le: opt('bloquee-le', new Date().toISOString()) });
const relu = await coffre.lire(user);
console.log(JSON.stringify({ bilan, bloquees: bloque, coffre: Object.fromEntries(Object.entries(relu).map(([p, s]) => [p, { connecte: s?.connecte ?? null, cookies: s?.cookies?.length ?? 0, bloquee: Boolean(s?.bloquee) }])) }));
process.exit(0);
