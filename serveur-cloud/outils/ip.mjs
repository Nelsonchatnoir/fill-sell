// Le pool d'IP, à la main — SUR le serveur (clé de service et jeton IPRoyal dans
// l'environnement de l'orchestrateur) :
//   node outils/ip.mjs pool                               l'état du pool (aucun secret)
//   node outils/ip.mjs ajouter <commande_iproyal>         une IP DÉJÀ ACHETÉE par Nico entre dans le pool
//                                                         (échéance et identifiants lus chez IPRoyal ;
//                                                          l'URL du proxy va au vault, jamais affichée)
//   node outils/ip.mjs ajouter-manuel <commande> <ip> <port> <expire_iso>   (URL du proxy lue sur l'entrée standard)
//   node outils/ip.mjs identifiants <ip_id>               identifiants changés chez IPRoyal → vault
// ⛔ Aucune commande d'achat ici : une IP neuve s'achète sur le GO de Nico, dans
//    son tableau de bord IPRoyal (ou par l'API, avec IPROYAL_ACHATS_AUTORISES=1).
import { createClient } from '@supabase/supabase-js';
import { creerIproyal } from '../src/iproyal.js';

const base = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const iproyal = creerIproyal({ jeton: process.env.IPROYAL_API_TOKEN });
const [cmd, ...a] = process.argv.slice(2);

const lireEntree = () => new Promise((ok) => { let s = ''; process.stdin.on('data', (d) => { s += d; }).on('end', () => ok(s.trim())); });

if (cmd === 'pool') {
  const { data } = await base.rpc('cloud_pool_etat');
  console.log(JSON.stringify(data, null, 2));
  const { data: ips } = await base.from('cloud_ips').select('id, commande, ip, etat, user_id, repos_fin, expire_le, attributions').order('id');
  for (const i of ips ?? []) console.log(`${String(i.id).padStart(4)}  ${String(i.ip).padEnd(16)} ${i.etat.padEnd(17)} ${i.user_id ? i.user_id.slice(0, 8) : '        '}  expire ${i.expire_le?.slice(0, 10)}  usure ${i.attributions}`);
} else if (cmd === 'ajouter') {
  const [commande] = a;
  if (!commande) throw new Error('commande IPRoyal attendue');
  const c = await iproyal.lireCommande(commande);
  const proxies = c?.proxy_data?.proxies ?? [];
  if (proxies.length !== 1) throw new Error(`une commande = une IP (règle du pool) : ${proxies.length} proxy(s) dans ${commande}`);
  const p = proxies[0];
  const url = iproyal.urlProxy(c, p.ip);
  const { data, error } = await base.rpc('cloud_ip_ajouter', { p_commande: String(commande), p_ip: p.ip, p_port: Number(p.port ?? 12323),
    p_ville: c?.location ?? null, p_asn: null, p_proxy_url: url, p_expire_le: new Date(c.expire_date).toISOString() });
  if (error) throw new Error(error.message);
  console.log(`IP ${p.ip} ajoutée (id ${data}, échéance ${c.expire_date}) : état « achetee », le contrôle d'entrée la rendra disponible.`);
} else if (cmd === 'ajouter-manuel') {
  const [commande, ip, port, expire] = a;
  const url = await lireEntree();
  const { data, error } = await base.rpc('cloud_ip_ajouter', { p_commande: commande, p_ip: ip, p_port: Number(port), p_ville: null, p_asn: null, p_proxy_url: url, p_expire_le: expire });
  if (error) throw new Error(error.message);
  console.log(`IP ${ip} ajoutée (id ${data}).`);
} else if (cmd === 'identifiants') {
  const [ipId] = a;
  const { data: i } = await base.from('cloud_ips').select('id, commande, ip').eq('id', ipId).single();
  const url = await iproyal.changerIdentifiants(i.commande, String(i.ip).replace(/\/32$/, ''));
  const { data } = await base.rpc('cloud_ip_identifiants_changes', { p_ip: i.id, p_proxy_url: url });
  console.log(`Identifiants changés : ${data === true ? 'oui' : 'NON'}`);
} else {
  console.error('commandes : pool | ajouter <commande> | ajouter-manuel <commande> <ip> <port> <expire> | identifiants <ip_id>');
  process.exit(1);
}
