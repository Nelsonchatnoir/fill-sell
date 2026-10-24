// selftest:acquisition-rpc — (25/10 nuit, point 6) l'origine d'une inscription se pose par la RPC poser_origine_inscription (migration 20261025013000), plus par un UPDATE refusé (403 silencieux depuis le 06/07).
// Vérifie la proposition côté app (acquisition.apres.js) sans navigateur ni réseau : faux localStorage, faux
// client supabase qui note l'appel. Attendu : un appel rpc('poser_origine_inscription', {7 paramètres}),
// plus AUCUN .from('profiles').update(...) ; une erreur rendue est signalée (console.warn), jamais levée.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ICI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'utils');
const stock = new Map();
globalThis.localStorage = { getItem: (k) => stock.get(k) ?? null, setItem: (k, v) => stock.set(k, String(v)) };
const { poserSourceSurProfil } = await import(pathToFileURL(path.join(ICI, 'acquisition.js')).href);

let ko = 0;
const ok = (c, m, d = '') => { console.log(`${c ? '  ✓' : '  ✗'} ${m}${c || !d ? '' : `   ← ${d}`}`); if (!c) ko++; };
const faux = (reponse = { error: null }) => {
  const appels = [];
  return {
    appels,
    rpc: async (nom, args) => { appels.push({ nom, args }); return reponse; },
    from: (table) => { appels.push({ from: table }); return { update: () => ({ eq: async () => ({ error: null }) }) }; },
  };
};

const avant = new Date(Date.now() - 3 * 3600e3).toISOString();
stock.set('fs_acq', JSON.stringify({ source: 'facebook', medium: 'paid_social', campaign: 'c1', content: 'v2', fbclid: 'IwAR', referrer: 'https://l.facebook.com', at: avant }));

const sb = faux();
await poserSourceSurProfil(sb, 'uid-1', { createdAt: new Date(Date.now() - 2 * 3600e3).toISOString() });
ok(sb.appels.length === 1 && sb.appels[0].nom === 'poser_origine_inscription', 'un seul appel : la RPC', JSON.stringify(sb.appels));
const a = sb.appels[0]?.args ?? {};
ok(a.p_source === 'facebook' && a.p_medium === 'paid_social' && a.p_campaign === 'c1' && a.p_content === 'v2'
  && a.p_fbclid === 'IwAR' && a.p_referrer === 'https://l.facebook.com' && a.p_captee_le === avant
  && Object.keys(a).length === 7, 'les 7 paramètres, noms exacts de la fonction SQL', JSON.stringify(a));
ok(!sb.appels.some((x) => x.from), 'plus aucun UPDATE direct de profiles');

const sb2 = faux();
await poserSourceSurProfil(sb2, 'uid-2', { createdAt: new Date(Date.now() - 40 * 86400e3).toISOString() });
ok(sb2.appels.length === 0, 'compte de 40 jours : aucun appel (garde locale conservée)');

const avertissements = [];
const warn = console.warn; console.warn = (...x) => avertissements.push(x.join(' '));
const sb3 = faux({ error: { message: 'permission denied', code: '42501' } });
let leve = false;
try { await poserSourceSurProfil(sb3, 'uid-3', { createdAt: new Date(Date.now() - 3600e3).toISOString() }); } catch { leve = true; }
console.warn = warn;
ok(!leve && avertissements.some((l) => /source non enregistrée/.test(l)), 'erreur rendue : signalée, jamais levée', JSON.stringify(avertissements));

console.log(ko ? `\n${ko} ÉCHEC(S)` : '\nTOUT VERT');
process.exit(ko ? 1 : 0);
