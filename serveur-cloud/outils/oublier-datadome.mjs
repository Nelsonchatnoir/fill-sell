// (02/11, demande de Nico : « Beebs — identité propre ») OUBLIER L'APPAREIL DATADOME D'UNE PLATEFORME, et rien d'autre :
// le cookie `datadome` de SON domaine part du navigateur ouvert ET de sa ligne du coffre (sinon il reviendrait au
// prochain démarrage). La session de la plateforme (jetons, compte) et les autres plateformes ne bougent pas ; l'état de la
// ligne du coffre (connectée, en vérification) est gardé tel quel. Aucune visite de la plateforme.
//   docker compose exec -T orchestrateur node outils/oublier-datadome.mjs <user> <plateforme>
import { createClient } from '@supabase/supabase-js';
import { lireConfig } from '../src/config.js';
import { creerCoffre, chiffrer } from '../src/coffre.js';
import { connecterCdp } from '../src/cdp.js';
import { creerDocker } from '../src/docker.js';
import { nomConteneur, DOMAINES_VERROU } from '../src/navigateur.js';
import { versCookieParam } from '../src/plateformes.js';

const [user, plateforme] = process.argv.slice(2);
const domaines = DOMAINES_VERROU[plateforme];
if (!/^[0-9a-f-]{36}$/.test(String(user ?? '')) || !domaines) { console.error('usage : oublier-datadome.mjs <user> <plateforme>'); process.exit(2); }
const deLaPlateforme = (d) => { const h = String(d ?? '').replace(/^\./, '').toLowerCase(); return domaines.some((x) => h === x || h.endsWith(`.${x}`)); };
const estDataDome = (c) => String(c?.name ?? '').toLowerCase() === 'datadome' && deLaPlateforme(c.domain);

const config = lireConfig();
const base = createClient(config.supabaseUrl, config.cleService, { auth: { persistSession: false } });
const bilan = { navigateur: 'ferme', coffre: 'absente' };

// 1. Le navigateur ouvert : le cookie part (un cookie déjà échu posé à sa place, comme postes.purgerSessions : la session
//    du navigateur n'a pas Network.deleteCookies).
const ins = await creerDocker({ socket: config.socketDocker }).inspecter(nomConteneur(user));
const ip = ins?.State?.Running ? Object.values(ins.NetworkSettings?.Networks ?? {})[0]?.IPAddress : null;
if (ip) {
  const cdp = await connecterCdp(`ws://${ip}:3000/`, { delaiAppelMs: 20_000 });
  const { cookies } = await cdp.send('Storage.getCookies');
  const vises = cookies.filter(estDataDome);
  if (vises.length) await cdp.send('Storage.setCookies', { cookies: vises.map((c) => ({ ...versCookieParam(c, 0), expires: 1 })) });
  const restants = (await cdp.send('Storage.getCookies')).cookies.filter(estDataDome).length;
  bilan.navigateur = { effaces: vises.map((c) => c.domain), restants };
  cdp.fermer();
}

// 2. La ligne du coffre : réécrite sans le cookie, même état (connecte, en vérification), même contenu par ailleurs.
const coffre = creerCoffre({ base, cle: config.cleCoffre, cleVersion: config.cleCoffreVersion, anciennes: config.clesCoffreAnciennes });
const lu = (await coffre.lire(user))[plateforme];
if (lu && !lu.illisible) {
  const { connecte, maj_le: _m, cle_ancienne: _a, ...contenu } = lu;
  const avant = (contenu.cookies ?? []).length;
  contenu.cookies = (contenu.cookies ?? []).filter((c) => !estDataDome(c));
  if (contenu.cookies.length !== avant) {
    const { chiffre, iv } = chiffrer(contenu, Buffer.from(config.cleCoffre, 'base64'), { user, plateforme });
    const { error } = await base.from('cloud_coffre').update({ chiffre, iv, cle_version: config.cleCoffreVersion, maj_le: new Date().toISOString() })
      .eq('user_id', user).eq('plateforme', plateforme);
    if (error) { console.error(JSON.stringify({ ...bilan, coffre: `echec : ${error.message}` })); process.exit(1); }
  }
  bilan.coffre = { retires: avant - contenu.cookies.length, gardes: contenu.cookies.length, connecte, en_verification: Boolean(contenu.bloquee) };
}
console.log(JSON.stringify({ le: new Date().toISOString(), plateforme, ...bilan }));
process.exit(0);
