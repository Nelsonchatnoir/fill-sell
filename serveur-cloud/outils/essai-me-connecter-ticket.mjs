// L'ÉCRAN « ME CONNECTER » RÉEL, OUVERT PAR UN TICKET SERVEUR (08/11/2026 soir, urgence Leboncoin — ordre de Nico :
// « prouve-le sans moi, ne tape aucun identifiant »). À lancer DANS le conteneur de l'orchestrateur en service :
//   docker exec -i deploiement-orchestrateur-1 node outils/essai-me-connecter-ticket.mjs <user_id> <plateforme> <secondes> [départ ISO]
// Même chemin que l'app : WebSocket /connexion/ws de CE serveur, message « ouvrir » au format téléphone (390 × 844, dpr 2,
// zoom), ticket signé par la clé du serveur (TICKETS_CLE, jamais affichée). Aucun identifiant n'est saisi : la page de
// connexion s'ouvre, on lit ses états et ses images, puis on ferme comme la personne (« client »).
// `départ` (optionnel) : l'instant exact d'ouverture — pour tomber PENDANT le tour du planificateur (cas du client).
// Sortie : une ligne JSON (états horodatés, nombre d'images) ; la dernière image dans /tmp/essai-<plateforme>.img.
import { writeFileSync } from 'node:fs';
import WebSocket from 'ws';
import { signerTicket } from '../src/tickets.js';

const [user, plateforme, secondes, depart] = process.argv.slice(2);
if (!/^[0-9a-f-]{36}$/i.test(String(user)) || !plateforme || !Number(secondes)) {
  console.error('usage : node outils/essai-me-connecter-ticket.mjs <user_id> <plateforme> <secondes> [départ ISO]');
  process.exit(1);
}
const cle = process.env.TICKETS_CLE;
if (!cle) { console.error('TICKETS_CLE absent de l’environnement'); process.exit(1); }
const ticket = signerTicket({ user, minutes: 15 }, cle);
if (depart) { const t = Date.parse(depart); while (Date.now() < t) await new Promise((r) => setTimeout(r, 10)); }

const t0 = Date.now();
const evenements = [];
let images = 0;
let derniere = null;
const ws = new WebSocket(`ws://127.0.0.1:${process.env.PORT || 8080}/connexion/ws`);
ws.on('open', () => {
  evenements.push({ ms: Date.now() - t0, quoi: 'ws_ouvert', le: new Date().toISOString() });
  ws.send(JSON.stringify({ t: 'ouvrir', ticket, plateforme, largeur: 390, hauteur: 844, dpr: 2, lang: 'fr', zoom: true }));
});
ws.on('message', (d, binaire) => {
  // Comme l'app (clientConnexion.js) : chaque image est accusée — sans accusé, le serveur s'arrête à 2 images en vol.
  if (binaire) { images += 1; derniere = d; try { ws.send(JSON.stringify({ t: 'ack' })); } catch { /* fermé */ } return; }
  let m = null;
  try { m = JSON.parse(String(d)); } catch { return; }
  evenements.push({ ms: Date.now() - t0, quoi: m.t, etape: m.etape ?? null, message: String(m.message ?? '').slice(0, 140) });
});
ws.on('close', (code, raison) => evenements.push({ ms: Date.now() - t0, quoi: 'ws_ferme', code, raison: String(raison) }));
ws.on('error', (e) => evenements.push({ ms: Date.now() - t0, quoi: 'ws_erreur', erreur: e.message }));
await new Promise((r) => setTimeout(r, Number(secondes) * 1000));
if (derniere) writeFileSync(`/tmp/essai-${plateforme}.img`, derniere);
try { ws.close(1000); } catch { /* déjà fermé */ }
await new Promise((r) => setTimeout(r, 800));
console.log(JSON.stringify({ plateforme, images, depart: new Date(t0).toISOString(), evenements }));
process.exit(0);
