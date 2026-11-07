// (07/11 soir, ordre 3 de Nico : « montre-moi la liste des IP qui vont expirer avant d'activer la règle ») LE
// RENOUVELLEMENT PRÉVU, IP PAR IP — LECTURE SEULE (aucune écriture, aucun achat, aucune prolongation, aucun navigateur).
// Pour chaque IP : id, ip, état, échéance (heure de Paris), titulaire (client, essai, réservée), santé connue, et la
// décision — « renouvelée le … » ou « expire à son terme le … » — selon la règle d'AUJOURD'HUI et selon la règle « SAINES
// D'ABORD » (coin_config cloud_ip_renouveler_saines_seulement = 1). Projection (cloud-pool.projeterEcheances) : le plan de
// l'entretien rejoué heure par heure sur 45 jours, santé figée, sans nouveau compte, sans achat.
//
// Deux façons de le lancer :
//   1. Depuis le PC (dépôt à jour, CLI Supabase liée, LECTURE SEULE, aucune clé de service) :
//        npx supabase db query --linked --read-only -f serveur-cloud/outils/ip-renouvellement-prevu.sql > %TEMP%\pool-ip.json
//        node serveur-cloud/outils/ip-renouvellement-prevu.mjs --fichier %TEMP%\pool-ip.json
//   2. Sur le serveur, une fois l'orchestrateur déployé avec ce code (clé de service de son environnement, lectures seules) :
//        cd /srv/fillsell-cloud && docker compose exec -T orchestrateur node outils/ip-renouvellement-prevu.mjs
// Options : --sante 1=saine,40=grillee (verdicts relevés à la main, « saine » datée de maintenant — avant que le contrôle
// périodique n'ait écrit en base) ; --marge N ; --jours N ; --json (sortie machine).
import { readFileSync } from 'node:fs';
import { chargerRegles } from '../src/regles.js';

const args = process.argv.slice(2);
const opt = (nom) => { const i = args.indexOf(`--${nom}`); return i >= 0 ? args[i + 1] : null; };
const regles = await chargerRegles();
if (typeof regles.projeterEcheances !== 'function') {
  console.error('Les règles chargées n\'ont pas projeterEcheances : lancer depuis le dépôt à jour, ou déployer l\'orchestrateur d\'abord.');
  process.exit(2);
}

async function lireDepuisBase() {
  const { createClient } = await import('@supabase/supabase-js');
  const url = process.env.SUPABASE_URL; const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !cle) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY absents : lancer dans l\'orchestrateur, ou --fichier');
  const base = createClient(url, cle, { auth: { persistSession: false } });
  const { data: ips, error } = await base.from('cloud_ips').select('*').order('id');
  if (error) throw new Error(`cloud_ips : ${error.message}`);
  const { data: coin } = await base.from('coin_config').select('key, value').like('key', 'cloud_ip_%');
  const { count } = await base.from('cloud_attente').select('user_id', { count: 'exact', head: true });
  const { data: cmd } = await base.from('cloud_ip_commandes').select('quantite').eq('nature', 'achat').in('statut', ['demandee', 'en_cours']);
  return { lu_le: new Date().toISOString(), ips: (ips ?? []).map(({ secret_nom, purge_preuve, ...i }) => i),
    coin: Object.fromEntries((coin ?? []).map((l) => [l.key, l.value])), en_attente: Number(count) || 0,
    commandes_en_cours: (cmd ?? []).reduce((n, c) => n + (Number(c.quantite) || 0), 0) };
}
function lireFichier(chemin) {
  const s = readFileSync(chemin, 'utf8');
  const j = JSON.parse(s.slice(s.indexOf('{')));
  const r = j.rows?.[0]?.r ?? j.r ?? j;
  if (!Array.isArray(r?.ips)) throw new Error('fichier illisible : la sortie de ip-renouvellement-prevu.sql est attendue');
  return r;
}

const donnees = opt('fichier') ? lireFichier(opt('fichier')) : await lireDepuisBase();
const maintenant = Date.parse(donnees.lu_le) || Date.now();
const marge = opt('marge') != null ? Number(opt('marge')) : Number(donnees.coin?.cloud_ip_marge ?? regles.PARAMETRES.ipMarge);
const jours = Number(opt('jours') ?? 45);
const manuel = new Map(String(opt('sante') ?? '').split(',').filter(Boolean).map((x) => x.split('=')).map(([id, v]) => [Number(id), v]));
for (const [id, v] of manuel) if (!['saine', 'suspecte', 'grillee', 'inconnue'].includes(v)) throw new Error(`--sante ${id}=${v} : saine, suspecte, grillee ou inconnue`);
const ips = donnees.ips.map((i) => {
  const ip = { ...i, ip: String(i.ip).replace(/\/32$/, '') };
  if (manuel.has(Number(i.id))) {
    const v = manuel.get(Number(i.id));
    ip.sante = { ...(i.sante ?? {}), verdict: v, saine_le: v === 'saine' ? new Date(maintenant).toISOString() : (i.sante?.saine_le ?? null), manuel: true };
  }
  return ip;
});
const commun = { ips, marge, enAttente: Number(donnees.en_attente) || 0, commandesEnCours: Number(donnees.commandes_en_cours) || 0, maintenant, jours };
const aujourdhui = new Map(regles.projeterEcheances({ ...commun, sainesSeulement: false }).map((e) => [e.id, e]));
const saines = new Map(regles.projeterEcheances({ ...commun, sainesSeulement: true }).map((e) => [e.id, e]));
const inconnues = ips.filter((i) => regles.ipLibre(i, maintenant) && !regles.reservee(i, maintenant)
  && ['inconnue', 'suspecte'].includes(regles.santeConnue(i, maintenant)));
// L'hypothèse « les inconnues sont saines » : un contrôle sain daté de maintenant (il contredit aussi les refus plus anciens).
const siSaines = inconnues.length
  ? new Map(regles.projeterEcheances({ ...commun, sainesSeulement: true,
    ips: ips.map((i) => (inconnues.includes(i) ? { ...i, sante: { verdict: 'saine', saine_le: new Date(maintenant).toISOString() } } : i)) })
    .map((e) => [e.id, e]))
  : null;

const paris = (v) => (v ? new Date(v).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' }) : '—');
const decision = (e) => (!e ? '?' : e.evenement === 'renouvelee' ? `renouvelée le ${paris(e.le)} → ${paris(e.nouvelle_echeance)}${e.avec_sa_commande ? ' (avec sa commande)' : ''}`
  : e.evenement === 'expire' ? `EXPIRE à son terme (${paris(e.le)})` : e.evenement === 'deja_expiree' ? 'déjà expirée' : `rien d'ici ${jours} j`);
const titulaire = (i) => (i.etat === 'attribuee_client' ? 'client' : i.etat === 'attribuee_essai' ? 'essai'
  : regles.reservee(i, maintenant) ? `réservée jusqu'au ${paris(i.reserve_jusqu_au)}` : '');
const lignes = ips.filter((i) => i.etat !== 'expiree').map((i) => ({
  id: i.id, ip: i.ip, etat: i.etat, expire_le: i.expire_le, echeance: paris(i.expire_le), titulaire: titulaire(i),
  sante: `${['attribuee_essai', 'attribuee_client'].includes(i.etat) ? 'non contrôlée (tenue par un compte)'
    : `${regles.santeConnue(i, maintenant)}${i.sante?.manuel ? ' (relevé à la main)' : ''}${regles.reservee(i, maintenant) ? ' (réservée : jamais contrôlée seule)' : ''}`}${regles.refusee(i.refus) ? ` · refus ${Object.keys(i.refus).join('/')}${regles.refusProuve(i.refus) ? ' prouvé' : ' non prouvé'}` : ''}`,
  aujourdhui: aujourdhui.get(i.id), saines: saines.get(i.id), si_saines: siSaines?.get(i.id) ?? null,
}));

if (args.includes('--json')) {
  console.log(JSON.stringify({ lu_le: donnees.lu_le, marge, en_attente: commun.enAttente, commandes_en_cours: commun.commandesEnCours, jours, lignes }, null, 2));
} else {
  console.log(`Pool lu le ${paris(donnees.lu_le)} (heure de Paris) — marge ${marge}, ${commun.enAttente} en attente, ${commun.commandesEnCours} IP en commande ; `
    + `réglages : renouvellement auto ${donnees.coin?.cloud_ip_renouvellement_auto ?? '?'}, saines d'abord ${donnees.coin?.cloud_ip_renouveler_saines_seulement ?? 'absent (0)'}, `
    + `contrôle de santé ${donnees.coin?.cloud_ip_sante_controle ?? 'absent (0)'}. Projection sur ${jours} jours, santé figée, sans nouveau compte ni achat.\n`);
  for (const l of lignes) {
    console.log(`IP ${l.id} · ${l.ip} · ${l.etat}${l.titulaire ? ` (${l.titulaire})` : ''} · échéance ${l.echeance} · santé ${l.sante}`);
    console.log(`    règle d'aujourd'hui : ${decision(l.aujourdhui)}${l.aujourdhui?.raison ? ` [${l.aujourdhui.raison}]` : ''}`);
    console.log(`    règle « saines »    : ${decision(l.saines)}${l.saines?.raison ? ` [${l.saines.raison}]` : ''}`);
    if (l.si_saines && JSON.stringify(l.si_saines) !== JSON.stringify(l.saines)) console.log(`    … si les IP de santé inconnue se révèlent saines : ${decision(l.si_saines)}`);
  }
  const expirent = lignes.filter((l) => l.saines?.evenement === 'expire');
  console.log(`\nRègle « saines » : ${lignes.filter((l) => l.saines?.evenement === 'renouvelee').length} IP renouvelée(s), ${expirent.length} expire(nt) à leur terme`
    + `${expirent.length ? ` : ${expirent.map((l) => `${l.id} (${l.ip}, ${l.echeance})`).join(' ; ')}` : ''}.`);
  if (inconnues.length) console.log(`⚠ ${inconnues.length} IP libre(s) de santé non prouvée (${inconnues.map((i) => i.id).join(', ')}) : le contrôle périodique les jugera ; sans preuve à J-2, elles ne seront pas renouvelées.`);
}
