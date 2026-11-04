// (02/11, demande de Nico : « test PROPRE sur Beebs, en partant de zéro ») EFFACER TOUT D'UNE PLATEFORME dans le navigateur
// Cloud d'un compte, et rien d'autre : cookies de tous ses domaines (DataDome compris), stockage de ses origines
// (localStorage, IndexedDB, Cache Storage, service workers…). Aucune visite de la plateforme ; les autres plateformes, leurs
// sessions et leurs témoins ne bougent pas. La ligne du coffre et l'état de l'app se règlent par le script de réparation
// qui accompagne (scripts/reparations/), le blocage par blocages.json avant le redémarrage.
// ⛔ (04/11, règle de Nico : « ne plus jamais repartir de zéro ») Le cookie de l'appareil DataDome (`datadome`) est GARDÉ
// par défaut, comme dans la purge des sessions (plateformes.js, COOKIES_GARDES) : l'effacer fait repasser la vérification
// de l'appareil sans aucun historique. `--avec-datadome` seulement sur décision explicite de Nico.
//   docker compose exec -T orchestrateur node outils/effacer-plateforme.mjs <user> <plateforme> [--avec-datadome]
import { lireConfig } from '../src/config.js';
import { connecterCdp } from '../src/cdp.js';
import { creerDocker } from '../src/docker.js';
import { nomConteneur, DOMAINES_VERROU } from '../src/navigateur.js';
import { versCookieParam } from '../src/plateformes.js';

// Les hôtes d'authentification propres à la plateforme (Beebs : son projet Firebase, où passe le retour de connexion).
const AUTRES_HOTES = { beebs: ['babytouch-782e4.firebaseapp.com'] };
const [user, plateforme] = process.argv.slice(2);
const domaines = [...(DOMAINES_VERROU[plateforme] ?? []), ...(AUTRES_HOTES[plateforme] ?? [])];
if (!/^[0-9a-f-]{36}$/.test(String(user ?? '')) || !DOMAINES_VERROU[plateforme]) { console.error('usage : effacer-plateforme.mjs <user> <plateforme>'); process.exit(2); }
const sienne = (d) => { const h = String(d ?? '').replace(/^\./, '').toLowerCase(); return domaines.some((x) => h === x || h.endsWith(`.${x}`)); };

const config = lireConfig();
const ins = await creerDocker({ socket: config.socketDocker }).inspecter(nomConteneur(user));
const ip = ins?.State?.Running ? Object.values(ins.NetworkSettings?.Networks ?? {})[0]?.IPAddress : null;
if (!ip) { console.log(JSON.stringify({ plateforme, navigateur: 'ferme' })); process.exit(0); }
const cdp = await connecterCdp(`ws://${ip}:3000/`, { delaiAppelMs: 20_000 });

// 1. Les cookies de ses domaines (un cookie déjà échu posé à leur place : la session du navigateur n'a pas deleteCookies).
const { cookies } = await cdp.send('Storage.getCookies');
const avecDatadome = process.argv.includes('--avec-datadome');
const vises = cookies.filter((c) => sienne(c.domain) && (avecDatadome || String(c.name ?? '').toLowerCase() !== 'datadome'));
if (vises.length) await cdp.send('Storage.setCookies', { cookies: vises.map((c) => ({ ...versCookieParam(c, 0), expires: 1 })) });

// 2. Le stockage de ses origines, tout type (Storage.clearDataForOrigin ; repli par une page vierge, comme postes.js).
const hotes = [...new Set([...domaines.flatMap((d) => (d.split('.').length === 2 ? [d, `www.${d}`] : [d])), ...vises.map((c) => c.domain.replace(/^\./, ''))])];
const origines = hotes.map((h) => `https://${h}`);
let par = 'navigateur';
try {
  for (const origin of origines) await cdp.send('Storage.clearDataForOrigin', { origin, storageTypes: 'all' });
} catch {
  par = 'page_vierge';
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', background: true });
  try {
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    for (const origin of origines) await cdp.send('Storage.clearDataForOrigin', { origin, storageTypes: 'all' }, sessionId);
  } finally { await cdp.send('Target.closeTarget', { targetId }).catch(() => {}); }
}

// 3. Relu : plus aucun cookie de la plateforme ; les autres intacts.
const apres = (await cdp.send('Storage.getCookies')).cookies;
const autres = (l) => l.filter((c) => !sienne(c.domain)).length;
console.log(JSON.stringify({ le: new Date().toISOString(), plateforme, cookies_effaces: vises.map((c) => `${c.domain} ${c.name}`),
  cookies_restants: apres.filter((c) => sienne(c.domain)).length, datadome_garde: !avecDatadome, autres_cookies_avant: autres(cookies), autres_cookies_apres: autres(apres),
  stockage: { origines, par } }));
cdp.fermer();
process.exit(0);
