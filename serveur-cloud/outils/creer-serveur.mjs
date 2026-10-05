// Crée le serveur Hetzner de FillSell Cloud — depuis le PC, avec le jeton
// HCLOUD_TOKEN rangé dans C:\Users\nicol\fillsell-cloud-proto\secrets.env
// (jamais affiché, jamais copié ailleurs).
//
//   node serveur-cloud/outils/creer-serveur.mjs --infos            prix et capacités lus dans l'API (rien n'est créé)
//   node serveur-cloud/outils/creer-serveur.mjs --go [--type=cx43] [--lieu=fsn1]
//
// Crée (une fois) : la clé SSH (C:\Users\nicol\.ssh\fillsell_cloud_ed25519, générée
// si absente), le pare-feu Hetzner (22, 80, 443), le serveur Ubuntu 24.04 avec
// deploiement/cloud-init.yaml. N'achète rien d'autre.
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const SECRETS = 'C:\\Users\\nicol\\fillsell-cloud-proto\\secrets.env';
const jeton = readFileSync(SECRETS, 'utf8').match(/^HCLOUD_TOKEN=(.+)$/m)?.[1]?.trim();
if (!jeton) { console.error('HCLOUD_TOKEN absent de secrets.env : rien à faire.'); process.exit(1); }
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const TYPE = args.type || 'cx43';
const LIEU = args.lieu || 'fsn1';
const NOM = args.nom || 'fillsell-cloud-1';

async function api(methode, chemin, corps) {
  const r = await fetch(`https://api.hetzner.cloud/v1${chemin}`, {
    method: methode, headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
    body: corps ? JSON.stringify(corps) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Hetzner ${methode} ${chemin} → HTTP ${r.status} ${d?.error?.message ?? ''}`);
  return d;
}

const { server_types: types } = await api('GET', '/server_types?per_page=50');
const choix = ['cx33', 'cx43', 'cx53', 'cpx41', 'ccx23', 'ccx33'].map((n) => types.find((t) => t.name === n)).filter(Boolean);
console.log('Types (prix mensuels lus dans l\'API, HT) :');
for (const t of choix) {
  const p = t.prices.find((x) => x.location === LIEU) ?? t.prices[0];
  console.log(`  ${t.name.padEnd(6)} ${String(t.cores).padStart(2)} vCPU ${String(t.memory).padStart(3)} Go  ${String(t.disk).padStart(4)} Go  ${Number(p?.price_monthly?.net ?? 0).toFixed(2)} € HT/mois (${p?.location})${t.deprecated ? '  [retiré]' : ''}`);
}
if (!args.go) { console.log('\n(--infos) Rien n\'est créé. Pour créer : --go'); process.exit(0); }

const { servers } = await api('GET', `/servers?name=${encodeURIComponent(NOM)}`);
if (servers.length) { console.log(`Le serveur ${NOM} existe déjà : ${servers[0].public_net.ipv4.ip}`); process.exit(0); }

const cle = path.join(homedir(), '.ssh', 'fillsell_cloud_ed25519');
if (!existsSync(cle)) execFileSync('ssh-keygen', ['-t', 'ed25519', '-N', '', '-C', 'fillsell-cloud', '-f', cle], { stdio: 'ignore' });
const publique = readFileSync(`${cle}.pub`, 'utf8').trim();
let { ssh_keys: cles } = await api('GET', '/ssh_keys?name=fillsell-cloud');
const cleId = cles[0]?.id ?? (await api('POST', '/ssh_keys', { name: 'fillsell-cloud', public_key: publique })).ssh_key.id;

let { firewalls } = await api('GET', '/firewalls?name=fillsell-cloud');
const pareFeuId = firewalls[0]?.id ?? (await api('POST', '/firewalls', {
  name: 'fillsell-cloud',
  rules: [22, 80, 443].map((port) => ({ direction: 'in', protocol: 'tcp', port: String(port), source_ips: ['0.0.0.0/0', '::/0'] })),
})).firewall.id;

const t = types.find((x) => x.name === TYPE);
if (!t) throw new Error(`type ${TYPE} inconnu`);
const prix = t.prices.find((x) => x.location === LIEU);
console.log(`\nCréation : ${NOM}, ${TYPE} à ${LIEU}, ${Number(prix?.price_monthly?.net ?? 0).toFixed(2)} € HT/mois.`);
const d = await api('POST', '/servers', {
  name: NOM, server_type: TYPE, location: LIEU, image: 'ubuntu-24.04',
  ssh_keys: [cleId], firewalls: [{ firewall: pareFeuId }],
  user_data: readFileSync(path.join(ICI, '..', 'deploiement', 'cloud-init.yaml'), 'utf8'),
  labels: { app: 'fillsell-cloud' }, public_net: { enable_ipv4: true, enable_ipv6: true },
});
console.log(`Serveur créé : ${d.server.name} — IPv4 ${d.server.public_net.ipv4.ip} (cloud-init : ~3 min).`);
console.log(`DNS : enregistrement A « cloud » → ${d.server.public_net.ipv4.ip} (nuage gris), ou ${d.server.public_net.ipv4.ip.replace(/\./g, '-')}.sslip.io`);
