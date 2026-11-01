// (01/11) LE BILAN DE L'ESSAI DE 48 H — lu dans etat/endurance/mesures.jsonl (endurance.js), sans rien écrire.
//   docker compose exec -T orchestrateur node outils/endurance-bilan.mjs [depuis_iso]
import { readFile } from 'node:fs/promises';

const dossier = `${process.env.DOSSIER_ETAT || '/srv/fillsell-cloud/etat'}/endurance`;
const depuis = Date.parse(process.argv[2] ?? '') || 0;
const lignes = (await readFile(`${dossier}/mesures.jsonl`, 'utf8').catch(() => '')).split('\n').filter(Boolean)
  .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((l) => l && Date.parse(l.le) >= depuis);
const arret = await readFile(`${dossier}/arret.json`, 'utf8').then(JSON.parse).catch(() => null);
const mesures = lignes.filter((l) => l.evenement === 'mesure');
const stats = (v) => { const t = v.filter(Number.isFinite).sort((a, b) => a - b); return t.length ? { min: t[0], mediane: t[Math.floor(t.length / 2)], max: t.at(-1), n: t.length } : null; };
const parNavigateur = {};
for (const m of mesures) for (const [u, mo] of Object.entries(m.navigateursMo ?? {})) (parNavigateur[u] ??= []).push(mo);
const dernier = mesures.at(-1);
console.log(JSON.stringify({
  premiere_mesure: mesures[0]?.le ?? null, derniere_mesure: dernier?.le ?? null, mesures: mesures.length,
  memoire_navigateur_mo: Object.fromEntries(Object.entries(parNavigateur).map(([u, v]) => [u, stats(v)])),
  memoire_serveur_disponible_mo: stats(mesures.map((m) => m.serveurMo?.disponible)),
  connexions_derniere: dernier?.connexions ?? null,
  evenements: lignes.filter((l) => l.evenement !== 'mesure').map((l) => ({ le: l.le, evenement: l.evenement, plateforme: l.plateforme ?? null, nature: l.nature ?? null })),
  verrou_dernier: dernier?.verrou ?? null,
  taches_dernieres: dernier?.taches ?? null,
  arret,
}, null, 1));
