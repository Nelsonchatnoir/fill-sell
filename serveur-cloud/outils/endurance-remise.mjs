// (01/11) LA REMISE À ZÉRO DE L'ESSAI DE 48 H — une ligne 'remise_a_zero' dans etat/endurance/mesures.jsonl : le bilan
// (endurance-bilan.mjs, decompteEssai) ne compte plus rien d'avant ; les 48 h repartent de la première connexion
// VÉRIFIÉE qui suit. Rien d'autre n'est touché (ni la base, ni le navigateur, ni arret.json).
//   docker compose exec -T orchestrateur node outils/endurance-remise.mjs "<raison>"
import { appendFile, mkdir } from 'node:fs/promises';

const dossier = `${process.env.DOSSIER_ETAT || '/srv/fillsell-cloud/etat'}/endurance`;
const raison = String(process.argv[2] ?? '').trim().slice(0, 300);
if (!raison) { console.error('raison obligatoire'); process.exit(2); }
await mkdir(dossier, { recursive: true });
const ligne = { le: new Date().toISOString(), evenement: 'remise_a_zero', raison };
await appendFile(`${dossier}/mesures.jsonl`, `${JSON.stringify(ligne)}\n`);
console.log(JSON.stringify(ligne));
