// Un lien de connexion AUTONOME (test, avant que l'écran de l'app soit livré),
// pour UN compte, valable 30 minutes. À lancer SUR le serveur :
//   docker compose -f /srv/fillsell-cloud/deploiement/docker-compose.yml exec orchestrateur \
//     node outils/ticket.mjs <user_id> [minutes]
import { signerTicket } from '../src/tickets.js';

const [user, minutes] = process.argv.slice(2);
const cle = process.env.TICKETS_CLE;
const domaine = process.env.DOMAINE;
if (!user || !cle || !domaine) { console.error('usage : node outils/ticket.mjs <user_id> [minutes] (TICKETS_CLE et DOMAINE dans l\'environnement)'); process.exit(1); }
const t = signerTicket({ user, minutes: Number(minutes) || 30 }, cle);
console.log(`https://${domaine}/connexion?ticket=${t}`);
