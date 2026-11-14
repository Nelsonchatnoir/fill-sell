// (14/11/2026, complément 3 de Nico) LE CONTRÔLE DE SANTÉ D'IP NOMMÉES, tout de suite — le même chemin que l'entretien
// (entretien.controlerSante) : le pare-feu des navigateurs suit le pool (la sortie de chaque IP ouverte, celles en usage
// gardées), puis UN Chrome jetable par IP (sante.js : la sortie lue par le relais, une visite de la page d'accueil de
// Vinted, Leboncoin, Beebs, Depop — eBay n'y est plus), la santé suivante (cloud-pool.js santeSuivante : une grillée qui
// passe redevient SAINE, retour au pool) écrite par cloud_ip_sante_noter. Une IP à la fois, jamais une IP tenue par un compte.
//   docker compose exec -T orchestrateur node outils/controle-sante.mjs <ip_id> [<ip_id> …] [--sans-ecrire]
import { createClient } from '@supabase/supabase-js';
import { lireConfig } from '../src/config.js';
import { creerDocker } from '../src/docker.js';
import { creerPareFeu, sortieOuverte } from '../src/pareFeu.js';
import { creerSante } from '../src/sante.js';
import * as journal from '../src/journal.js';
import * as regles from '../lib/cloud-pool.js';

const args = process.argv.slice(2);
const ecrire = !args.includes('--sans-ecrire');
const ids = args.filter((a) => /^\d+$/.test(a)).map(Number);
if (!ids.length) { console.error('usage : controle-sante.mjs <ip_id> [<ip_id> …] [--sans-ecrire]'); process.exit(2); }
const config = lireConfig();
const base = createClient(config.supabaseUrl, config.cleService, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: ips, error } = await base.from('cloud_ips').select('id, ip, port, etat, user_id, commande, expire_le, sante');
if (error) throw new Error(error.message);
const toutes = (ips ?? []).map((i) => ({ ...i, ip: String(i.ip).replace(/\/32$/, '') }));
const enUsage = toutes.filter((x) => x.user_id).map((x) => x.id);
const pf = await creerPareFeu({ config, journal }).synchroniser(toutes, { enUsage });
const sante = creerSante({ config, docker: creerDocker({ socket: config.socketDocker }), journal });
let ko = 0;
for (const id of ids) {
  const i = toutes.find((x) => x.id === id);
  if (!i) { console.log(JSON.stringify({ ip_id: id, fait: false, raison: 'ip_inconnue' })); ko++; continue; }
  if (i.user_id) { console.log(JSON.stringify({ ip_id: id, commande: i.commande, fait: false, raison: 'ip_tenue_par_un_compte' })); ko++; continue; }
  if (!sortieOuverte(pf.appliquees, i.ip, i.port ?? 12323)) { console.log(JSON.stringify({ ip_id: id, commande: i.commande, fait: false, raison: 'pare_feu_non_applique' })); ko++; continue; }
  const { data: proxyUrl } = await base.rpc('cloud_proxy_identifiants', { p_ip: id });
  if (!proxyUrl) { console.log(JSON.stringify({ ip_id: id, commande: i.commande, fait: false, raison: 'proxy_illisible' })); ko++; continue; }
  const controle = await sante.verifier({ ipId: id, ip: i.ip, proxyUrl });
  const nouvelle = regles.santeSuivante(i.sante ?? null, controle);
  let ecrit = null;
  if (ecrire) {
    const { data: r, error: e } = await base.rpc('cloud_ip_sante_noter', { p_ip: id, p_sante: nouvelle });
    ecrit = r?.ok === true ? { ok: true, avant: r.avant, apres: r.apres } : { ok: false, raison: r?.raison ?? e?.message ?? null };
  }
  console.log(JSON.stringify({ ip_id: id, commande: i.commande, avant: i.sante?.verdict ?? null, apres: nouvelle.verdict,
    echecs: controle.echecs, inconnus: controle.inconnus, sortie: controle.resume?.sortie ?? null,
    plateformes: controle.resume?.plateformes ?? null, ecrit }));
}
process.exit(ko ? 1 : 0);
