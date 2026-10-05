// LES POSTES — allumer et éteindre le navigateur d'un compte, proprement :
// coffre réinjecté à l'ouverture, session FillSell posée, sauvegardes pendant la
// session et à la fermeture. Et la boucle du planificateur (une minute).
import { readFile } from 'node:fs/promises';
import { PLATEFORMES_CLOUD } from './plateformes.js';
import { planifierPostes, resumerJobs } from './planificateur.js';
import { nouveauProfilId } from './navigateur.js';
import { idExtensionDepuisCle, poserDansExtension, lireDansExtension, claims } from './sessionFillsell.js';

export function creerPostes({ config, base, navigateurs, coffre, sessions, journal, connexionsOuvertes, alertes }) {
  const dernieresFins = new Map();
  const dernieresSauvegardes = new Map();
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
    for (let i = 0; i < 6 && !lu; i++) {
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

  async function sauvegarder(user, h) {
    const { cookies } = await h.cdp.send('Storage.getCookies');
    const bilan = await coffre.sauvegarderCookies(user, cookies);
    const session = await relireSession(user, h);
    dernieresSauvegardes.set(user, Date.now());
    return { ...bilan, fillsell: session ? 'relue' : 'absente' };
  }

  async function ouvrir(user, compte, motif) {
    const poste = await lirePoste(user);
    let profilId = poste?.details?.profil;
    if (!profilId) profilId = nouveauProfilId(user);
    await noter(user, 'demarrage', { serveur: config.serveurNom, profil: profilId, motif });
    try {
      const { data: proxyUrl, error } = await base.rpc('cloud_proxy_identifiants', { p_ip: compte.ip_id });
      if (error || !proxyUrl) throw new Error(`proxy du compte illisible : ${error?.message ?? 'absent'}`);
      const h = await navigateurs.ouvrir(user, { proxyUrl, profilId });
      h.ipId = compte.ip_id;
      // 1. Le coffre : les plateformes absentes du profil reviennent.
      const { cookies } = await h.cdp.send('Storage.getCookies');
      const { aPoser, bilan: bilanCoffre } = await coffre.cookiesARestaurer(user, cookies);
      if (aPoser.length) await h.cdp.send('Storage.setCookies', { cookies: aPoser });
      // 2. La session FillSell.
      const s = await assurerSessionFillsell(user, h, poste);
      await noter(user, 'actif', { serveur: config.serveurNom, conteneur: h.conteneur, profil: profilId,
        session_fillsell_id: s.sessionId ?? '', motif });
      journal.info('poste_ouvert', { user, motif, coffre: bilanCoffre, session: s.source });
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
    const { data: comptesBruts, error } = await base.rpc('cloud_comptes_a_servir');
    if (error) throw new Error(`cloud_comptes_a_servir : ${error.message}`);
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
    // Sauvegardes périodiques (10 min) des navigateurs qui tournent.
    for (const u of navigateurs.ouverts()) {
      if (Date.now() - (dernieresSauvegardes.get(u) ?? 0) < 10 * 60_000) continue;
      await sauvegarder(u, navigateurs.ouvert(u)).catch((e) => journal.alerte('sauvegarde_echec', { user: u, erreur: e.message }));
    }
    if (decision.refuses.some((r) => r.raison === 'capacite')) {
      await alertes?.signaler('serveur', `Capacité atteinte : ${decision.refuses.length} compte(s) attendent un navigateur (max ${config.navigateursMax}).`);
    }
    return { comptes: comptes.length, ouverts: navigateurs.ouverts().length, ...decision };
  }

  return { tour, ouvrir, fermer, sauvegarder, extensionId, lirePoste, dernieresFins };
}
