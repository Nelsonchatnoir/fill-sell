// (20/11/2026 18:09, DÉCISIONS DE NICO) LE STOCK D'IP DU CLOUD — selftest ciblé :
//   1. la commande IPRoyal STANDARD (ISP Dedicated, France, 30 jours), sans « extra requirements » ;
//   2. le stock d'avance = max(6, 2 × le pic d'attributions par jour sur 7 jours) IP libres et attribuables, en plus des places
//      gardées et des IP attribuées ; rachat de ce qui manque ; seules les IP réellement attribuables comptent ;
//   3. le refus d'une plateforme ne juge pas l'IP (règle du 03/11) : attribuable, d'abord aux comptes qui n'utilisent pas
//      cette plateforme ; sinon quand même ;
//   4. le garde-fou : plus de 10 IP achetées en 24 h = une alerte dans l'ops-digest.
import fs from 'node:fs';
import * as R from '../supabase/functions/_shared/cloud-pool.js';
import * as IPR from '../serveur-cloud/src/iproyal.js';

let ko = 0, n = 0;
const ok = (c, m, d) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d ? ` — ${d}` : ''}`); } };
const T = Date.parse('2026-11-20T18:30:00Z'), H = 3_600_000, J = 86_400_000;
const iso = (t) => new Date(t).toISOString();
const SAINE = { verdict: 'saine', le: iso(T - H), saine_le: iso(T - H) };
const ip = (id, x = {}) => ({ id, etat: 'disponible', user_id: null, attributions: 0, refus: {}, expire_le: iso(T + 25 * J), sante: SAINE, ...x });

console.log('1. La commande standard');
const corps = IPR.corpsCommande({ produitId: 9, planId: 22, lieuId: 25, questionExigencesId: 7 }, 2);
ok(!('product_question_answers' in corps) && corps.product_location_id === 25 && corps.product_plan_id === 22 && corps.auto_extend === false,
  'ISP Dedicated, France, 30 jours, aucune « extra requirement »', JSON.stringify(corps));
const src = fs.readFileSync('serveur-cloud/src/iproyal.js', 'utf8');
ok(!/French residential ISP only|Orange AS3215|no hosting\/datacenter/i.test(src.replace(/^\s*(\/\/|\*).*$/gm, '')), 'la consigne « box française » n’existe plus dans le code (hors commentaires)');

console.log('2. Le stock d’avance');
const jour = (j, h) => iso(Date.parse(`2026-11-${j}T${String(h).padStart(2, "0")}:00:00Z`));
const attrib = [jour(14, 10), jour(14, 12), jour(19, 8), jour(19, 9), jour(19, 15), jour(19, 20), jour(20, 9)];
const s = R.seuilStock(attrib, { maintenant: T });
ok(s.pic === 4 && s.seuil === 8, `pic 4 (19/11) → seuil 8 (= 2 × 4 > 6)`, JSON.stringify(s));
ok(R.seuilStock([jour(19, 8)], { maintenant: T }).seuil === 6 && R.seuilStock([], { maintenant: T }).seuil === 6, 'pic faible ou nul : 6 au moins');
ok(R.seuilStock([iso(T - 8 * J), iso(T - 8 * J), iso(T - 8 * J), iso(T - 8 * J)], { maintenant: T }).seuil === 6, 'seuls les 7 derniers jours comptent');
const pool = [ip(80), ip(81), { ...ip(89), sante: { verdict: 'inconnue', le: iso(T - H), dernier: { inconnus: ['sortie'] } } },
  { ...ip(82), sante: { verdict: 'grillee', le: iso(T - H), echecs: ['sortie:pays'] } }, { ...ip(77), etat: 'rebut' }, { ...ip(78), etat: 'quarantaine' },
  { ...ip(42), etat: 'attribuee_client', user_id: 'nico' }];
const a = R.achatSurDemande({ ips: pool, attente: 2, marge: 8, maintenant: T });
ok(a.offre === 2 && a.vise === 10 && a.aCommander === 8, `2 saines libres (80, 81), jamais 89/82/rebut/quarantaine ni l’attribuée ; 2 en attente + 8 → 8 à acheter`, JSON.stringify(a));
const neuve = { ...ip(100), sante: null };
ok(R.achatSurDemande({ ips: [...pool, neuve], attente: 2, marge: 8, maintenant: T }).aCommander === 7, 'une IP livrée pas encore contrôlée compte (jamais un 2e achat avant son verdict)');
const g = R.gardeNombre({ ips: [...pool, neuve], comptesSansPlace: 0, enAttente: 2, enCommande: 0, quantite: 7, marge: 8, maintenant: T });
ok(g.vivantes === 4 && g.ok === true, `garde : vivantes = 42 (attribuée) + 80 + 81 + la neuve (pas 89, 82, rebut, quarantaine) ; 7 de plus passent (borne 1 + 8 + 2)`, JSON.stringify(g));
const ent = fs.readFileSync('serveur-cloud/src/entretien.js', 'utf8');
ok(/async function avecSeuilStock\(g\)/.test(ent) && /\.eq\('nature', 'attribution'\)/.test(ent) && /update\(\{ value: seuilLu\.seuil/.test(ent),
  'l’entretien lit les attributions de 7 jours, en fait la marge, et aligne cloud_ip_marge (la garde de la base)');

console.log('3. Le refus d’une plateforme');
const b = R.santeSuivante(null, { fait_le: iso(T), echecs: [], inconnus: ['beebs'] });
ok(b.verdict === 'saine' && b.plateformes_fermees.join() === 'beebs' && R.ipAttribuable({ ...ip(88), sante: b }, { maintenant: T }),
  'la 88 (Beebs : DataDome 406) : saine, attribuable, Beebs noté fermé');
const ferme = { ...ip(88, { expire_le: iso(T + 10 * J) }), sante: { ...SAINE, plateformes_fermees: ['beebs'] } };
const ouvert = { ...ip(90, { expire_le: iso(T + 25 * J) }), sante: { ...SAINE, plateformes_fermees: [] } };
ok(R.choisirIp([ferme, ouvert], { userId: 'b', plateformesCompte: ['beebs', 'vinted'], maintenant: T })?.id === 90, 'un compte Beebs : d’abord l’IP où Beebs est ouvert');
ok(R.choisirIp([ferme, ouvert], { userId: 'v', plateformesCompte: ['vinted'], maintenant: T })?.id === 88, 'un compte sans Beebs : l’ordre habituel (la plus proche de l’échéance)');
ok(R.choisirIp([ferme], { userId: 'b', plateformesCompte: ['beebs'], maintenant: T })?.id === 88, 'plus d’IP où Beebs est ouvert : la suivante quand même');
const mig = fs.readFileSync('supabase/migrations/20261120200000_cloud_ip_plateformes_fermees_priorite.sql', 'utf8');
ok((mig.match(/\(COALESCE\(i\.sante -> 'plateformes_fermees', '\[\]'::jsonb\) \?\| COALESCE\(v_pf, '\{\}'::text\[\]\)\)/g) ?? []).length === 2,
  'la base : la même priorité dans cloud_ip_attribuer et cloud_ip_reserver (banc : scripts/bancs/plateformes-fermees-2011)');

console.log('4. Le garde-fou');
const od = fs.readFileSync('supabase/functions/ops-digest/index.ts', 'utf8');
ok(/const ACHATS_IP_ALERTE = 10;/.test(od) && /achatsIpTrop \? `🔴 Rachat d'IP : \$\{achatsIp24h\} en 24 h — `/.test(od) && /\.neq\("statut", "echec"\)/.test(od),
  'plus de 10 IP achetées en 24 h (hors commandes remboursées) : la ligne rouge et l’objet de l’ops-digest');

console.log(ko ? `✗ ${ko} échec(s) sur ${n}` : `✓ stock-ip : ${n}/${n}`);
process.exit(ko ? 1 : 0);
