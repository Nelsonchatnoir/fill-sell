// (30/10, lot D) L'ESSAI D'UNE PAGE DE CONNEXION depuis le serveur, par une IP française du pool, en ACCÈS DIRECT —
// navigateur neuf (aucun profil, aucun compte, aucune extension), rien n'est saisi. Dans le conteneur orchestrateur :
//   docker compose exec -T orchestrateur node outils/essai-page-connexion.mjs <ip_id> <url> [attente_ms]
// Écrit la capture dans /srv/fillsell-cloud/essais/ (monté ou non : sinon /tmp) et imprime le verdict (aucun secret).
import { writeFileSync, mkdirSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { lireConfig } from '../src/config.js';
import * as journal from '../src/journal.js';
import { creerDocker } from '../src/docker.js';
import { creerControles } from '../src/controle.js';

const [ipId, url, attente] = process.argv.slice(2);
if (!ipId || !/^https:\/\//.test(url ?? '')) { console.error('usage : essai-page-connexion.mjs <ip_id> <url https> [attente_ms]'); process.exit(2); }
const config = lireConfig();
const base = createClient(config.supabaseUrl, config.cleService, { auth: { persistSession: false } });
const { data: proxyUrl, error } = await base.rpc('cloud_proxy_identifiants', { p_ip: Number(ipId) });
if (error || !proxyUrl) { console.error(`proxy de l'IP ${ipId} illisible`); process.exit(1); }
const controles = creerControles({ config, docker: creerDocker({ socket: config.socketDocker }), journal });
const r = await controles.essaiPageConnexion({ ipId: Number(ipId), proxyUrl, url, attenteMs: Number(attente) || 12_000 });
let dossier = '/srv/fillsell-cloud/essais';
try { mkdirSync(dossier, { recursive: true }); } catch { dossier = '/tmp'; }
const fichier = `${dossier}/essai-${new URL(url).hostname}-${r.fait_le.replace(/[:.]/g, '-')}.png`;
writeFileSync(fichier, Buffer.from(r.capture, 'base64'));
console.log(JSON.stringify({ ...r, capture: fichier }, null, 2));
