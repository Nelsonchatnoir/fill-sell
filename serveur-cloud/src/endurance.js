// L'ESSAI DE 48 H SUR LE VRAI PRODUIT (01/11, demande de Nico) — son compte seul. Personne ne surveille en boucle :
// le serveur mesure lui-même, écrit ce qu'il voit, et S'ARRÊTE AU PREMIER BLOCAGE en disant lequel.
//   · chaque minute : les cadres DataDome ouverts dans le navigateur, HORS « Me connecter » (là, c'est la personne qui
//     résout) : « bloque » (captcha t=bv), « glissiere » (une vérification à résoudre pendant le travail), une
//     « verification » (interstitiel) qui reste au-delà de VERIFICATION_TOLEREE_MS ;
//   · toutes les 10 min : la mémoire de chaque navigateur (docker stats) et du serveur, l'état des connexions (coffre),
//     les tâches du Cloud (faites, refusées) — une ligne de endurance/mesures.jsonl ;
//   · une tâche du Cloud refusée par l'anti-robot (texte d'erreur de l'extension) = un blocage ;
//   · premier blocage : endurance/arret.json (quoi, où, quand), navigateur fermé (sauvegardé), plus aucune ouverture.
// Actif seulement avec ENDURANCE=1 ; rien n'est écrit en base. Les fonctions pures sont testées
// (tests/endurance.test.mjs).
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';

export const VERIFICATION_TOLEREE_MS = 3 * 60_000;
const DOMAINES = [['leboncoin', /(^|\.)leboncoin\.fr$/], ['beebs', /(^|\.)beebs\.app$/], ['vinted', /(^|\.)vinted\.(fr|com)$/], ['depop', /(^|\.)depop\.com$/]];

/** La plateforme d'une adresse (pure) : 'leboncoin' | 'beebs' | 'vinted' | 'depop' | null. */
export function plateformeDeLAdresse(url) {
  let h = '';
  try { h = new URL(String(url)).hostname.toLowerCase(); } catch { return null; }
  return DOMAINES.find(([, re]) => re.test(h))?.[0] ?? null;
}

/**
 * Un cadre DataDome (pure) : null, ou { nature: 'bloque' | 'glissiere' | 'verification', plateforme }.
 * captcha-delivery.com/captcha/?…&t=bv = bloqué ; /captcha/ sinon = une vérification à résoudre (glissière) ;
 * /interstitial/ = « Vérification de l'appareil », qui passe d'elle-même. La plateforme : son paramètre referer.
 */
export function cadreDataDome(url) {
  let u;
  try { u = new URL(String(url)); } catch { return null; }
  if (!/(^|\.)captcha-delivery\.com$/i.test(u.hostname)) return null;
  const chemin = u.pathname.toLowerCase();
  const plateforme = plateformeDeLAdresse(u.searchParams.get('referer') ?? '') ?? null;
  if (chemin.startsWith('/captcha')) return { nature: u.searchParams.get('t') === 'bv' ? 'bloque' : 'glissiere', plateforme };
  if (chemin.startsWith('/interstitial')) return { nature: 'verification', plateforme };
  return null;
}

/** Une erreur de tâche qui dit l'anti-robot (pure) — les mots de l'extension (« vérification anti-robot », DataDome…). */
export const erreurAntiRobot = (texte) => /anti-?robot|datadome|captcha/i.test(String(texte ?? ''));

/**
 * Le blocage d'UN relevé des cadres (pure). `vus` : Map clé → premier instant vu (gardée d'un relevé à l'autre).
 * Rend { blocage: null | { nature, plateforme, detail }, vus } — une vérification devient un blocage si elle dure.
 */
export function blocageDesCadres(cibles, vus = new Map(), maintenant = Date.now()) {
  const presents = new Map();
  let blocage = null;
  for (const c of cibles ?? []) {
    const d = cadreDataDome(c?.url);
    if (!d) continue;
    const cle = `${d.nature}:${d.plateforme ?? '?'}`;
    presents.set(cle, vus.get(cle) ?? maintenant);
    if (!blocage && (d.nature === 'bloque' || d.nature === 'glissiere')) blocage = { ...d, detail: 'cadre DataDome dans un onglet de travail' };
  }
  if (!blocage) {
    for (const [cle, depuis] of presents) {
      if (cle.startsWith('verification:') && maintenant - depuis >= VERIFICATION_TOLEREE_MS) {
        blocage = { nature: 'verification', plateforme: cle.split(':')[1] === '?' ? null : cle.split(':')[1],
          detail: `vérification de l'appareil restée ${Math.round((maintenant - depuis) / 60_000)} min` };
        break;
      }
    }
  }
  return { blocage, vus: presents };
}

/** La mémoire réelle d'un conteneur (pure), en Mo : l'utilisation moins le cache de fichiers (comme `docker stats`). */
export function memoireMo(stats) {
  const m = stats?.memory_stats;
  if (!m || !Number.isFinite(m.usage)) return null;
  const cache = Number(m.stats?.inactive_file ?? m.stats?.total_inactive_file ?? 0);
  return Math.round((m.usage - (Number.isFinite(cache) ? cache : 0)) / (1024 * 1024));
}

/** Le résumé des tâches du Cloud depuis un instant (pure). */
export function resumeTachesCloud(lignes) {
  const r = { faites: 0, echouees: 0, en_attente_personne: 0, anti_robot: [] };
  for (const l of lignes ?? []) {
    if (['published', 'deleted', 'done'].includes(l.status)) r.faites++;
    else if (l.status === 'failed') r.echouees++;
    else if (l.status === 'needs_user') r.en_attente_personne++;
    if (['failed', 'needs_user'].includes(l.status) && erreurAntiRobot(l.error)) r.anti_robot.push({ id: l.id, plateforme: l.platform, action: l.action });
  }
  return r;
}

export const DUREE_ESSAI_MS = 48 * 3600_000;

/**
 * (01/11) Le décompte des 48 h (pure, lu par outils/endurance-bilan.mjs). Seul compte ce qui suit la DERNIÈRE remise à
 * zéro (evenement 'remise_a_zero', outils/endurance-remise.mjs) : les connexions faussement « connectées » du 01/11 au
 * soir n'entrent dans aucun décompte. Les heures de chaque plateforme partent de SA première connexion vérifiée
 * (compte lu) ; celles de l'essai, de la toute première. Rend { remise, debut, fin_prevue, plateformes, lignes }.
 */
export function decompteEssai(lignes, dureeMs = DUREE_ESSAI_MS) {
  const toutes = (lignes ?? []).filter((l) => l && Number.isFinite(Date.parse(l.le)));
  const iRemise = toutes.map((l) => l.evenement).lastIndexOf('remise_a_zero');
  const remise = iRemise >= 0 ? toutes[iRemise] : null;
  const apres = iRemise >= 0 ? toutes.slice(iRemise + 1) : toutes;
  const plateformes = {};
  for (const l of apres) {
    if (l.evenement === 'connexion_verifiee' && l.plateforme && !plateformes[l.plateforme]) {
      plateformes[l.plateforme] = { verifiee_le: l.verifiee_le ?? l.le, tombee_le: null };
    }
    if (l.evenement === 'connexion_tombee' && plateformes[l.plateforme] && !plateformes[l.plateforme].tombee_le) {
      plateformes[l.plateforme].tombee_le = l.le;
    }
  }
  const debuts = Object.values(plateformes).map((p) => Date.parse(p.verifiee_le)).filter(Number.isFinite);
  const debut = debuts.length ? new Date(Math.min(...debuts)).toISOString() : null;
  return { remise: remise ? { le: remise.le, raison: remise.raison ?? null } : null, debut,
    fin_prevue: debut ? new Date(Date.parse(debut) + dureeMs).toISOString() : null, plateformes, lignes: apres };
}

export function creerEndurance({ config, base, docker, navigateurs, postes, connexionsOuvertes, journal }) {
  const dossier = `${config.dossierEtat || '/srv/fillsell-cloud/etat'}/endurance`;
  const fichierArret = `${dossier}/arret.json`;
  let arret = null;            // le blocage qui a arrêté l'essai (relu au démarrage)
  let vus = new Map();
  const etatsAvant = new Map(); // user → { plateforme: connecte }
  let depuis = new Date().toISOString();

  async function charger() {
    await mkdir(dossier, { recursive: true });
    arret = await readFile(fichierArret, 'utf8').then(JSON.parse).catch(() => null);
    if (arret) journal.alerte('endurance_deja_arretee', { ...arret });
    return arret;
  }

  async function arreter(user, blocage) {
    if (arret) return;
    arret = { le: new Date().toISOString(), user, ...blocage };
    await writeFile(fichierArret, `${JSON.stringify(arret)}\n`).catch((e) => journal.erreur('endurance_arret_ecriture', { erreur: e.message }));
    await ecrire({ evenement: 'ARRET_PREMIER_BLOCAGE', ...arret });
    journal.alerte('endurance_arret_premier_blocage', { ...arret });
    await postes.fermer(user, 'blocage_endurance').catch((e) => journal.erreur('endurance_fermeture', { erreur: e.message }));
  }

  const ecrire = (o) => appendFile(`${dossier}/mesures.jsonl`, `${JSON.stringify({ le: new Date().toISOString(), ...o })}\n`).catch(() => {});

  /** Chaque minute : les cadres DataDome des onglets de travail. */
  async function releveCadres() {
    if (arret) return;
    const enConnexion = connexionsOuvertes?.() ?? new Set();
    for (const user of navigateurs.ouverts()) {
      if (enConnexion.has(user)) continue;    // « Me connecter » : c'est la personne qui résout, à l'écran
      const h = navigateurs.ouvert(user);
      const r = await h?.cdp?.send('Target.getTargets').catch(() => null);
      if (!r) continue;
      const res = blocageDesCadres(r.targetInfos ?? [], vus);
      vus = res.vus;
      if (res.blocage) return arreter(user, { source: 'navigateur', ...res.blocage });
    }
  }

  /** Toutes les 10 min : la mesure (mémoire, connexions, tâches). */
  async function mesure() {
    const navigateursMo = {};
    for (const c of await docker.lister().catch(() => [])) {
      const nom = c.Names?.[0]?.replace(/^\//, '') ?? '';
      if (!nom.startsWith('fs-nav-')) continue;
      navigateursMo[nom.slice(7, 15)] = memoireMo(await docker.stats(nom));
    }
    // Le verrou des plateformes de chaque navigateur : ce qui est ouvert, et combien de requêtes vers une plateforme fermée
    // ont été arrêtées (aucune visite anonyme sur l'IP du compte).
    const verrou = Object.fromEntries(navigateurs.ouverts().map((u) => [u.slice(0, 8), { permises: navigateurs.ouvert(u)?.permises ?? [], bloquees: navigateurs.ouvert(u)?.bloquees ?? 0 }]));
    const meminfo = await readFile('/proc/meminfo', 'utf8').catch(() => '');
    const kb = (k) => Number(meminfo.match(new RegExp(`^${k}:\\s+(\\d+)`, 'm'))?.[1] ?? NaN);
    const serveurMo = { total: Math.round(kb('MemTotal') / 1024), disponible: Math.round(kb('MemAvailable') / 1024) };
    const comptes = config.comptesAutorises ?? [];
    const connexions = {};
    for (const user of comptes) {
      const { data } = await base.from('cloud_coffre').select('plateforme, connecte, maj_le').eq('user_id', user);
      const etat = Object.fromEntries((data ?? []).filter((l) => l.plateforme !== 'fillsell').map((l) => [l.plateforme, l.connecte === true]));
      const avant = etatsAvant.get(user) ?? {};
      for (const [pf, oui] of Object.entries(etat)) {
        if (avant[pf] === true && oui === false) await ecrire({ evenement: 'connexion_tombee', user: user.slice(0, 8), plateforme: pf });
        if (avant[pf] === false && oui === true) await ecrire({ evenement: 'connexion_refaite', user: user.slice(0, 8), plateforme: pf });
      }
      etatsAvant.set(user, etat);
      connexions[user.slice(0, 8)] = etat;
    }
    let taches = null;
    if (comptes.length) {
      const { data } = await base.from('cross_post_jobs').select('id, platform, action, status, error, handler_build')
        .in('user_id', comptes).like('handler_build', '%-cloud%')
        .or(`created_at.gte.${depuis},published_at.gte.${depuis},last_checked_at.gte.${depuis}`).limit(500);
      taches = resumeTachesCloud(data ?? []);
      const anti = taches.anti_robot[0];
      if (anti && !arret) {
        await ecrire({ evenement: 'mesure', navigateursMo, serveurMo, verrou, connexions, taches });
        return arreter(comptes[0], { source: 'tache', nature: 'tache_refusee_anti_robot', plateforme: anti.plateforme, detail: `tâche ${anti.id} (${anti.action})` });
      }
    }
    await ecrire({ evenement: 'mesure', navigateursMo, serveurMo, verrou, connexions, taches, arrete: Boolean(arret) });
  }

  /**
   * (01/11, règle de Nico : « les 48 h ne comptent qu'à partir de connexions vraiment réussies ») Une connexion VÉRIFIÉE
   * (compte lu par le serveur, connexion.js) est notée ; le bilan fait partir les 48 h de la première d'entre elles
   * après la dernière remise à zéro (outils/endurance-remise.mjs).
   */
  function connexionVerifiee({ user, plateforme, http, le }) {
    return ecrire({ evenement: 'connexion_verifiee', user: String(user).slice(0, 8), plateforme, http, verifiee_le: le ?? null });
  }

  return { charger, releveCadres, mesure, connexionVerifiee, arretee: () => arret, arreter };
}
