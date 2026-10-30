// (30/10, lot D — diagnostic Beebs) Ce que voit un site du navigateur Cloud, par une IP du pool : en-têtes (écho
// httpbin) et empreinte JavaScript. Navigateur neuf, aucun compte, rien n'est saisi.
//   docker compose exec -T orchestrateur node outils/diagnostic-navigateur.mjs <ip_id>
import { createClient } from '@supabase/supabase-js';
import { lireConfig } from '../src/config.js';
import * as journal from '../src/journal.js';
import { creerDocker } from '../src/docker.js';
import { creerControles } from '../src/controle.js';

const [ipId] = process.argv.slice(2);
const config = lireConfig();
const base = createClient(config.supabaseUrl, config.cleService, { auth: { persistSession: false } });
const { data: proxyUrl } = await base.rpc('cloud_proxy_identifiants', { p_ip: Number(ipId) });
if (!proxyUrl) { console.error('proxy illisible'); process.exit(1); }
const controles = creerControles({ config, docker: creerDocker({ socket: config.socketDocker }), journal });
console.log(JSON.stringify(await controles.empreinte({ ipId: Number(ipId), proxyUrl }), null, 2));
