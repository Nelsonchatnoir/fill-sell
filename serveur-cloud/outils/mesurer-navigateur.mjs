// MESURE la mémoire d'UN navigateur Cloud allumé — SUR le serveur, dans le
// conteneur de l'orchestrateur (05/10/2026). Sert à fixer NAVIGATEURS_MAX et la
// capacité d'un serveur (docs/cloud/pool-ip.md, § 4) sur un chiffre MESURÉ.
//
//   docker compose exec -T orchestrateur node outils/mesurer-navigateur.mjs < url-du-proxy
//
// L'URL du proxy de test arrive sur l'entrée standard (jamais en argument, jamais
// affichée). Un compte FICTIF, un profil NEUF, détruit à la fin ; seulement des
// pages publiques (accueil Vinted puis Leboncoin, sans compte) : la même visite
// que le contrôle d'entrée d'une IP. Rend une ligne JSON, rien d'autre de secret.
import { readFileSync } from 'node:fs';
import { lireConfig } from '../src/config.js';
import * as journal from '../src/journal.js';
import { creerDocker } from '../src/docker.js';
import { creerNavigateurs, nomConteneur, nouveauProfilId } from '../src/navigateur.js';

const MESURE = '00000000-0000-4000-8000-00000000a5a5';   // jamais un vrai compte (aucun uuid réel n'a ce motif)
const PAGES = ['https://www.vinted.fr/', 'https://www.leboncoin.fr/'];
const ATTENTE_PAGE_S = 30;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const lireEntree = () => new Promise((ok) => { let s = ''; process.stdin.on('data', (d) => { s += d; }).on('end', () => ok(s.trim())); });

const proxyUrl = await lireEntree();
if (!/^https?:\/\/[^@\s]+@[^:\s]+:\d+$/.test(proxyUrl)) { console.error('URL du proxy attendue sur l’entrée standard'); process.exit(2); }
const config = lireConfig();
const docker = creerDocker({ socket: config.socketDocker });
const navigateurs = creerNavigateurs({ config, docker, journal });
const profilId = nouveauProfilId(MESURE);
const nom = nomConteneur(MESURE);

// Mémoire utilisée par le conteneur, cache de fichiers déduit (comme `docker stats`).
const memoire = async () => {
  const s = await docker.stats(nom);
  const m = s?.memory_stats;
  if (!m?.usage) return null;
  const cache = m.stats?.inactive_file ?? m.stats?.total_inactive_file ?? m.stats?.cache ?? 0;
  return Math.round((m.usage - cache) / 1048576);
};
const echantillons = [];
let resultat = null;
try {
  const h = await navigateurs.ouvrir(MESURE, { proxyUrl, profilId });
  echantillons.push({ quand: 'ouvert', mo: await memoire() });
  for (const url of PAGES) {
    await h.cdp.send('Target.createTarget', { url });          // un onglet de plus, comme l'extension en ouvre
    for (let i = 0; i < ATTENTE_PAGE_S / 5; i++) { await pause(5000); echantillons.push({ quand: new URL(url).hostname, mo: await memoire() }); }
  }
  const valeurs = echantillons.map((e) => e.mo).filter((v) => Number.isFinite(v));
  const pic = Math.max(...valeurs);
  const totalHoteMo = Math.round(Number(readFileSync('/proc/meminfo', 'utf8').match(/^MemTotal:\s+(\d+) kB/m)?.[1] ?? 0) / 1024);
  const reserveMo = 2048;                                      // système, orchestrateur, Caddy
  const marge = 1.3;                                           // une page lourde, deux onglets de plus
  resultat = {
    pic_mo: pic,
    moyenne_mo: Math.round(valeurs.reduce((a, b) => a + b, 0) / valeurs.length),
    limite_conteneur: config.memoireNavigateur,
    ram_hote_mo: totalHoteMo,
    navigateurs_max_propose: Math.max(1, Math.floor((totalHoteMo - reserveMo) / (pic * marge))),
    echantillons: echantillons.length,
  };
} finally {
  const r = await navigateurs.detruire(MESURE, profilId).catch((e) => ({ erreur: e.message }));
  if (resultat) resultat.profil_detruit = r?.profilsRestants === 0;
}
console.log(JSON.stringify(resultat));
process.exit(resultat ? 0 : 1);
