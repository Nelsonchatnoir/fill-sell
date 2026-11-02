// LES VÉRIFICATIONS ANTI-ROBOT DU NAVIGATEUR CLOUD — règle du PRODUIT, toujours active (02/11, demande de Nico).
// Avant, elle ne vivait que dans l'essai de 48 h (endurance.js, ENDURANCE=1) ; l'essai la lit désormais ici.
//
//   · chaque minute : les cadres DataDome des onglets de travail, HORS « Me connecter » (là, c'est la personne qui
//     résout) ; une vérification vue n'arrête QUE sa plateforme (postes.bloquerPlateforme : verrou, onglets fermés,
//     coffre « en vérification », session gardée) — les autres continuent ;
//   · DEUX ÉTATS POUR LA PERSONNE, jamais confondus (platform_settings.<plateforme>.cloud_verification, lu par l'app) :
//       « a_resoudre » : une vérification soluble à la main (glissière) → l'app propose « Résoudre la vérification » :
//                        la page du navigateur Cloud où elle s'affiche, dans la vue de « Me connecter » ; la personne
//                        fait glisser, UNE lecture légère confirme l'accès rendu, la plateforme reprend seule ;
//       « restreint »  : l'accès est refusé sans rien à résoudre (DataDome t=bv, refus sans glissière, pause Leboncoin de
//                        l'app) → aucun bouton, on attend : FillSell refait UN seul essai au bout de 24 h ;
//     et « revenue » : la vérification revient dans les 30 min qui suivent sa résolution → on ne boucle pas : la
//     plateforme reste arrêtée, aucun bouton, l'équipe est prévenue (alertes.js) ;
//   · jamais de résolution automatique, jamais de service tiers : seule la personne fait glisser ;
//   · les tâches retenues de la plateforme portent le message du Cloud (« ouvre leboncoin.fr dans ton navigateur » ne
//     concerne pas le navigateur du téléphone) ; la plateforme rouverte, le message part.
// Rien ne change pour l'extension sur le PC d'une personne : ce module ne touche qu'aux comptes du Cloud.
// Les fonctions pures sont testées (tests/verifications.test.mjs, tests/endurance.test.mjs).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { DEFINITIONS, pageDeResolution, expressionAcces, verdictLectureCompte, EXPRESSION_ETAT_PAGE } from './plateformes.js';

export const VERIFICATION_TOLEREE_MS = 3 * 60_000;
export const REVENUE_MS = 30 * 60_000;
export const ATTENTE_RESTREINT_MS = 24 * 3600_000;
const LECTURE_PAUSES_MS = 5 * 60_000;
const ANNOTATION_MS = 10 * 60_000;
const DOMAINES = [['leboncoin', /(^|\.)leboncoin\.fr$/], ['beebs', /(^|\.)beebs\.app$/], ['vinted', /(^|\.)vinted\.(fr|com)$/], ['depop', /(^|\.)depop\.com$/]];

/** La plateforme d'une adresse (pure) : 'leboncoin' | 'beebs' | 'vinted' | 'depop' | null. */
export function plateformeDeLAdresse(url) {
  let h = '';
  try { h = new URL(String(url)).hostname.toLowerCase(); } catch { return null; }
  return DOMAINES.find(([, re]) => re.test(h))?.[0] ?? null;
}

/**
 * Un cadre DataDome (pure) : null, ou { nature: 'bloque' | 'glissiere' | 'verification', plateforme, referer }.
 * captcha-delivery.com/captcha/?…&t=bv = bloqué ; /captcha/ sinon = une vérification à résoudre (glissière) ;
 * /interstitial/ = « Vérification de l'appareil », qui passe d'elle-même. La plateforme : son paramètre referer.
 */
export function cadreDataDome(url) {
  let u;
  try { u = new URL(String(url)); } catch { return null; }
  if (!/(^|\.)captcha-delivery\.com$/i.test(u.hostname)) return null;
  const chemin = u.pathname.toLowerCase();
  const referer = u.searchParams.get('referer') ?? '';
  const plateforme = plateformeDeLAdresse(referer) ?? null;
  if (chemin.startsWith('/captcha')) return { nature: u.searchParams.get('t') === 'bv' ? 'bloque' : 'glissiere', plateforme, referer: referer || null };
  if (chemin.startsWith('/interstitial')) return { nature: 'verification', plateforme, referer: referer || null };
  return null;
}

/** Une erreur de tâche qui dit l'anti-robot (pure) — les mots de l'extension (« vérification anti-robot », DataDome…). */
export const erreurAntiRobot = (texte) => /anti-?robot|datadome|captcha/i.test(String(texte ?? ''));

/**
 * Le blocage d'UN relevé des cadres (pure). `vus` : Map clé → premier instant vu (gardée d'un relevé à l'autre).
 * Rend { blocage: null | { nature, plateforme, detail, referer }, vus } — une vérification devient un blocage si elle dure.
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

/** (02/11) Les plateformes que l'app met en pause sur le compte (pure) : Leboncoin restreint et pas encore levé. */
export function pausesDeLApp(ps) {
  const b = ps?.leboncoin?.blocage_acces;
  return b && typeof b === 'object' && !b.leve_le ? ['leboncoin'] : [];
}
/** Le début d'une pause de l'app (pure) : l'instant où Leboncoin a été vu restreint, ou null. */
export function debutPauseDeLApp(ps, plateforme) {
  const d = plateforme === 'leboncoin' ? ps?.leboncoin?.blocage_acces?.depuis : null;
  return Number.isFinite(Date.parse(String(d ?? ''))) ? new Date(Date.parse(d)).toISOString() : null;
}

/**
 * Ce que la personne voit d'un blocage (pure) : 'a_resoudre' (bouton « Résoudre la vérification »), 'restreint' (rien à
 * faire, on attend) ou 'revenue' (revenue juste après sa résolution : arrêtée, l'équipe regarde).
 */
export function etatVisible(nature) {
  if (nature === 'verification_revenue') return 'revenue';
  if (nature === 'bloque' || nature === 'restreint') return 'restreint';
  return 'a_resoudre';
}

/** La valeur de platform_settings.<plateforme>.cloud_verification pour un blocage (pure), ou null (aucun). */
export function etatPublie(blocage) {
  if (!blocage) return null;
  const etat = etatVisible(blocage.nature);
  return { etat, depuis: blocage.le, ...(etat === 'restreint' && blocage.essai_apres ? { essai_apres: blocage.essai_apres } : {}) };
}

const quandParis = (iso) => {
  const t = Date.parse(String(iso ?? ''));
  if (!Number.isFinite(t)) return '';
  const d = new Date(t);
  return ` depuis le ${d.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit' })} à ${d.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' })}`;
};

/**
 * Le message d'une tâche retenue par un blocage du Cloud (pure) — la vraie cause et le seul geste utile. Jamais
 * « ouvre … dans ton navigateur » : c'est le navigateur du Cloud qui est concerné, pas celui du téléphone.
 */
export function messageTacheCloud(plateforme, etat, depuisIso = null) {
  const nom = DEFINITIONS[plateforme]?.nom ?? plateforme;
  const pendant = `Tant que la pause dure, une vente ${nom} n'est pas vue par FillSell et une annonce ${nom} d'un article vendu ailleurs n'est pas retirée : fais-le toi-même sur ${nom}.`;
  if (etat === 'revenue') {
    return `${nom} a redemandé une vérification juste après sa résolution${quandParis(depuisIso)} : FillSell arrête ${nom} sur le Cloud sans insister, et l'équipe FillSell est prévenue. Rien n'a été touché, les autres plateformes continuent. ${pendant}`;
  }
  if (etat === 'restreint') {
    return `${nom} restreint l'accès du navigateur FillSell Cloud${quandParis(depuisIso)}, sans vérification à faire : FillSell a mis ${nom} en pause pour ne pas aggraver le blocage. Rien n'a été touché, les autres plateformes continuent, et rien n'est à faire de ton côté : FillSell refait lui-même un seul essai au bout de 24 h. ${pendant}`;
  }
  return `${nom} demande une vérification anti-robot au navigateur FillSell Cloud${quandParis(depuisIso)} : FillSell a mis ${nom} en pause, rien n'a été touché, les autres plateformes continuent. Ouvre FillSell et appuie sur « Résoudre la vérification » : tu fais glisser la vérification, et ${nom} reprend tout seul. ${pendant}`;
}

/** (02/11) La pause Leboncoin de l'app LEVÉE par une vérification résolue (pure) — comme son essai réussi (blocageLeve,
 *  supabase/functions/_shared/blocage-leboncoin.js) : reprise prudente ensuite, règle de l'app inchangée. */
export function pauseLbcLevee(b, { par, maintenant = new Date().toISOString() }) {
  const essai = b?.essai && typeof b.essai === 'object' ? b.essai : {};
  return { leve_le: maintenant, leve_par: par, essai: { ...essai, issue: 'passe', fin_le: maintenant } };
}
/** La pause Leboncoin de l'app PROLONGÉE de 24 h par un essai refusé (pure) — comme blocageEssaiRefuse. */
export function pauseLbcProlongee({ maintenant = new Date().toISOString() } = {}) {
  return { derniere_preuve: maintenant, essai_apres: new Date(Date.parse(maintenant) + ATTENTE_RESTREINT_MS).toISOString() };
}

export function creerVerifications({ config, base, navigateurs, postes, coffre = null, connexionsOuvertes, journal, alertes = null }) {
  // Le fichier d'origine (01/11, essai de 48 h) : les blocages en cours y sont, il ne change pas de place.
  const dossier = `${config.dossierEtat || '/srv/fillsell-cloud/etat'}/endurance`;
  const fichier = `${dossier}/blocages.json`;
  let blocages = null;          // historique { le, user, plateforme, nature, detail, source, referer?, tache?, debloquee_le?, resolue_le? }
  let charge = null;
  let vus = new Map();
  const ecouteurs = [];
  let sansPlateforme = null;
  let pausesLues = 0, annotees = 0;
  const essais = new Set();

  const court = (u) => String(u).slice(0, 8);
  const dire = async (o) => { for (const f of ecouteurs) { try { await f(o); } catch { /* l'écoute ne bloque rien */ } } };
  const sur = async (nom, f) => { try { return await f(); } catch (e) { journal.alerte(`verification_${nom}_echec`, { erreur: e?.message ?? String(e) }); return null; } };
  const enCours = (user) => (blocages ?? []).filter((b) => b.user === user && !b.debloquee_le);
  const plateformesBloquees = (user) => [...new Set(enCours(user).map((b) => b.plateforme))];
  const blocageDe = (user, p) => enCours(user).filter((b) => b.plateforme === p).at(-1) ?? null;
  const garder = () => writeFile(fichier, `${JSON.stringify(blocages, null, 1)}\n`)
    .catch((e) => journal.erreur('verification_blocages_ecriture', { erreur: e.message }));

  async function lire() {
    if (blocages) return;
    await mkdir(dossier, { recursive: true });
    const l = await readFile(fichier, 'utf8').then(JSON.parse).catch(() => []);
    blocages = Array.isArray(l) ? l : [];
  }

  /** Une entrée gardée telle quelle (l'arrêt total du 01/11 converti par endurance.js), sans geste. */
  async function ajouter(b) {
    await lire();
    if (blocages.some((x) => x.user === b.user && x.plateforme === b.plateforme && x.le === b.le)) return false;
    blocages.push(b);
    await garder();
    return true;
  }

  /** Au démarrage : les plateformes encore en vérification le restent (coffre marqué, verrou fermé à l'ouverture). */
  function charger() {
    charge ??= (async () => {
      await lire();
      for (const b of blocages.filter((x) => !x.debloquee_le)) {
        await postes.bloquerPlateforme(b.user, b.plateforme, { nature: b.nature, detail: b.detail ?? null, le: b.le })
          .catch((e) => journal.alerte('verification_reblocage_echec', { plateforme: b.plateforme, erreur: e.message }));
        await sur('publication', () => publier(b.user, b.plateforme));
      }
    })();
    return charge;
  }

  /** L'état lu par l'app : platform_settings.<plateforme>.cloud_verification (posé, remplacé ou retiré). */
  async function publier(user, plateforme) {
    const e = etatPublie(blocageDe(user, plateforme));
    const r = e
      ? await base.rpc('platform_settings_fusionner', { p_chemin: [plateforme, 'cloud_verification'], p_patch: e,
        p_supprimer: ['essai_apres'].filter((k) => !(k in e)), p_user: user })
      : await base.rpc('platform_settings_fusionner', { p_chemin: [plateforme], p_patch: null, p_supprimer: ['cloud_verification'], p_user: user });
    if (r?.error) throw new Error(r.error.message);
  }

  /** Les tâches de la plateforme qui attendent portent la vraie cause (une fois ; au plus 40 par passage). */
  async function annoterTaches(user, plateforme) {
    const b = blocageDe(user, plateforme);
    if (!b) return 0;
    const etat = etatVisible(b.nature);
    const message = messageTacheCloud(plateforme, etat, b.le);
    const { data, error } = await base.from('cross_post_jobs').select('id, error, platform_fields')
      .eq('user_id', user).eq('platform', plateforme).eq('status', 'pending').limit(40);
    if (error) throw new Error(error.message);
    let n = 0;
    for (const j of data ?? []) {
      if (j.error === message) continue;
      const pf = { ...(j.platform_fields ?? {}), attente_verification_cloud: { etat, depuis: b.le, pose_le: new Date().toISOString(), message } };
      const { error: e2 } = await base.from('cross_post_jobs').update({ error: message, platform_fields: pf }).eq('id', j.id).eq('status', 'pending');
      if (!e2) n++;
    }
    return n;
  }

  /** La plateforme rouverte : le message du Cloud part des tâches qui le portent encore (jamais un autre message). */
  async function libererTaches(user, plateforme) {
    const { data, error } = await base.from('cross_post_jobs').select('id, error, platform_fields')
      .eq('user_id', user).eq('platform', plateforme).eq('status', 'pending').limit(200);
    if (error) throw new Error(error.message);
    let n = 0;
    for (const j of data ?? []) {
      const a = j.platform_fields?.attente_verification_cloud;
      if (!a) continue;
      const { attente_verification_cloud: _a, ...pf } = j.platform_fields;
      const { error: e2 } = await base.from('cross_post_jobs').update({ ...(j.error === a.message ? { error: null } : {}), platform_fields: pf })
        .eq('id', j.id).eq('status', 'pending');
      if (!e2) n++;
    }
    return n;
  }

  /** La pause Leboncoin de l'app, si elle tient encore : levée (accès prouvé) ou prolongée de 24 h (essai refusé). */
  async function pauseLbc(user, geste, par) {
    const { data: pr } = await base.from('profiles').select('platform_settings').eq('id', user).maybeSingle();
    const b = pr?.platform_settings?.leboncoin?.blocage_acces;
    if (!b || typeof b !== 'object' || b.leve_le) return false;
    const patch = geste === 'lever' ? pauseLbcLevee(b, { par }) : pauseLbcProlongee();
    const { error } = await base.rpc('platform_settings_fusionner', { p_chemin: ['leboncoin', 'blocage_acces'], p_patch: patch, p_supprimer: [], p_user: user });
    if (error) throw new Error(error.message);
    journal.info('pause_lbc_app', { user, geste, par });
    return true;
  }

  /**
   * Le blocage d'UNE plateforme : elle seule s'arrête. Revenue dans les REVENUE_MS qui suivent sa résolution : on ne
   * boucle pas (« verification_revenue » : aucun bouton, l'équipe prévenue). Sans plateforme connue : l'arrêt total de
   * l'essai (endurance.js), ou rien que le journal hors essai.
   */
  async function bloquer(user, blocage) {
    await lire();
    if (!blocage?.plateforme) {
      if (sansPlateforme) return sansPlateforme(user, blocage);
      journal.alerte('verification_sans_plateforme', { user, ...blocage });
      return null;
    }
    if (plateformesBloquees(user).includes(blocage.plateforme)) return null;
    const maintenant = Date.now();
    const derniere = blocages.filter((b) => b.user === user && b.plateforme === blocage.plateforme && b.resolue_le).at(-1);
    const revenue = Boolean(derniere) && maintenant - Date.parse(derniere.resolue_le) < REVENUE_MS;
    const b = { le: new Date(maintenant).toISOString(), user, ...blocage,
      ...(revenue ? { nature: 'verification_revenue', nature_vue: blocage.nature, resolue_avant: derniere.resolue_le } : {}) };
    if (etatVisible(b.nature) === 'restreint' && !b.essai_apres) b.essai_apres = new Date(Date.parse(b.le) + ATTENTE_RESTREINT_MS).toISOString();
    blocages.push(b);
    await garder();
    await dire({ evenement: 'PLATEFORME_BLOQUEE', ...b, user: court(user) });
    const fait = await postes.bloquerPlateforme(user, b.plateforme, { nature: b.nature, detail: b.detail ?? null, le: b.le })
      .catch((e) => ({ erreur: e.message }));
    journal.alerte('verification_plateforme_bloquee', { user, plateforme: b.plateforme, nature: b.nature, etat: etatVisible(b.nature), fait });
    await sur('publication', () => publier(user, b.plateforme));
    await sur('annotation', () => annoterTaches(user, b.plateforme));
    if (revenue) {
      await sur('alerte', () => alertes?.signaler('serveur', `${DEFINITIONS[b.plateforme]?.nom ?? b.plateforme} a redemandé la vérification juste après sa résolution (compte ${court(user)}) : arrêtée sur le Cloud, sans nouvel essai. À regarder.`,
        { user, plateforme: b.plateforme, resolue_avant: b.resolue_avant, nature_vue: b.nature_vue ?? null }));
    }
    return b;
  }

  /** Le blocage en cours change de nature (la page rouverte a montré qu'il n'y a rien à glisser, ou une glissière). */
  async function requalifier(user, plateforme, nature, detail = null) {
    const b = blocageDe(user, plateforme);
    if (!b || b.nature === nature) return b;
    b.nature_avant = b.nature;
    b.nature = nature;
    if (detail) b.detail = detail;
    if (etatVisible(nature) === 'restreint') b.essai_apres = new Date(Date.now() + ATTENTE_RESTREINT_MS).toISOString();
    else delete b.essai_apres;
    await garder();
    await dire({ evenement: 'verification_requalifiee', user: court(user), plateforme, nature, avant: b.nature_avant });
    await sur('publication', () => publier(user, plateforme));
    await sur('annotation', () => annoterTaches(user, plateforme));
    return b;
  }

  /** La vérification revenue aussitôt (après la glissière, l'accès reste refusé) : arrêtée, l'équipe prévenue. */
  async function revenue(user, plateforme, detail = null) {
    const b = await requalifier(user, plateforme, 'verification_revenue', detail);
    await sur('alerte', () => alertes?.signaler('serveur', `${DEFINITIONS[plateforme]?.nom ?? plateforme} refuse encore l'accès juste après la vérification glissée par la personne (compte ${court(user)}) : arrêtée sur le Cloud, sans nouvel essai. À regarder.`,
      { user, plateforme, detail }));
    return b;
  }

  /** Une plateforme rouverte (vérification résolue, connexion vérifiée, essai réussi) : tout ce que le blocage retenait repart. */
  async function resolue(user, plateforme, { par = 'connexion', le = new Date().toISOString() } = {}) {
    await lire();
    const ouverts = enCours(user).filter((b) => b.plateforme === plateforme);
    if (!ouverts.length) return false;
    for (const b of ouverts) { b.debloquee_le = le; b.resolue_le = le; b.resolue_par = par; }
    await garder();
    await dire({ evenement: 'plateforme_debloquee', user: court(user), plateforme, debloquee_le: le, par });
    journal.info('verification_resolue', { user, plateforme, par });
    await sur('publication', () => publier(user, plateforme));
    await sur('liberation', () => libererTaches(user, plateforme));
    if (plateforme === 'leboncoin') await sur('pause_lbc', () => pauseLbc(user, 'lever', `cloud (${par})`));
    return true;
  }

  /** La session de la plateforme s'est fermée pendant la résolution : le blocage part, l'app demande la reconnexion. */
  async function sessionFermee(user, plateforme) {
    const ouverts = enCours(user).filter((b) => b.plateforme === plateforme);
    if (!ouverts.length) return false;
    const le = new Date().toISOString();
    for (const b of ouverts) { b.debloquee_le = le; b.debloquee_par = 'session_fermee'; }
    await garder();
    await dire({ evenement: 'plateforme_session_fermee', user: court(user), plateforme });
    await sur('publication', () => publier(user, plateforme));
    return true;
  }

  /**
   * Rouvre la plateforme après une preuve d'accès (page de résolution, essai des 24 h) : la ligne du coffre redevient
   * connectée (la session gardée, vérifiée), le verrou la laisse passer, le blocage est résolu.
   */
  async function rouvrir(user, plateforme, { cookies, preuve, par }) {
    if (coffre) await coffre.sauvegarderCookies(user, cookies, { verifiees: [plateforme], preuves: { [plateforme]: preuve } });
    const h = navigateurs.ouvert(user);
    if (h) await navigateurs.permettre?.(user, [...new Set([...(h.permises ?? []), plateforme])]);
    return resolue(user, plateforme, { par, le: preuve?.le });
  }

  /**
   * L'ESSAI DES 24 H d'un accès restreint : une page de fond sur la plateforme (la seule à la joindre : exception du
   * verrou pour CETTE page), puis UNE lecture d'accès. Passée → rouverte ; une glissière s'affiche → « à résoudre » (la
   * personne peut glisser) ; refusée → 24 h de plus.
   */
  async function essayer(user, b) {
    const h = navigateurs.ouvert(user);
    const cle = `${user}:${b.plateforme}`;
    if (!h || essais.has(cle) || connexionsOuvertes?.().has(user)) return null;
    essais.add(cle);
    let cible = null;
    let issue = 'refuse';
    try {
      ({ targetId: cible } = await h.cdp.send('Target.createTarget', { url: 'about:blank', background: true }));
      const { sessionId } = await h.cdp.send('Target.attachToTarget', { targetId: cible, flatten: true });
      if (!navigateurs.permettreCadre?.(user, cible, b.plateforme)) throw new Error('verrou sans exception par page');
      await h.cdp.send('Page.enable', {}, sessionId);
      await h.cdp.send('Page.navigate', { url: pageDeResolution(b.plateforme, b) }, sessionId);
      let e = null;
      for (let i = 0; i < 15; i++) {
        await new Promise((ok) => setTimeout(ok, 2000));
        e = (await h.cdp.send('Runtime.evaluate', { expression: EXPRESSION_ETAT_PAGE, returnByValue: true }, sessionId).catch(() => null))?.result?.value ?? null;
        if (e?.captcha || e?.bloque || e?.pret) break;
      }
      if (e?.captcha) issue = 'glissiere';
      else if (!e?.bloque) {
        const r = await h.cdp.send('Runtime.evaluate', { expression: expressionAcces(b.plateforme), awaitPromise: true, returnByValue: true }, sessionId).catch(() => null);
        const v = verdictLectureCompte(r?.result?.value);
        if (v.ok) {
          const { cookies } = await h.cdp.send('Storage.getCookies');
          await rouvrir(user, b.plateforme, { cookies, preuve: { le: new Date().toISOString(), http: v.http }, par: 'essai_24h' });
          issue = 'passe';
        } else if (['sans_jeton', 'sans_session', 'anonyme'].includes(v.motif) || v.http === 401) {
          // (02/11) La page répond, mais aucune session : l'accès est rendu, la personne se (re)connecte.
          await sessionFermee(user, b.plateforme);
          issue = 'session_fermee';
        }
      }
    } catch (e) { journal.alerte('verification_essai_echec', { user, plateforme: b.plateforme, erreur: e.message }); issue = 'erreur'; }
    finally {
      if (cible) { navigateurs.retirerCadre?.(user, cible); await h.cdp.send('Target.closeTarget', { targetId: cible }).catch(() => {}); }
      essais.delete(cle);
    }
    journal.info('verification_essai_24h', { user, plateforme: b.plateforme, issue });
    if (issue === 'glissiere') await requalifier(user, b.plateforme, 'glissiere', 'glissière revue à l’essai des 24 h');
    else if (issue === 'refuse' || issue === 'erreur') {
      b.essai_apres = new Date(Date.now() + ATTENTE_RESTREINT_MS).toISOString();
      b.essais = (b.essais ?? 0) + 1;
      await garder();
      await sur('publication', () => publier(user, b.plateforme));
      if (b.plateforme === 'leboncoin' && issue === 'refuse') await sur('pause_lbc', () => pauseLbc(user, 'prolonger', 'cloud (essai refusé)'));
    }
    return issue;
  }

  /** Chaque minute : les cadres DataDome des onglets de travail ; les pauses de l'app ; l'essai des 24 h ; les messages. */
  async function releve() {
    await lire();
    const enConnexion = connexionsOuvertes?.() ?? new Set();
    for (const user of navigateurs.ouverts()) {
      if (enConnexion.has(user)) continue;    // « Me connecter » / « Résoudre » : c'est la personne qui résout, à l'écran
      const h = navigateurs.ouvert(user);
      const r = await h?.cdp?.send('Target.getTargets').catch(() => null);
      if (!r) continue;
      const deja = new Set(plateformesBloquees(user));
      const cibles = (r.targetInfos ?? []).filter((t) => !deja.has(cadreDataDome(t?.url)?.plateforme ?? ''));
      const res = blocageDesCadres(cibles, vus);
      vus = res.vus;
      if (res.blocage) await bloquer(user, { source: 'navigateur', ...res.blocage });
    }
    // (02/11) Leboncoin en pause DANS L'APP (« Accès temporairement restreint ») sur un compte du Cloud : la même pause
    // côté Cloud, en « restreint » (le bon message sur ses tâches, son essai des 24 h suit celui de l'app).
    if (Date.now() - pausesLues >= LECTURE_PAUSES_MS) {
      pausesLues = Date.now();
      for (const user of navigateurs.ouverts()) {
        if (blocageDe(user, 'leboncoin')) continue;
        const pr = await sur('lecture_pause', async () => (await base.from('profiles').select('platform_settings, cloud_voie').eq('id', user).maybeSingle())?.data ?? null);
        if (pr?.cloud_voie !== true || !pausesDeLApp(pr?.platform_settings).length) continue;
        const ba = pr.platform_settings.leboncoin.blocage_acces;
        await bloquer(user, { source: 'pause_app', nature: 'restreint', plateforme: 'leboncoin', detail: `pause Leboncoin de l'app (${ba.signe ?? 'refus'})`,
          ...(Number.isFinite(Date.parse(ba.essai_apres)) ? { essai_apres: new Date(Date.parse(ba.essai_apres)).toISOString() } : {}) });
      }
    }
    for (const b of (blocages ?? []).filter((x) => !x.debloquee_le && etatVisible(x.nature) === 'restreint')) {
      if (Date.parse(b.essai_apres) <= Date.now()) await essayer(b.user, b);
    }
    if (Date.now() - annotees >= ANNOTATION_MS) {
      annotees = Date.now();
      for (const b of (blocages ?? []).filter((x) => !x.debloquee_le)) await sur('annotation', () => annoterTaches(b.user, b.plateforme));
    }
  }

  return {
    charger, releve, bloquer, requalifier, revenue, resolue, sessionFermee, rouvrir, ajouter, plateformesBloquees, blocageDe,
    aTache: (id) => (blocages ?? []).some((b) => b.tache === id),
    ecouter: (f) => { ecouteurs.push(f); },
    surSansPlateforme: (f) => { sansPlateforme = f; },
  };
}
