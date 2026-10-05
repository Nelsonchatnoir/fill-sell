// Pose dans le coffre d'UN compte une session FillSell DÉJÀ fabriquée par le
// serveur (test réel : la session 0ba8903a du prototype, gardée pour le test sur
// décision de Nico, révoquée juste après). L'orchestrateur la reprend à
// l'ouverture du navigateur (la rafraîchit s'il le faut) au lieu d'en fabriquer
// une neuve. À lancer SUR le serveur ; la session arrive par l'entrée standard
// (base64 du JSON { access_token, refresh_token, expires_at, email }), jamais
// en argument (elle finirait dans l'historique du shell) :
//   docker compose exec -T orchestrateur node outils/importer-session.mjs <user_id> < session.b64
import { createClient } from '@supabase/supabase-js';
import { creerCoffre } from '../src/coffre.js';
import { claims } from '../src/sessionFillsell.js';

const [user] = process.argv.slice(2);
const lire = () => new Promise((ok) => { let s = ''; process.stdin.on('data', (d) => { s += d; }).on('end', () => ok(s.trim())); });
const own = JSON.parse(Buffer.from(await lire(), 'base64').toString('utf8'));
const c = claims(own?.access_token);
if (!user || !c || c.sub !== user || !own.refresh_token) {
  console.error('REFUS : session absente, illisible ou d\'un autre compte — rien n\'est écrit.');
  process.exit(1);
}
const base = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const coffre = creerCoffre({ base, cle: process.env.COFFRE_CLE, cleVersion: Number(process.env.COFFRE_CLE_VERSION || 1) });
await coffre.ecrire(user, 'fillsell', { own, le: new Date().toISOString(), importee: true }, true);
await base.rpc('cloud_poste_noter', { p_user: user, p_etat: 'eteint', p_details: { session_fillsell_id: c.session_id ?? '' } });
console.log(`Session ${String(c.session_id ?? '?').slice(0, 8)} posée au coffre de ${user.slice(0, 8)} (chiffrée). Rien d'autre n'a été touché.`);
