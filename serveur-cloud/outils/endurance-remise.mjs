// (01/11) LA REMISE À ZÉRO DE L'ESSAI DE 48 H — une ligne 'remise_a_zero' dans etat/endurance/mesures.jsonl : le bilan
// (endurance-bilan.mjs, decompteEssai) ne compte plus rien d'avant ; les 48 h repartent de la première connexion
// VÉRIFIÉE qui suit. Rien d'autre n'est touché (ni la base, ni le navigateur, ni arret.json).
//   docker compose exec -T orchestrateur node outils/endurance-remise.mjs "<raison>"
// (02/11, décision de Nico : « remets à zéro UNIQUEMENT Beebs ») La remise d'UNE plateforme : ses heures d'avant
// --depuis (par défaut : maintenant) ne comptent plus ; les autres plateformes ne bougent pas.
//   docker compose exec -T orchestrateur node outils/endurance-remise.mjs "<raison>" --plateforme beebs --depuis 2026-11-01T23:15:48Z
import { appendFile, mkdir } from 'node:fs/promises';

const PLATEFORMES = ['vinted', 'leboncoin', 'beebs', 'depop'];
const dossier = `${process.env.DOSSIER_ETAT || '/srv/fillsell-cloud/etat'}/endurance`;
const args = process.argv.slice(2);
const option = (nom) => { const i = args.indexOf(`--${nom}`); return i >= 0 ? String(args[i + 1] ?? '') : null; };
const raison = String(args.find((a, i) => !a.startsWith('--') && !String(args[i - 1] ?? '').startsWith('--')) ?? '').trim().slice(0, 300);
if (!raison) { console.error('raison obligatoire'); process.exit(2); }
const plateforme = option('plateforme');
if (plateforme !== null && !PLATEFORMES.includes(plateforme)) { console.error(`plateforme inconnue : ${plateforme}`); process.exit(2); }
const depuisBrut = option('depuis');
const depuis = depuisBrut === null ? null : Date.parse(depuisBrut);
if (depuisBrut !== null && (!plateforme || !Number.isFinite(depuis))) { console.error('--depuis : une date ISO, avec --plateforme'); process.exit(2); }
await mkdir(dossier, { recursive: true });
const le = new Date().toISOString();
const ligne = plateforme
  ? { le, evenement: 'remise_a_zero', plateforme, depuis: depuis === null ? le : new Date(depuis).toISOString(), raison }
  : { le, evenement: 'remise_a_zero', raison };
await appendFile(`${dossier}/mesures.jsonl`, `${JSON.stringify(ligne)}\n`);
console.log(JSON.stringify(ligne));
