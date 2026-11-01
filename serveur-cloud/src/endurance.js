// L'ESSAI DE 48 H SUR LE VRAI PRODUIT (01/11, demande de Nico) — son compte seul. Personne ne surveille en boucle :
// le serveur mesure lui-même, écrit ce qu'il voit, et S'ARRÊTE AU PREMIER BLOCAGE en disant lequel.
//   · chaque minute : les cadres DataDome ouverts dans le navigateur, HORS « Me connecter » (là, c'est la personne qui
//     résout) : « bloque » (captcha t=bv), « glissiere » (une vérification à résoudre pendant le travail), une
//     « verification » (interstitiel) qui reste au-delà de VERIFICATION_TOLEREE_MS ;
//   · toutes les 10 min : la mémoire de chaque navigateur (docker stats) et du serveur, l'état des connexions (coffre),
//     les tâches du Cloud (faites, refusées) — une ligne de endurance/mesures.jsonl ;
//   · une tâche du Cloud refusée par l'anti-robot (texte d'erreur de l'extension) = un blocage ;
//   · premier blocage : endurance/arret.json (quoi, où, quand), navigateur fermé (sauvegardé), plus aucune ouverture.
//   · (01/11, 23:10, après l'arrêt silencieux de 22:57) un blocage qui nomme sa plateforme n'arrête QUE cette plateforme
//     (endurance/blocages.json, postes.bloquerPlateforme) : les autres continuent, l'app demande la vérification ;
//     l'arrêt total ne reste que pour un blocage sans plateforme connue.
// Actif seulement avec ENDURANCE=1 ; rien n'est écrit en base. Les fonctions pures sont testées
// (tests/endurance.test.mjs).
import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';

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

/** (02/11) Les plateformes que l'app met en pause sur le compte (pure) : Leboncoin restreint et pas encore levé. */
export function pausesDeLApp(ps) {
  const b = ps?.leboncoin?.blocage_acces;
  return b && typeof b === 'object' && !b.leve_le ? ['leboncoin'] : [];
}

/** (02/11) Les tâches du Cloud publiées qui prouvent une plateforme pas encore vérifiée (pure) : la première par plateforme. */
export function preuvesParTache(lignes, dejaVerifiees = new Set()) {
  const vues = new Set(dejaVerifiees);
  return (lignes ?? [])
    .filter((j) => j?.status === 'published' && /-cloud/.test(String(j.handler_build ?? '')) && Number.isFinite(Date.parse(j.published_at)))
    .sort((a, b) => Date.parse(a.published_at) - Date.parse(b.published_at))
    .filter((j) => { if (vues.has(j.platform)) return false; vues.add(j.platform); return true; });
}

/**
 * (01/11) Le décompte des 48 h (pure, lu par outils/endurance-bilan.mjs). Seul compte ce qui suit la DERNIÈRE remise à
 * zéro (evenement 'remise_a_zero', outils/endurance-remise.mjs) : les connexions faussement « connectées » du 01/11 au
 * soir n'entrent dans aucun décompte. Chaque plateforme part de SA première connexion vérifiée (compte lu).
 * (01/11, 23:10, règle de Nico : « le compteur ne doit pas tourner pendant que l'exécutant est arrêté ») Les heures
 * COMPTÉES d'une plateforme sont celles de MARCHE : entre deux mesures consécutives (au plus ECART_MAX_MS d'écart — un
 * orchestrateur muet ne compte pas), navigateur ouvert, essai non arrêté, plateforme connectée au coffre et pas en
 * vérification. Rend { remise, debut, plateformes: { pf: { verifiee_le, tombee_le, heures_comptees, reste_heures,
 * atteint } }, executant_heures, lignes }.
 */
export const ECART_MAX_MS = 15 * 60_000;
export function decompteEssai(lignes, dureeMs = DUREE_ESSAI_MS) {
  const toutes = (lignes ?? []).filter((l) => l && Number.isFinite(Date.parse(l.le)));
  const iRemise = toutes.map((l) => l.evenement).lastIndexOf('remise_a_zero');
  const remise = iRemise >= 0 ? toutes[iRemise] : null;
  const apres = iRemise >= 0 ? toutes.slice(iRemise + 1) : toutes;
  const plateformes = {};
  for (const l of apres) {
    if (l.evenement === 'connexion_verifiee' && l.plateforme && !plateformes[l.plateforme]) {
      plateformes[l.plateforme] = { verifiee_le: l.verifiee_le ?? l.le, tombee_le: null, ms: 0 };
    }
    if (l.evenement === 'connexion_tombee' && plateformes[l.plateforme] && !plateformes[l.plateforme].tombee_le) {
      plateformes[l.plateforme].tombee_le = l.le;
    }
  }
  const mesures = apres.filter((l) => l.evenement === 'mesure');
  let executantMs = 0;
  for (let i = 1; i < mesures.length; i++) {
    const a = Date.parse(mesures[i - 1].le), b = Date.parse(mesures[i].le), m = mesures[i];
    if (!(b > a) || b - a > ECART_MAX_MS || m.arrete) continue;
    if (!Object.values(m.navigateursMo ?? {}).some(Number.isFinite)) continue;   // navigateur fermé : rien ne tourne
    executantMs += b - a;
    const cx = Object.assign({}, ...Object.values(m.connexions ?? {}));
    const enVerif = new Set([...Object.values(m.bloquees ?? {}).flat(), ...Object.values(m.pauses ?? {}).flat()]);
    for (const [pf, info] of Object.entries(plateformes)) {
      const v = Date.parse(info.verifiee_le);
      if (!(v < b) || cx[pf] !== true || enVerif.has(pf)) continue;
      info.ms += b - Math.max(a, v);
    }
  }
  const h = (ms) => Math.round((ms / 3600_000) * 10) / 10;
  for (const info of Object.values(plateformes)) {
    info.heures_comptees = h(info.ms);
    info.reste_heures = h(Math.max(0, dureeMs - info.ms));
    info.atteint = info.ms >= dureeMs;
    delete info.ms;
  }
  const debuts = Object.values(plateformes).map((p) => Date.parse(p.verifiee_le)).filter(Number.isFinite);
  const debut = debuts.length ? new Date(Math.min(...debuts)).toISOString() : null;
  return { remise: remise ? { le: remise.le, raison: remise.raison ?? null } : null, debut, plateformes,
    executant_heures: h(executantMs), lignes: apres };
}

export function creerEndurance({ config, base, docker, navigateurs, postes, connexionsOuvertes, journal }) {
  const dossier = `${config.dossierEtat || '/srv/fillsell-cloud/etat'}/endurance`;
  const fichierArret = `${dossier}/arret.json`;
  const fichierBlocages = `${dossier}/blocages.json`;
  let arret = null;            // un blocage SANS plateforme (inconnu) : l'essai entier s'arrête (relu au démarrage)
  // (01/11, 23:10) Les plateformes EN VÉRIFICATION : un blocage n'arrête plus que sa plateforme (postes.bloquerPlateforme).
  let blocages = [];           // historique { le, user, plateforme, nature, detail, source, tache?, debloquee_le? }
  let vus = new Map();
  const etatsAvant = new Map(); // user → { plateforme: connecte }
  let depuis = new Date().toISOString();

  const enCours = (user) => blocages.filter((b) => b.user === user && !b.debloquee_le);
  const plateformesBloquees = (user) => [...new Set(enCours(user).map((b) => b.plateforme))];
  const garderBlocages = () => writeFile(fichierBlocages, `${JSON.stringify(blocages, null, 1)}\n`)
    .catch((e) => journal.erreur('endurance_blocages_ecriture', { erreur: e.message }));

  async function charger() {
    await mkdir(dossier, { recursive: true });
    blocages = await readFile(fichierBlocages, 'utf8').then(JSON.parse).catch(() => []);
    if (!Array.isArray(blocages)) blocages = [];
    arret = await readFile(fichierArret, 'utf8').then(JSON.parse).catch(() => null);
    // (01/11, 23:10) L'arrêt du 22:57 (glissière Leboncoin) venait de la règle d'avant, qui arrêtait TOUT : un arrêt qui
    // nomme sa plateforme devient le blocage de cette seule plateforme ; le fichier est gardé à côté (historique).
    if (arret?.plateforme) {
      if (!blocages.some((b) => b.user === arret.user && b.plateforme === arret.plateforme && b.le === arret.le)) {
        blocages.push({ ...arret, converti_de: 'arret.json' });
        await garderBlocages();
      }
      await rename(fichierArret, `${dossier}/arret-${String(arret.le).replace(/[:.]/g, '-')}.json`).catch(() => {});
      journal.alerte('endurance_arret_converti', { plateforme: arret.plateforme, le: arret.le });
      arret = null;
    }
    if (arret) journal.alerte('endurance_deja_arretee', { ...arret });
    // Les plateformes encore en vérification le restent après un redémarrage (coffre marqué, verrou fermé à l'ouverture).
    for (const b of blocages.filter((x) => !x.debloquee_le)) {
      await postes.bloquerPlateforme(b.user, b.plateforme, { nature: b.nature, detail: b.detail ?? null, le: b.le })
        .catch((e) => journal.alerte('endurance_reblocage_echec', { plateforme: b.plateforme, erreur: e.message }));
    }
    return arret;
  }

  /** Un blocage sans plateforme connue : l'essai entier s'arrête (règle d'avant, gardée pour ce seul cas). */
  async function arreter(user, blocage) {
    if (arret) return;
    arret = { le: new Date().toISOString(), user, ...blocage };
    await writeFile(fichierArret, `${JSON.stringify(arret)}\n`).catch((e) => journal.erreur('endurance_arret_ecriture', { erreur: e.message }));
    await ecrire({ evenement: 'ARRET_PREMIER_BLOCAGE', ...arret });
    journal.alerte('endurance_arret_premier_blocage', { ...arret });
    await postes.noter?.(user, 'erreur', { erreur: `arret_essai:${blocage.nature ?? 'inconnu'}` });
    await postes.fermer(user, 'blocage_endurance').catch((e) => journal.erreur('endurance_fermeture', { erreur: e.message }));
  }

  /** (01/11, 23:10) Le blocage d'UNE plateforme : elle seule s'arrête (verrou, onglets, coffre en vérification). */
  async function bloquer(user, blocage) {
    if (!blocage?.plateforme) return arreter(user, blocage);
    if (plateformesBloquees(user).includes(blocage.plateforme)) return;
    const b = { le: new Date().toISOString(), user, ...blocage };
    blocages.push(b);
    await garderBlocages();
    await ecrire({ evenement: 'PLATEFORME_BLOQUEE', ...b, user: String(user).slice(0, 8) });
    const fait = await postes.bloquerPlateforme(user, blocage.plateforme, { nature: blocage.nature, detail: blocage.detail ?? null, le: b.le })
      .catch((e) => ({ erreur: e.message }));
    journal.alerte('endurance_plateforme_bloquee', { user, ...blocage, fait });
  }

  /** Une connexion vérifiée (« Me connecter ») rouvre sa plateforme : la vérification est résolue. */
  async function debloquer(user, plateforme, le = new Date().toISOString()) {
    const ouverts = enCours(user).filter((b) => b.plateforme === plateforme);
    if (!ouverts.length) return;
    for (const b of ouverts) b.debloquee_le = le;
    await garderBlocages();
    await ecrire({ evenement: 'plateforme_debloquee', user: String(user).slice(0, 8), plateforme, debloquee_le: le });
  }

  /** Les plateformes déjà vérifiées depuis la dernière remise à zéro (relu dans le journal de l'essai, petit fichier). */
  async function plateformesVerifiees() {
    const lignes = (await readFile(`${dossier}/mesures.jsonl`, 'utf8').catch(() => '')).split('\n').filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    return new Set(Object.keys(decompteEssai(lignes).plateformes));
  }

  const ecrire = (o) => appendFile(`${dossier}/mesures.jsonl`, `${JSON.stringify({ le: new Date().toISOString(), ...o })}\n`).catch(() => {});

  /** Chaque minute : les cadres DataDome des onglets de travail (une plateforme déjà en vérification n'est plus lue). */
  async function releveCadres() {
    if (arret) return;
    const enConnexion = connexionsOuvertes?.() ?? new Set();
    for (const user of navigateurs.ouverts()) {
      if (enConnexion.has(user)) continue;    // « Me connecter » : c'est la personne qui résout, à l'écran
      const h = navigateurs.ouvert(user);
      const r = await h?.cdp?.send('Target.getTargets').catch(() => null);
      if (!r) continue;
      const deja = new Set(plateformesBloquees(user));
      const cibles = (r.targetInfos ?? []).filter((t) => !deja.has(cadreDataDome(t?.url)?.plateforme ?? ''));
      const res = blocageDesCadres(cibles, vus);
      vus = res.vus;
      if (res.blocage) await bloquer(user, { source: 'navigateur', ...res.blocage });
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
    const bloquees = Object.fromEntries(comptes.map((u) => [u.slice(0, 8), plateformesBloquees(u)]).filter(([, l]) => l.length));
    // (02/11) Une plateforme que l'APP met en pause (Leboncoin « Accès temporairement restreint » :
    // platform_settings.leboncoin.blocage_acces, _shared/blocage-leboncoin.js) ne fait rien : ses heures ne comptent pas.
    const pauses = {};
    for (const user of comptes) {
      const { data: pr } = await base.from('profiles').select('platform_settings').eq('id', user).maybeSingle();
      const l = pausesDeLApp(pr?.platform_settings);
      if (l.length) pauses[user.slice(0, 8)] = l;
    }
    let taches = null;
    if (comptes.length) {
      const { data } = await base.from('cross_post_jobs').select('id, platform, action, status, error, handler_build, published_at')
        .in('user_id', comptes).like('handler_build', '%-cloud%')
        .or(`created_at.gte.${depuis},published_at.gte.${depuis},last_checked_at.gte.${depuis}`).limit(500);
      taches = resumeTachesCloud(data ?? []);
      // Une tâche refusée par l'anti-robot bloque SA plateforme, une fois (la même tâche ne rebloque jamais).
      for (const anti of taches.anti_robot) {
        if (blocages.some((b) => b.tache === anti.id) || !anti.plateforme) continue;
        await bloquer(comptes[0], { source: 'tache', nature: 'tache_refusee_anti_robot', plateforme: anti.plateforme, tache: anti.id, detail: `tâche ${anti.id} (${anti.action})` });
      }
      // (02/11) Une tâche du Cloud PUBLIÉE est la preuve la plus forte d'une session vivante : une plateforme sans
      // connexion vérifiée depuis la remise à zéro (Vinted, connectée avant la règle « compte lu ») l'est par elle.
      const dejaVerifiees = await plateformesVerifiees();
      for (const j of preuvesParTache(data ?? [], dejaVerifiees)) {
        await ecrire({ evenement: 'connexion_verifiee', user: comptes[0].slice(0, 8), plateforme: j.platform, preuve: 'tache_publiee', tache: j.id, verifiee_le: j.published_at });
      }
    }
    await ecrire({ evenement: 'mesure', navigateursMo, serveurMo, verrou, connexions, bloquees, pauses, taches, arrete: Boolean(arret) });
  }

  /**
   * (01/11, règle de Nico : « les 48 h ne comptent qu'à partir de connexions vraiment réussies ») Une connexion VÉRIFIÉE
   * (compte lu par le serveur, connexion.js) est notée ; le bilan fait partir les heures de chaque plateforme de sa
   * première vérification après la dernière remise à zéro. (01/11, 23:10) Elle rouvre aussi une plateforme en
   * vérification.
   */
  async function connexionVerifiee({ user, plateforme, http, le }) {
    await ecrire({ evenement: 'connexion_verifiee', user: String(user).slice(0, 8), plateforme, http, verifiee_le: le ?? null });
    await debloquer(user, plateforme, le ?? undefined);
  }

  return { charger, releveCadres, mesure, connexionVerifiee, bloquer, debloquer, plateformesBloquees,
    arretee: () => arret, arreter };
}
