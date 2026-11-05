// LES POSTES — allumer et éteindre le navigateur d'un compte, proprement :
// coffre réinjecté à l'ouverture, session FillSell posée, sauvegardes pendant la
// session et à la fermeture. Et la boucle du planificateur (une minute).
import { readFile } from 'node:fs/promises';
import { PLATEFORMES_CLOUD, ORIGINES_SESSION, cookiesAPurger, versCookieParam } from './plateformes.js';
import { planifierPostes, resumerJobs } from './planificateur.js';
import { nouveauProfilId, DOMAINES_VERROU, tailleEnMo } from './navigateur.js';
import { lireComptesDuServeur } from './flotte.js';
import { changementDePoste } from './pausesMessagerie.js';
import { idExtensionDepuisCle, poserDansExtension, lireDansExtension, claims, evaluerDansExtension } from './sessionFillsell.js';

// (05/11) Lu dans le service worker de l'extension Cloud (verrou des plateformes, build-extension-cloud.mjs) : les
// plateformes à reconnecter, déjà relues contre les cookies du moment. Une copie de l'extension sans ce verrou rend {}.
export const EXPRESSION_RECONNEXIONS_CLOUD = '(globalThis.__fillsellVerrouCloud && typeof globalThis.__fillsellVerrouCloud.reconnexions === "function")'
  + ' ? globalThis.__fillsellVerrouCloud.reconnexions() : {}';

/** Une adresse sur un domaine de la plateforme (pure) — les onglets à fermer quand elle est bloquée. */
export function surPlateforme(url, plateforme) {
  let h = '';
  try { h = new URL(String(url)).hostname.toLowerCase(); } catch { return false; }
  return (DOMAINES_VERROU[plateforme] ?? []).some((d) => h === d || h.endsWith(`.${d}`));
}

// (03/11, point 1 de Nico) LE FILET MÉMOIRE : un navigateur au repos qui dépasse le seuil est redémarré proprement.
export const FILET_OUVERT_DEPUIS_MIN_MS = 30 * 60_000;   // jamais un navigateur qui vient d'ouvrir (pas de boucle)
export const FILET_ESPACEMENT_MS = 2 * 3600_000;         // au plus un redémarrage mémoire toutes les 2 h par compte
/** Le seuil du filet en Mo (pure) : réglé, sinon 80 % du plafond du conteneur ; 0 ou illisible = coupé. */
export function seuilFiletMo(reglage, plafondMo) {
  if (reglage != null) return Number(reglage) > 0 ? Number(reglage) : 0;
  return Number(plafondMo) > 0 ? Math.round(Number(plafondMo) * 0.8) : 0;
}
/**
 * Faut-il redémarrer ce navigateur pour sa mémoire ? (pure : testée) Seulement AU REPOS : aucun job en cours, aucun
 * « Me connecter » ouvert, ouvert depuis au moins 30 min, pas déjà redémarré pour ça depuis 2 h, mémoire lue au-dessus
 * du seuil.
 */
export function redemarrerPourMemoire({ mo, seuilMo, enCours = 0, connexion = false, ouvertLe, dernierRedemarrage = null, maintenant = Date.now() }) {
  if (!(Number(seuilMo) > 0) || !Number.isFinite(Number(mo)) || Number(mo) <= Number(seuilMo)) return false;
  if (Number(enCours) > 0 || connexion) return false;
  if (!Number.isFinite(Number(ouvertLe)) || maintenant - Number(ouvertLe) < FILET_OUVERT_DEPUIS_MIN_MS) return false;
  if (dernierRedemarrage != null && maintenant - Number(dernierRedemarrage) < FILET_ESPACEMENT_MS) return false;
  return true;
}

export function creerPostes({ config, base, navigateurs, coffre, sessions, journal, connexionsOuvertes, alertes, fournisseurIp, arretEndurance = () => null,
  enregistrementFond = null, pausesMessagerie = null }) {
  const dernieresFins = new Map();
  const dernieresSauvegardes = new Map();
  const redemarragesMemoire = new Map();   // (03/11) user → instant du dernier redémarrage pour la mémoire
  let idExtension = null;

  async function extensionId() {
    if (idExtension) return idExtension;
    const man = JSON.parse(await readFile(`${config.dossierExtension}/manifest.json`, 'utf8'));
    if (!man.key) throw new Error('extension Cloud sans clé de manifeste (build-extension-cloud.mjs)');
    idExtension = idExtensionDepuisCle(man.key);
    return idExtension;
  }

  async function lirePoste(user) {
    const { data } = await base.from('cloud_postes').select('session_fillsell_id, details').eq('user_id', user).maybeSingle();
    return data ?? null;
  }
  const noter = (user, etat, details = {}) => base.rpc('cloud_poste_noter', { p_user: user, p_etat: etat, p_details: details })
    .then(({ error }) => { if (error) journal.alerte('poste_noter_echec', { user, erreur: error.message }); });

  /** La session FillSell de l'extension : gardée si elle est vivante et au bon
   *  compte ; sinon celle du coffre ; sinon une neuve (l'ancienne révoquée). */
  async function assurerSessionFillsell(user, h, poste) {
    const id = await extensionId();
    // L'extension démarre avec le navigateur : son service worker peut mettre
    // quelques secondes à apparaître.
    let lu = null;
    // (30/10) Chrome officiel : l'extension arrive par la stratégie d'entreprise (quelques secondes de plus).
    for (let i = 0; i < 16 && !lu; i++) {
      try { lu = await lireDansExtension(h.cdp, id); } catch { await new Promise((r) => setTimeout(r, 2500)); }
    }
    const ownExt = lu?.own;
    if (ownExt?.refresh_token && claims(ownExt.access_token)?.sub === user && (ownExt.expires_at ?? 0) * 1000 > Date.now() - 6 * 3600_000) {
      return { source: 'extension', sessionId: claims(ownExt.access_token)?.session_id ?? poste?.session_fillsell_id ?? null };
    }
    const c = await coffre.lire(user);
    let own = c.fillsell && !c.fillsell.illisible ? c.fillsell.own : null;
    let sessionId = own ? claims(own.access_token)?.session_id : null;
    if (own) own = await sessions.rafraichirHorsNavigateur(own);
    let source = 'coffre';
    if (!own) {
      const ancienne = sessionId ?? poste?.session_fillsell_id ?? null;
      ({ own, sessionId } = await sessions.fabriquer(user));
      source = 'neuve';
      if (ancienne && ancienne !== sessionId) await sessions.revoquer(user, ancienne).catch(() => {});
    }
    await coffre.ecrire(user, 'fillsell', { own, le: new Date().toISOString() }, true);
    const pose = await poserDansExtension(h.cdp, id, own, user);
    if (!pose) throw new Error('session FillSell non posée dans l\'extension');
    return { source, sessionId };
  }

  /** Relit la session de l'extension (Supabase la fait tourner) et la range au coffre. */
  async function relireSession(user, h) {
    try {
      const lu = await lireDansExtension(h.cdp, await extensionId());
      const own = lu?.own;
      if (own?.refresh_token && claims(own.access_token)?.sub === user) {
        await coffre.ecrire(user, 'fillsell', { own, le: new Date().toISOString() }, true);
        return true;
      }
    } catch (e) { journal.alerte('relecture_session_echec', { user, erreur: e.message }); }
    return false;
  }

  /**
   * (01/11) Efface du profil la session des plateformes NON connectées au coffre (`connectees` = celles qui le sont) :
   * leurs cookies (sauf l'appareil DataDome, cookiesAPurger) par un cookie déjà échu — Storage n'a pas d'effacement un
   * par un —, puis le stockage de leurs pages (jetons Leboncoin « luat », session Firebase de Beebs). Rend le nombre
   * de cookies effacés. `seulement` : ne viser que ces plateformes (fin d'un « Me connecter » sans connexion).
   */
  async function purgerSessions(user, h, cookies, connectees, seulement = null) {
    const viser = PLATEFORMES_CLOUD.filter((p) => !connectees.includes(p) && (!seulement || seulement.includes(p)));
    if (!viser.length) return 0;
    const aPurger = cookiesAPurger(cookies, PLATEFORMES_CLOUD.filter((p) => !viser.includes(p)));
    const echus = aPurger.map((c) => ({ ...versCookieParam(c, 0), expires: 1 }));
    if (echus.length) await h.cdp.send('Storage.setCookies', { cookies: echus });
    const stockage = await effacerStockage(h, viser.flatMap((p) => ORIGINES_SESSION[p] ?? []))
      .catch((e) => { journal.alerte('stockage_purge_echec', { user, plateformes: viser, erreur: e.message }); return 'echec'; });
    if (echus.length) journal.info('sessions_purgees', { user, plateformes: viser, cookies: echus.length, stockage });
    return echus.length;
  }

  /**
   * Le stockage de page (localStorage, IndexedDB) de ces origines, effacé SANS jamais ouvrir la plateforme.
   * (01/11, mesuré dans Chromium) Selon le profil, la session du NAVIGATEUR répond « Internal error » à
   * Storage.clearDataForOrigin ; celle d'une page vierge (about:blank, fermée aussitôt) efface.
   */
  async function effacerStockage(h, origines) {
    const STOCKAGES = 'local_storage,indexeddb';
    if (!origines.length) return 'rien';
    try {
      for (const origin of origines) await h.cdp.send('Storage.clearDataForOrigin', { origin, storageTypes: STOCKAGES });
      return 'navigateur';
    } catch { /* repli : une page vierge */ }
    const { targetId } = await h.cdp.send('Target.createTarget', { url: 'about:blank', background: true });
    try {
      const { sessionId } = await h.cdp.send('Target.attachToTarget', { targetId, flatten: true });
      for (const origin of origines) await h.cdp.send('Storage.clearDataForOrigin', { origin, storageTypes: STOCKAGES }, sessionId);
      return 'page_vierge';
    } finally { await h.cdp.send('Target.closeTarget', { targetId }).catch(() => {}); }
  }

  /** (01/11) La fin d'un « Me connecter » sans connexion vérifiée : la demi-session de CETTE plateforme part du profil. */
  async function purgerPlateforme(user, plateforme) {
    const h = navigateurs.ouvert(user);
    if (!h) return 0;
    const { cookies } = await h.cdp.send('Storage.getCookies');
    const lu = await coffre.lire(user).catch(() => null);
    if (!lu) return 0;    // coffre illisible : on ne sait pas si elle était connue, on ne touche à rien
    const connectees = PLATEFORMES_CLOUD.filter((p) => lu[p]?.connecte === true || lu[p]?.bloquee);
    return purgerSessions(user, h, cookies, connectees, [plateforme]);
  }

  /**
   * (01/11, essai de Nico : glissière DataDome Leboncoin dans l'onglet de travail à 22:54, tout l'exécutant arrêté sans
   * rien dire) UN BLOCAGE N'ARRÊTE QUE SA PLATEFORME : plus aucune requête vers elle (verrou), ses onglets de travail
   * fermés, sa ligne du coffre « en vérification » (ses tâches attendent, l'app demande la reconnexion) ; les autres
   * plateformes continuent. La personne résout la vérification dans « Me connecter » : la connexion vérifiée la rouvre.
   * Rend ce qui a été fait (pour le journal de l'essai).
   */
  async function bloquerPlateforme(user, plateforme, cause) {
    const h = navigateurs.ouvert(user);
    const fait = { verrou: false, onglets: 0, coffre: false };
    if (h) {
      const restantes = (h.permises ?? []).filter((p) => p !== plateforme);
      await navigateurs.permettre?.(user, restantes).then(() => { fait.verrou = true; })
        .catch((e) => journal.alerte('blocage_verrou_echec', { user, plateforme, erreur: e.message }));
      const r = await h.cdp.send('Target.getTargets').catch(() => null);
      for (const t of r?.targetInfos ?? []) {
        if (t.type !== 'page' || !surPlateforme(t.url, plateforme)) continue;
        await h.cdp.send('Target.closeTarget', { targetId: t.targetId }).then(() => { fait.onglets++; }).catch(() => {});
      }
    }
    fait.coffre = await coffre.bloquer(user, plateforme, cause)
      .catch((e) => { journal.alerte('blocage_coffre_echec', { user, plateforme, erreur: e.message }); return false; });
    journal.alerte('plateforme_bloquee', { user, plateforme, nature: cause?.nature ?? null, ...fait });
    return fait;
  }

  /**
   * (05/11, règle de Nico) Les plateformes que le verrou de l'extension Cloud n'a pas pu rouvrir (jeton court non
   * renouvelé par la visite du site, ou session fermée) — lues dans le service worker s'il tourne (jamais réveillé pour
   * ça), et seulement celles qui ne sont toujours pas « connectee » (expressionReconnexionsCloud). {} si rien à dire.
   */
  async function reconnexionsExtension(h) {
    const id = await extensionId().catch(() => null);
    if (!id || !h?.cdp) return {};
    const cibles = (await h.cdp.send('Target.getTargets').catch(() => null))?.targetInfos ?? [];
    if (!cibles.some((t) => t.type === 'service_worker' && String(t.url).startsWith(`chrome-extension://${id}/`))) return {};
    const r = await evaluerDansExtension(h.cdp, id, EXPRESSION_RECONNEXIONS_CLOUD).catch(() => null);
    return r && typeof r === 'object' ? r : {};
  }

  async function sauvegarder(user, h) {
    const { cookies } = await h.cdp.send('Storage.getCookies');
    const bilan = await coffre.sauvegarderCookies(user, cookies);
    // (05/11) Une connexion que l'exécutant n'a pas pu renouveler se dit « à reconnecter » dans l'app (même vérité que
    // le verrou) : avant, l'app disait « Connecté » pendant que le verrou refusait tout (Beebs, 05/11 11:20).
    for (const [p, r] of Object.entries(await reconnexionsExtension(h))) {
      if (!PLATEFORMES_CLOUD.includes(p) || String(bilan[p] ?? '').startsWith('a_reconnecter')) continue;
      const fait = await coffre.aReconnecter(user, p, { cause: String(r?.cause ?? 'jeton_non_renouvele') }).catch((e) => {
        journal.alerte('reconnexion_coffre_echec', { user, plateforme: p, erreur: e.message }); return false;
      });
      if (fait) { bilan[p] = 'a_reconnecter'; journal.alerte('reconnexion_requise', { user, plateforme: p, cause: r?.cause ?? null, le: r?.le ?? null }); }
    }
    const session = await relireSession(user, h);
    dernieresSauvegardes.set(user, Date.now());
    return { ...bilan, fillsell: session ? 'relue' : 'absente' };
  }

  async function ouvrir(user, compte, motif) {
    // (01/11) L'essai de 48 h arrêté au premier blocage (endurance.js) : plus aucune ouverture, « Me connecter » compris.
    if (arretEndurance()) throw new Error('essai arrêté au premier blocage (etat/endurance/arret.json)');
    const poste = await lirePoste(user);
    let profilId = poste?.details?.profil;
    if (!profilId) profilId = nouveauProfilId(user);
    await noter(user, 'demarrage', { serveur: config.serveurNom, profil: profilId, motif });
    try {
      // (30/10, lot D) La sortie vient du SEUL module fournisseur (IP dédiée, ou rotation).
      const sortie = await fournisseurIp.proxyPour(user, compte);
      // (30/10, règle de Nico) Le verrou du relais : seules les plateformes CONNECTÉES du compte (coffre) sont joignables.
      const h = await navigateurs.ouvrir(user, { proxyUrl: sortie.proxyUrl, proxyBeebs: sortie.proxyBeebs ?? null, proxySecours: sortie.proxySecours ?? null, profilId,
        permises: compte?.plateformes_connectees ?? [] });
      h.ipId = sortie.ipId;
      h.sortie = { mode: sortie.mode, sortie: sortie.sortie };
      // (30/10, lot D) L'historique des IP utilisées par le compte (conditions art. 8, confidentialité 4.8) : en rotation
      // sur le pool, chaque session est journalisée sur son IP (nature « attribution », identifiant effacé à 12 mois).
      if (sortie.ipPool != null) {
        await base.rpc('cloud_journal', { p_ip: sortie.ipPool, p_nature: 'attribution', p_user: user, p_details: { rotation: true, serveur: config.serveurNom } })
          .then(({ error }) => { if (error) journal.alerte('journal_ip_echec', { user, erreur: error.message }); });
      }
      // 1. Le coffre : les plateformes absentes du profil reviennent ; (01/11) celles qui n'y sont pas connectées n'ont
      //    plus aucune session dans le profil (demi-connexion abandonnée, connexion remise à « non connecté »).
      const { cookies } = await h.cdp.send('Storage.getCookies');
      const { aPoser, bilan: bilanCoffre, connectees, bloquees = [] } = await coffre.cookiesARestaurer(user, cookies);
      // (01/11) Une plateforme EN VÉRIFICATION (bloquerPlateforme) garde sa session : seul le verrou la ferme.
      await purgerSessions(user, h, cookies, [...connectees, ...bloquees]);
      if (aPoser.length) await h.cdp.send('Storage.setCookies', { cookies: aPoser });
      // 2. La session FillSell.
      const s = await assurerSessionFillsell(user, h, poste);
      // (04/11 soir, règle de Nico) Un changement de machine ou d'IP dédiée repart sans les pauses de l'ancienne
      // (messagerie, veille des commandes) : elles disaient l'ancienne machine, pas celle-ci. Jamais une cause d'échec.
      const ouvertSur = { serveur: config.serveurNom, ip_id: sortie.ipId ?? null, mode: sortie.mode ?? null };
      if (pausesMessagerie && changementDePoste(poste?.details?.ouvert_sur, ouvertSur)) {
        await pausesMessagerie.lever(user, null, { raison: 'changement_de_poste', oublier: true })
          .catch((e) => journal.alerte('pauses_changement_echec', { user, erreur: e.message }));
      }
      await noter(user, 'actif', { serveur: config.serveurNom, conteneur: h.conteneur, profil: profilId,
        session_fillsell_id: s.sessionId ?? '', motif, ip_mode: sortie.mode, ouvert_sur: ouvertSur });
      journal.info('poste_ouvert', { user, motif, coffre: bilanCoffre, session: s.source });
      // (04/11 soir, essai GPU) L'enregistrement de fond (ENREGISTREMENT_FOND=1) : jamais attendu, jamais une cause d'échec.
      enregistrementFond?.suivre(user, h).catch((e) => journal.alerte('enregistrement_fond_echec', { user, erreur: e.message }));
      return h;
    } catch (e) {
      await noter(user, 'erreur', { erreur: String(e.message).slice(0, 300) });
      await navigateurs.fermer(user, 'echec_ouverture').catch(() => {});
      throw e;
    }
  }

  async function fermer(user, raison) {
    const h = navigateurs.ouvert(user);
    if (h) {
      try { await sauvegarder(user, h); } catch (e) { journal.alerte('sauvegarde_fermeture_echec', { user, erreur: e.message }); }
    }
    enregistrementFond?.arreter(user, raison);
    await navigateurs.fermer(user, raison);
    dernieresFins.set(user, Date.now());
    await noter(user, 'eteint', { raison });
  }

  async function lireCpu() {
    const { data } = await base.from('veille_cpu').select('pct, le').order('le', { ascending: false }).limit(1).maybeSingle();
    if (!data || Date.now() - Date.parse(data.le) > 10 * 60_000) return null;   // mesure trop vieille : inconnue
    return Number(data.pct);
  }

  /** UN tour de planificateur. Rend la décision appliquée (pour le journal et les tests réels). */
  async function tour() {
    if (arretEndurance()) {
      for (const u of navigateurs.ouverts()) await fermer(u, 'blocage_endurance').catch((e) => journal.erreur('fermeture_echec', { user: u, erreur: e.message }));
      return { comptes: 0, ouverts: 0, ouvrir: [], fermer: [], refuses: [], arret_endurance: true };
    }
    // (03/11, flotte) Les comptes attribués à CE serveur (cloud_comptes_du_serveur) ; repli sur cloud_comptes_a_servir
    // tant que la migration 20261103201000 n'est pas en base.
    const { comptes: comptesBruts } = await lireComptesDuServeur(base, config.serveurNom);
    const comptes = (comptesBruts ?? []).filter((c) => !config.comptesAutorises.length || config.comptesAutorises.includes(c.user_id));
    const users = [...new Set([...comptes.map((c) => c.user_id), ...navigateurs.ouverts()])];
    let lignes = [];
    if (users.length) {
      const r = await base.from('cross_post_jobs').select('user_id, status, action, platform_fields')
        .in('user_id', users).in('status', ['pending', 'processing']).in('platform', PLATEFORMES_CLOUD)
        .eq('voie', 'extension').limit(1000);
      if (r.error) throw new Error(`jobs : ${r.error.message}`);
      lignes = r.data ?? [];
    }
    const ouverts = new Map(navigateurs.ouverts().map((u) => [u, navigateurs.ouvert(u)]));
    const delaiMin = comptes[0]?.delai_sessions_min ?? null;
    const decision = planifierPostes({
      comptes, ouverts, jobs: resumerJobs(lignes), connexions: connexionsOuvertes(), dernieresFins,
      delaiMin, cpuPct: await lireCpu(), cpuPause: config.cpuPauseAuDessus,
      navigateursMax: config.navigateursMax, sessionMinimaleMin: config.sessionMinimaleMin,
    });
    const parUser = new Map(comptes.map((c) => [c.user_id, c]));
    // Une IP remplacée (signalée → rebut, une autre attribuée) : le navigateur
    // repart sur le NOUVEAU proxy — jamais au milieu d'un job.
    const jobsParUser = resumerJobs(lignes);
    for (const [u, h] of ouverts) {
      const c = parUser.get(u);
      if (c && h.ipId != null && Number(c.ip_id) !== Number(h.ipId) && !(jobsParUser.get(u)?.enCours > 0)
          && !decision.fermer.some((f) => f.user === u)) {
        decision.fermer.push({ user: u, raison: 'ip_remplacee' });
      }
    }
    for (const f of decision.fermer) await fermer(f.user, f.raison).catch((e) => journal.erreur('fermeture_echec', { user: f.user, erreur: e.message }));
    for (const o of decision.ouvrir) {
      await ouvrir(o.user, parUser.get(o.user), o.motif).catch((e) => journal.erreur('ouverture_echec', { user: o.user, erreur: e.message }));
    }
    // (03/11, point 1) LE FILET MÉMOIRE : au repos et au-dessus du seuil → fermé proprement (coffre et session FillSell
    // sauvegardés par fermer), rouvert au tour suivant sur le même profil (aucune reconnexion). Jamais pendant un job.
    const seuil = seuilFiletMo(config.memoireRedemarrageMo, tailleEnMo(config.memoireNavigateur));
    if (seuil > 0 && navigateurs.memoire) {
      const connexionsVives = connexionsOuvertes();
      for (const u of navigateurs.ouverts()) {
        const h = navigateurs.ouvert(u);
        const mo = await navigateurs.memoire(u).catch(() => null);
        if (!redemarrerPourMemoire({ mo, seuilMo: seuil, enCours: jobsParUser.get(u)?.enCours ?? 0, connexion: connexionsVives.has(u),
          ouvertLe: h?.ouvertLe, dernierRedemarrage: redemarragesMemoire.get(u) ?? null })) continue;
        redemarragesMemoire.set(u, Date.now());
        journal.alerte('navigateur_redemarre_memoire', { user: u, mo, seuil_mo: seuil });
        await fermer(u, 'memoire_haute').catch((e) => journal.erreur('fermeture_echec', { user: u, erreur: e.message }));
        decision.fermer.push({ user: u, raison: 'memoire_haute' });
      }
    }
    // Sauvegardes périodiques (10 min) des navigateurs qui tournent. (01/11) Avec elles, le signe de vie de l'exécutant
    // (cloud_postes.derniere_activite, lu par l'app : un exécutant muet depuis plus de 25 min se DIT, bandeau Cloud).
    for (const u of navigateurs.ouverts()) {
      if (Date.now() - (dernieresSauvegardes.get(u) ?? 0) < 10 * 60_000) continue;
      await sauvegarder(u, navigateurs.ouvert(u)).catch((e) => journal.alerte('sauvegarde_echec', { user: u, erreur: e.message }));
      await noter(u, 'actif', { vu: new Date().toISOString() });
    }
    if (decision.refuses.some((r) => r.raison === 'capacite')) {
      await alertes?.signaler('serveur', `Capacité atteinte : ${decision.refuses.length} compte(s) attendent un navigateur (max ${config.navigateursMax}).`);
    }
    return { comptes: comptes.length, ouverts: navigateurs.ouverts().length, ...decision };
  }

  return { tour, ouvrir, fermer, sauvegarder, purgerPlateforme, bloquerPlateforme, noter, extensionId, lirePoste, dernieresFins };
}
