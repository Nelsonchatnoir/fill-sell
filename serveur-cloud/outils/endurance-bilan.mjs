// (01/11) LE BILAN DE L'ESSAI DE 48 H — lu dans etat/endurance/mesures.jsonl (endurance.js), sans rien écrire.
//   docker compose exec -T orchestrateur node outils/endurance-bilan.mjs
// (01/11, règle de Nico) Les 48 h partent de la première connexion VÉRIFIÉE (compte lu) après la dernière remise à zéro
// (endurance-remise.mjs) ; rien d'avant la remise n'est compté (decompteEssai). (01/11, 23:10) Seules comptent les heures
// de MARCHE de chaque plateforme (navigateur ouvert, connectée, pas en vérification) ; les blocages en cours sont listés.
import { readFile } from 'node:fs/promises';
import { decompteEssai } from '../src/endurance.js';

const dossier = `${process.env.DOSSIER_ETAT || '/srv/fillsell-cloud/etat'}/endurance`;
const toutes = (await readFile(`${dossier}/mesures.jsonl`, 'utf8').catch(() => '')).split('\n').filter(Boolean)
  .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const decompte = decompteEssai(toutes);
const lignes = decompte.lignes;
const arret = await readFile(`${dossier}/arret.json`, 'utf8').then(JSON.parse).catch(() => null);
const mesures = lignes.filter((l) => l.evenement === 'mesure');
const stats = (v) => { const t = v.filter(Number.isFinite).sort((a, b) => a - b); return t.length ? { min: t[0], mediane: t[Math.floor(t.length / 2)], max: t.at(-1), n: t.length } : null; };
const parNavigateur = {};
for (const m of mesures) for (const [u, mo] of Object.entries(m.navigateursMo ?? {})) (parNavigateur[u] ??= []).push(mo);
const dernier = mesures.at(-1);
const blocages = await readFile(`${dossier}/blocages.json`, 'utf8').then(JSON.parse).catch(() => []);
console.log(JSON.stringify({
  remise_a_zero: decompte.remise, debut_48h: decompte.debut, executant_heures: decompte.executant_heures,
  plateformes_verifiees: decompte.plateformes,
  plateformes_en_verification: blocages.filter((b) => !b.debloquee_le).map((b) => ({ plateforme: b.plateforme, nature: b.nature, le: b.le })),
  blocages,
  premiere_mesure: mesures[0]?.le ?? null, derniere_mesure: dernier?.le ?? null, mesures: mesures.length,
  memoire_navigateur_mo: Object.fromEntries(Object.entries(parNavigateur).map(([u, v]) => [u, stats(v)])),
  memoire_serveur_disponible_mo: stats(mesures.map((m) => m.serveurMo?.disponible)),
  connexions_derniere: dernier?.connexions ?? null,
  evenements: lignes.filter((l) => l.evenement !== 'mesure').map((l) => ({ le: l.le, evenement: l.evenement, plateforme: l.plateforme ?? null, nature: l.nature ?? null })),
  verrou_dernier: dernier?.verrou ?? null,
  taches_dernieres: dernier?.taches ?? null,
  arret,
}, null, 1));
