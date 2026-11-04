// (04/11) LE CONTRÔLE D'ENTRÉE D'UNE IP NEUVE, tout de suite — le même chemin que l'entretien horaire (entretien.js,
// étapes 0 et 3) : le pare-feu des navigateurs suit le pool (la sortie neuve ouverte, celles en usage gardées), puis UN
// navigateur neuf par la sortie lit l'adresse vue et les listes noires (aucune plateforme visitée,
// controle.js/releverControle), et cloud_ip_controle_entree la rend « disponible » si tout est conforme.
//   docker compose exec -T orchestrateur node outils/controle-entree.mjs <ip_id>
import { createClient } from '@supabase/supabase-js';
import { lireConfig } from '../src/config.js';
import { creerDocker } from '../src/docker.js';
import { creerPareFeu, sortieOuverte } from '../src/pareFeu.js';
import { creerControles } from '../src/controle.js';
import * as journal from '../src/journal.js';

const id = Number(process.argv[2]);
if (!Number.isInteger(id)) { console.error('usage : controle-entree.mjs <ip_id>'); process.exit(2); }
const config = lireConfig();
const base = createClient(config.supabaseUrl, config.cleService, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: ips, error } = await base.from('cloud_ips').select('id, ip, port, etat, user_id, expire_le');
if (error) throw new Error(error.message);
const toutes = (ips ?? []).map((i) => ({ ...i, ip: String(i.ip).replace(/\/32$/, '') }));
const i = toutes.find((x) => x.id === id);
if (!i || i.etat !== 'achetee') { console.log(JSON.stringify({ ip_id: id, etat: i?.etat ?? null, fait: false, raison: 'pas_achetee' })); process.exit(1); }
// Les sorties en usage (les IP attribuées) restent permises quoi qu'il arrive, comme dans l'entretien.
const enUsage = toutes.filter((x) => x.user_id).map((x) => x.id);
const pf = await creerPareFeu({ config, journal }).synchroniser(toutes, { enUsage });
if (!sortieOuverte(pf.appliquees, i.ip, i.port ?? 12323)) { console.log(JSON.stringify({ ip_id: id, fait: false, raison: 'pare_feu_non_applique', manquantes: pf.manquantes?.length ?? null })); process.exit(1); }
const { data: proxyUrl } = await base.rpc('cloud_proxy_identifiants', { p_ip: id });
if (!proxyUrl) throw new Error('proxy illisible');
const c = await creerControles({ config, docker: creerDocker({ socket: config.socketDocker }), journal }).controler({ ipId: id, ip: i.ip, proxyUrl });
const { data } = await base.rpc('cloud_ip_controle_entree', { p_ip: id, p_controle: c });
console.log(JSON.stringify({ ip_id: id, pare_feu: { ecrit: pf.ecrit }, controle: { ip_sortie: c?.ip_sortie, pays: c?.pays, listes_noires: c?.listes_noires?.length ?? null, plateformes: c?.plateformes }, resultat: data }));
process.exit(data?.ok === true ? 0 : 1);
