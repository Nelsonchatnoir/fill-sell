// (07/11 soir) L'ÉTANCHÉITÉ ENTRE CLIENTS — le réseau des navigateurs CLOISONNÉ (docs/cloud/ETANCHEITE-CLOUD2.md).
//
// La faille (relevé de cloud-2, 07/11 17:16) : le pont br-fillsell était créé SANS enable_icc=false et br_netfilter n'était
// pas chargé — deux conteneurs du pont se parlaient sans passer par iptables (ni DOCKER-USER ni FORWARD : la chaîne
// FILLSELL-NAV ne voyait que la sortie vers l'extérieur). Or chaque Chrome expose son pilotage DevTools sur 9223 (socat,
// SANS authentification) : un code exécuté dans le conteneur du client A pouvait piloter le Chrome du client B (cookies des
// plateformes, stockage de l'extension, navigation par l'IP de B). Le moteur steel expose de même son API (3000).
//
// LA RÈGLE — deux couches indépendantes, avec une condition commune :
//   · commune : le pont FILTRÉ (br_netfilter chargé, net.bridge.bridge-nf-call-iptables = 1) ; sans lui, aucune règle
//     iptables ne voit un paquet d'un conteneur vers un autre ;
//   1. Docker : le réseau créé avec com.docker.network.bridge.enable_icc=false (Docker 29 : DOCKER-FORWARD
//      « -i br-fillsell -o br-fillsell -j DROP », et il charge lui-même br_netfilter, ou refuse de créer le réseau) ;
//   2. le pare-feu de l'hôte (deploiement/pare-feu-navigateurs.sh) : FILLSELL-NAV n'a plus de « -d 172.31.0.0/24 -j RETURN »
//      — un paquet d'un conteneur vers un autre tombe sur son DROP final ; le script charge br_netfilter et le DIT dans sa
//      preuve (etat/pare-feu.json : entre_conteneurs = ferme, pont_filtre = 1).
// Ce qui reste ouvert, inchangé : l'orchestrateur (réseau de l'hôte) joint chaque conteneur — ses paquets partent de l'hôte
// (OUTPUT), jamais par la chaîne FORWARD du pont, et les réponses rentrent par ESTABLISHED ; la sortie des navigateurs vers
// les proxys (routée vers l'extérieur) suit les mêmes règles qu'avant.
//
// AU DÉMARRAGE (index.js) : le verdict est écrit au journal ; une couche absente = alerte support@ (alertes.signaler).
// À L'OUVERTURE (navigateur.js, postes.js) : sans AUCUNE couche prouvée, UN SEUL compte à la fois — le premier venu ; le compte
// de Nico seul n'est donc jamais bloqué. Les autres attendent (refus « reseau_non_cloisonne » du planificateur : aucune
// erreur rejouée chaque minute, aucun poste réécrit pour rien).
import { readFile } from 'node:fs/promises';
import { preuvePareFeu } from './navigateur.js';
import { OPTION_ICC } from './docker.js';

// L'état du pont dans le noyau de l'hôte : absent = br_netfilter non chargé. L'orchestrateur est sur le réseau de l'hôte
// (docker-compose.yml, network_mode: host) : il lit la valeur de l'hôte.
export const FICHIER_PONT_FILTRE = '/proc/sys/net/bridge/bridge-nf-call-iptables';
export const DOC_BASCULE = 'docs/cloud/ETANCHEITE-CLOUD2.md';

/**
 * Le verdict du cloisonnement (pur : testé). `reseau` = l'inspection Docker du réseau (ou null), `pontFiltre` = le contenu
 * de bridge-nf-call-iptables (« 1 » attendu ; vide si br_netfilter n'est pas chargé), `preuve` = etat/pare-feu.json brut,
 * `bootId` = le numéro de CE démarrage. Rend { ok, complet, docker, pareFeu, pontFiltre, raisons }.
 *   ok      : au moins une couche tient (un conteneur ne joint aucun autre) ;
 *   complet : les deux couches tiennent.
 */
export function verdictCloisonnement({ reseau, pontFiltre, preuve, bootId }) {
  const raisons = [];
  const filtre = String(pontFiltre ?? '').trim() === '1';
  if (!filtre) raisons.push('pont_non_filtre');
  // Docker lit l'option par strconv.ParseBool : « false », « 0 », « f » (toute casse) la coupent.
  const iccCoupee = Boolean(reseau) && ['false', '0', 'f'].includes(String(reseau?.Options?.[OPTION_ICC] ?? '').trim().toLowerCase());
  if (!reseau) raisons.push('reseau_absent');
  else if (!iccCoupee) raisons.push('reseau_sans_enable_icc');
  const p = preuvePareFeu(preuve, bootId);
  let entre = null;
  try { entre = JSON.parse(String(preuve ?? ''))?.entre_conteneurs ?? null; } catch { entre = null; }
  if (!p.ok) raisons.push(`pare_feu_${p.raison}`);
  else if (entre !== 'ferme') raisons.push('pare_feu_sans_fermeture_entre_conteneurs');
  const docker = filtre && iccCoupee;
  const pareFeu = filtre && p.ok && entre === 'ferme';
  return { ok: docker || pareFeu, complet: docker && pareFeu, docker, pareFeu, pontFiltre: filtre, raisons };
}

/** Le navigateur d'un compte peut-il s'ouvrir ? (pure : testée) — toujours s'il est SEUL ; à côté d'autres, seulement cloisonné. */
export function ouverturePermise(verdict, autres) {
  return Boolean(verdict?.ok) || !(Number(autres) > 0);
}

// La preuve du pare-feu d'un AUTRE démarrage (ou pas encore écrite) : le pare-feu n'a pas encore été rejoué depuis ce
// démarrage — l'orchestrateur n'ouvre de toute façon aucun navigateur avant (exigerPareFeu). Pas une alerte en soi.
const PAS_ENCORE_POSE = /^pare_feu_preuve_/;

/** L'alerte à envoyer pour un verdict (pure : testée) : null s'il n'y a rien à dire, sinon { niveau, texte }. */
export function alerteCloisonnement(verdict, serveur = '') {
  if (!verdict || verdict.complet) return null;
  const vraies = (verdict.raisons ?? []).filter((r) => !PAS_ENCORE_POSE.test(r));
  if (verdict.ok && !vraies.length) return null;
  const constat = (verdict.raisons ?? []).join(', ') || 'inconnu';
  if (!verdict.ok) {
    return { niveau: 'serveur', texte: `Réseau des navigateurs NON cloisonné (${serveur}) : un conteneur peut joindre le pilotage DevTools d'un autre. Un seul compte à la fois jusqu'à la bascule (${DOC_BASCULE}). Constat : ${constat}.` };
  }
  return { niveau: 'serveur', texte: `Cloisonnement du réseau des navigateurs PARTIEL (${serveur}) : une couche tient, l'autre manque (${constat}). Bascule à faire (${DOC_BASCULE}).` };
}

/**
 * Le cloisonnement d'un serveur : evaluer() (Docker + noyau + preuve du pare-feu, lus à chaque appel : rare — un démarrage,
 * une ouverture à côté d'autres comptes), verifierAuDemarrage(), exiger(user, autres) (lève si refusé).
 */
export function creerCloisonnement({ config, docker, journal, alertes = null, lirePont = null, lirePreuve = null, lireBoot = null }) {
  const dossier = config.dossierEtat || '/srv/fillsell-cloud/etat';
  const pont = lirePont ?? (() => readFile(FICHIER_PONT_FILTRE, 'utf8'));
  const preuve = lirePreuve ?? (() => readFile(`${dossier}/pare-feu.json`, 'utf8'));
  const boot = lireBoot ?? (() => readFile('/proc/sys/kernel/random/boot_id', 'utf8'));

  async function evaluer() {
    const [reseau, pontFiltre, brute, bootId] = await Promise.all([
      docker.reseau(config.reseauDocker),
      Promise.resolve().then(pont).catch(() => ''),
      Promise.resolve().then(preuve).catch(() => ''),
      Promise.resolve().then(boot).catch(() => ''),
    ]);
    return verdictCloisonnement({ reseau, pontFiltre, preuve: brute, bootId });
  }

  async function verifierAuDemarrage() {
    const v = await evaluer();
    journal.info('reseau_cloisonnement', { reseau: config.reseauDocker, ok: v.ok, complet: v.complet, docker: v.docker, pare_feu: v.pareFeu,
      pont_filtre: v.pontFiltre, raisons: v.raisons });
    const a = alerteCloisonnement(v, config.serveurNom);
    if (a) {
      journal.alerte('reseau_non_cloisonne', { ok: v.ok, raisons: v.raisons });
      await alertes?.signaler(a.niveau, a.texte, { raisons: v.raisons });
    }
    return v;
  }

  /** Refuse (lève) le navigateur d'un compte quand `autres` comptes en ont un (ou l'ouvrent) et que rien ne cloisonne. */
  async function exiger(user, autres) {
    if (!(Number(autres) > 0)) return null;
    const v = await evaluer().catch((e) => ({ ok: false, raisons: [`verification_impossible (${e.message})`] }));
    if (ouverturePermise(v, autres)) return v;
    journal.alerte('ouverture_refusee_reseau_non_cloisonne', { user, autres: Number(autres), raisons: v.raisons });
    throw new Error(`navigateur refusé : réseau des navigateurs non cloisonné (${(v.raisons ?? []).join(', ')}) — un seul compte à la fois`);
  }

  return { evaluer, verifierAuDemarrage, exiger };
}
