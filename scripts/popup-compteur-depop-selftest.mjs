// ═══════════════════════════════════════════════════════════════════════════
// LE COMPTEUR DEPOP DU POPUP N'EST PLUS VIDE — `npm run selftest:popup-compteur-depop`
// ═══════════════════════════════════════════════════════════════════════════
// 12/10 (A9). Le popup de l'extension lit la file pour l'AFFICHER
// (get-pending-jobs avec include_needs_user : aucune réservation, aucune
// exécution) sans déclarer les capacités du poste. Le filtre « aucun job
// Depop à un poste sans l'accès » s'appliquait aussi à lui : « Autoriser
// Depop » sans le nombre en attente, précisément chez le poste qui n'a pas
// l'accès. Corrigé côté SERVEUR : toutes les versions d'extension (≥ 0.6.105)
// voient leur compteur, sans nouvelle extension. Le poll d'exécution, lui,
// reste filtré (jamais un job Depop servi à un poste sans l'accès).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
let ko = 0, ok = 0;
const verifier = (c, quoi) => { if (c) { ok++; console.log(`  ✓ ${quoi}`); } else { ko++; console.log(`  ✗ ${quoi}`); } };

const gpj = lire('supabase/functions/get-pending-jobs/index.ts');
verifier(/if \(!posteAvecDepop && !includeNeedsUser\) \{\s*\n\s*const avantD = out\.length;\s*\n\s*out = out\.filter\(\(j\) => j\.platform !== "depop"\);/.test(gpj), 'get-pending-jobs : le filtre Depop ne vaut que pour la file d’exécution');
verifier(/if \(!includeProcessing && !includeNeedsUser && out\.length\) \{\s*\n\s*const admin = createClient[\s\S]{0,700}reserver_jobs_extension/.test(gpj), 'le popup (include_needs_user) ne réserve rien : afficher ses jobs Depop n’en sert aucun');
const popup = lire('chrome-extension/popup.js');
verifier(/include_needs_user: true/.test(popup) && /state\.depopEnAttente = jobs\.filter\(\(j\) => j\.platform === "depop"\);/.test(popup), 'le popup compte les jobs Depop de la réponse (inchangé, toutes versions)');
verifier(/\(\$\{n\} en attente\)/.test(popup), 'la phrase « Autoriser Depop » porte le nombre en attente');
verifier(!/capacites/.test(popup.slice(popup.indexOf('async function fetchPendingJobs'), popup.indexOf('async function fetchPendingJobs') + 1500)), 'le popup ne se fait pas passer pour un poste (aucune capacité déclarée, aucune trace de poste écrite)');

console.log(`\n${ko ? `✗ ${ko} échec(s)` : '✓ tout est vert'} — ${ok} contrôles`);
process.exit(ko ? 1 : 0);
