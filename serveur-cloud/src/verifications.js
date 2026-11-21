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
// (02/11 soir, fausse alerte de 16:55 : Leboncoin « Résoudre la vérification », rien à glisser à 16:59) Une glissière vue
// dans un ONGLET DE TRAVAIL vise souvent une seule requête (le 02/11 : l'API du compte 200, puis 403 + défi 6 s plus tard ;
// la page suivante passe sans rien). La plateforme est fermée aussitôt (plus aucune requête), mais la personne n'est
// appelée que si la vérification TIENT : au bout de CONFIRMATION_MS, UNE page de fond + UNE lecture d'accès (le mécanisme de
// l'essai des 24 h). Passée → rouverte sans rien dire ; glissière revue (ou essai impossible) → « Résoudre ».
export const CONFIRMATION_MS = 3 * 60_000;
// Au-delà, l'essai n'a pas pu se faire (navigateur fermé, « Me connecter » ouvert…) : la personne est appelée.
export const CONFIRMATION_MAX_MS = 15 * 60_000;
/** Une glissière à confirmer avant d'appeler la personne (pure) : vue dans un onglet de travail, pas revenue. */
export const aConfirmer = (blocage) => blocage?.source === 'navigateur' && blocage?.nature === 'glissiere';
/** La confirmation est-elle en cours (pure) ? */
export const enConfirmation = (b) => Boolean(b?.confirmation) && !b.confirmation.fin_le;
// (21/11/2026 midi, point 3 de Nico — Muriel 0c97dc8b, Beebs) LES RÉSOLUTIONS QUI NE SONT PAS CELLES DE LA PERSONNE : la
// confirmation silencieuse (02/11 soir), la vérification de l'appareil passée TOUTE SEULE (« verification_passee_seule » ;
// le 21/11 à 11:05 elle passait d'elle-même pendant que Muriel ouvrait « Résoudre », et la glissière de 11:19 a été prise
// pour « redemandée juste après sa résolution » : Beebs arrêté pour elle), et « Résoudre » conclu sans qu'aucune glissière
// n'ait été vue dans la page. Après elles, la glissière suivante reste un PREMIER captcha (confirmation, puis « Résoudre »),
// jamais « revenue ».
export const RESOLUTIONS_SANS_LA_PERSONNE = Object.freeze(['confirmation', 'verification_passee_seule', 'resoudre_sans_glissiere']);
/** La glissière qui suit cette résolution est-elle « revenue » (arrêt) ? (pure) Seulement après une résolution de la personne. */
export const revenueApres = (resolue) => Boolean(resolue?.resolue_le) && !RESOLUTIONS_SANS_LA_PERSONNE.includes(String(resolue.resolue_par ?? ''));
/** La glissière qui suit doit-elle être confirmée (page de fond) avant d'appeler la personne ? (pure) Comme un premier captcha,
 *  sauf juste après une confirmation silencieuse (02/11 soir : pas de seconde confirmation, droit à « Résoudre »). */
export const confirmerApres = (resolue, recente) => !recente || ['verification_passee_seule', 'resoudre_sans_glissiere'].includes(String(resolue?.resolue_par ?? ''));
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

/**
 * (21/11/2026 midi, point 3 de Nico) Les blocages « verification_revenue » EN COURS dont la résolution d'avant n'était pas
 * celle de la personne (RESOLUTIONS_SANS_LA_PERSONNE) redeviennent leur nature vue (glissière…), avec une confirmation qui part
 * de maintenant (pure, modifie la liste ; rend le nombre de blocages requalifiés).
 */
export function requalifierRevenuesSansLaPersonne(blocages, maintenant = Date.now()) {
  let n = 0;
  for (const b of (blocages ?? []).filter((x) => x && !x.debloquee_le && x.nature === 'verification_revenue' && x.resolue_avant)) {
    const avant = blocages.find((x) => x !== b && x.user === b.user && x.plateforme === b.plateforme && x.resolue_le === b.resolue_avant);
    if (!avant || revenueApres(avant)) continue;
    const le = new Date(maintenant).toISOString();
    b.requalifiee = { le, de: 'verification_revenue', resolution_avant: avant.resolue_par ?? null };
    b.nature = b.nature_vue ?? 'glissiere';
    delete b.resolue_avant;
    if (aConfirmer(b)) b.confirmation = { depuis: le, apres: new Date(maintenant + CONFIRMATION_MS).toISOString() };
    n += 1;
  }
  return n;
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

/** La valeur de platform_settings.<plateforme>.cloud_verification pour un blocage (pure), ou null (aucun). (02/11 soir)
 *  Pendant la confirmation : « verification_en_cours » (rien à faire, aucun bouton). */
export function etatPublie(blocage) {
  if (!blocage) return null;
  if (enConfirmation(blocage)) return { etat: 'verification_en_cours', depuis: blocage.le };
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

export function creerVerifications({ config, base, navigateurs, postes, coffre = null, connexionsOuvertes, journal, alertes = null, pausesMessagerie = null, relanceTaches = null, lecture = null }) {
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
      // (21/11/2026 midi, point 3 de Nico) Une « revenue » posée APRÈS une résolution qui n'était pas celle de la personne
      // (vérification passée seule…) redevient ce qu'elle était : un premier captcha — sa confirmation (page de fond, une
      // lecture) part comme pour toute glissière neuve, puis « Résoudre » si elle tient. Pour tous les comptes.
      if (requalifierRevenuesSansLaPersonne(blocages)) await garder();
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
    if (!b || enConfirmation(b)) return 0;   // (02/11 soir) pas encore confirmée : aucun message, rien à faire
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
    const recente = Boolean(derniere) && maintenant - Date.parse(derniere.resolue_le) < REVENUE_MS;
    // (02/11 soir) « Revenue » ne suit qu'une résolution de la PERSONNE ; après une rouverture silencieuse (confirmation
    // passée), une glissière qui revient dans les 30 min va droit à « Résoudre » (pas de seconde confirmation, pas d'arrêt).
    // (21/11/2026 midi, point 3 de Nico) Une vérification passée toute seule n'est pas une résolution de la personne : la
    // glissière suivante est un premier captcha (RESOLUTIONS_SANS_LA_PERSONNE).
    const revenue = recente && revenueApres(derniere);
    const confirmer = aConfirmer(blocage) && confirmerApres(derniere, recente);
    const b = { le: new Date(maintenant).toISOString(), user, ...blocage,
      ...(revenue ? { nature: 'verification_revenue', nature_vue: blocage.nature, resolue_avant: derniere.resolue_le } : {}),
      ...(confirmer ? { confirmation: { apres: new Date(maintenant + CONFIRMATION_MS).toISOString() } } : {}) };
    if (etatVisible(b.nature) === 'restreint' && !b.essai_apres) b.essai_apres = new Date(Date.parse(b.le) + ATTENTE_RESTREINT_MS).toISOString();
    blocages.push(b);
    await garder();
    await dire({ evenement: 'PLATEFORME_BLOQUEE', ...b, user: court(user) });
    const fait = await postes.bloquerPlateforme(user, b.plateforme, { nature: b.nature, detail: b.detail ?? null, le: b.le })
      .catch((e) => ({ erreur: e.message }));
    journal.alerte('verification_plateforme_bloquee', { user, plateforme: b.plateforme, nature: b.nature, etat: etatVisible(b.nature), fait });
    await sur('publication', () => publier(user, b.plateforme));
    await sur('annotation', () => annoterTaches(user, b.plateforme));
    if (etatVisible(b.nature) === 'restreint') await sur('refus_ip', () => noterRefusIp(user, b));
    if (revenue) {
      await sur('alerte', () => alertes?.signaler('serveur', `${DEFINITIONS[b.plateforme]?.nom ?? b.plateforme} a redemandé la vérification juste après sa résolution (compte ${court(user)}) : arrêtée sur le Cloud, sans nouvel essai. À regarder.`,
        { user, plateforme: b.plateforme, resolue_avant: b.resolue_avant, nature_vue: b.nature_vue ?? null },
        // (14/11, complément 3 point 2 de Nico) Un client du Cloud (payant ou en essai) ne peut plus publier sur cette
        // plateforme : un mail, un seul tant que ce n'est pas résolu (_shared/alertes-nico.js).
        { alerte: 'orchestrateur.plateforme_arretee', cle: `${user}|${b.plateforme}` }));
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
    if (etatVisible(nature) === 'restreint' && etatVisible(b.nature_avant) !== 'restreint') await sur('refus_ip', () => noterRefusIp(user, b));
    return b;
  }

  /**
   * (03/11, point 2 de Nico) UN REFUS SUR L'IP DU COMPTE, pour CETTE plateforme seulement — un accès restreint (blocage
   * dur), jamais une glissière. « Non prouvé » : l'IP n'est pas jetée ; quand elle reviendra au pool, une visite de
   * contrôle (entretien) dira si la plateforme la refuse vraiment. Jamais de visite sur l'IP tant que le compte la tient.
   */
  async function noterRefusIp(user, b) {
    const { data, error } = await base.rpc('cloud_ip_refus_noter_compte', { p_user: user, p_plateforme: b.plateforme,
      p_cause: b.nature, p_details: { source: b.source ?? null, detail: b.detail ?? null, le: b.le ?? null } });
    if (error) throw new Error(error.message);
    journal.info('refus_ip_note', { user, plateforme: b.plateforme, nature: b.nature, ok: data?.ok === true, raison: data?.raison ?? null });
    // (19/11/2026 soir, décision de Nico) ALERTE IMMÉDIATE AU PREMIER BLOCAGE de plateforme lié à une IP : un mail, une fois par
    // IP et par plateforme tant que ce n'est pas résolu (clé `ip:<id>|<plateforme>`, _shared/alertes-nico.js) — avant, rien
    // tant que la vérification n'était pas « revenue ». Jamais de visite sur l'IP du client pour autant.
    if (data?.ok === true && data?.ip_id != null) {
      const nom = DEFINITIONS[b.plateforme]?.nom ?? b.plateforme;
      await sur('alerte_premier_blocage', () => alertes?.signaler('serveur', `IP ${data.ip_id} : ${nom} refuse l'accès au compte ${court(user)} (${b.nature}) — premier blocage sur cette IP. `
        + 'Noté comme refus NON prouvé : l\'IP n\'est pas jetée, aucune visite sur l\'IP du client ; à son retour au pool, le contrôle dira si la plateforme la refuse vraiment.',
      { user, ip_id: data.ip_id, plateforme: b.plateforme, nature: b.nature, source: b.source ?? null },
      { alerte: 'orchestrateur.plateforme_arretee', cle: `ip:${data.ip_id}|${b.plateforme}` }));
    }
    return data;
  }

  /** La vérification revenue aussitôt (après la glissière, l'accès reste refusé) : arrêtée, l'équipe prévenue. */
  async function revenue(user, plateforme, detail = null) {
    const b = await requalifier(user, plateforme, 'verification_revenue', detail);
    await sur('alerte', () => alertes?.signaler('serveur', `${DEFINITIONS[plateforme]?.nom ?? plateforme} refuse encore l'accès juste après la vérification glissée par la personne (compte ${court(user)}) : arrêtée sur le Cloud, sans nouvel essai. À regarder.`,
      { user, plateforme, detail }, { alerte: 'orchestrateur.plateforme_arretee', cle: `${user}|${plateforme}` }));
    return b;
  }

  /**
   * Une plateforme rouverte (vérification résolue, connexion vérifiée, essai réussi, vérification de l'appareil passée
   * seule) : tout ce que le blocage retenait repart. (05/11 soir, point 9) Même SANS blocage ouvert sur le Cloud, une
   * preuve d'accès lève les pauses de la plateforme et relance ses tâches : le 05/11, le 403 Beebs de 02:48:44 avait mis
   * la messagerie en pause 6 h sans aucun blocage du Cloud, et la vérification passée seule à 02:48:48 ne la levait pas.
   */
  async function resolue(user, plateforme, { par = 'connexion', le = new Date().toISOString() } = {}) {
    await lire();
    const ouverts = enCours(user).filter((b) => b.plateforme === plateforme);
    if (ouverts.length) {
      for (const b of ouverts) { b.debloquee_le = le; b.resolue_le = le; b.resolue_par = par; }
      await garder();
      await dire({ evenement: 'plateforme_debloquee', user: court(user), plateforme, debloquee_le: le, par });
      journal.info('verification_resolue', { user, plateforme, par });
      await sur('publication', () => publier(user, plateforme));
      await sur('liberation', () => libererTaches(user, plateforme));
    }
    if (plateforme === 'leboncoin') await sur('pause_lbc', () => pauseLbc(user, 'lever', `cloud (${par})`));
    // (04/11 soir, règle de Nico) Une résolution réussie lève aussi la pause de sa messagerie et la coupure de sa veille
    // des commandes (base et extension) : sinon la plateforme rouverte resterait muette jusqu'à 24 h.
    if (pausesMessagerie) await sur('pauses_messagerie', () => pausesMessagerie.lever(user, [plateforme], { raison: `resolution (${par})` }));
    // (05/11 soir, point 9) Les tâches que l'anti-robot avait espacées repartent TOUT DE SUITE (relanceTaches.js).
    if (relanceTaches) await sur('relance_taches', () => relanceTaches.relancer(user, plateforme, { par }));
    return ouverts.length > 0;
  }

  /**
   * (05/11 soir, point 9 — règle de Nico) UNE VÉRIFICATION DE L'APPAREIL PASSÉE SEULE (DataDome a répondu « redirect » à
   * son /interstitial/, lu par le veilleur réseau des onglets de travail) vaut preuve d'accès : la plateforme est traitée
   * comme rouverte — pauses levées, tâches relancées. Une glissière (« captcha ») n'est jamais une preuve.
   */
  async function verificationPassee(user, plateforme, { le = new Date().toISOString() } = {}) {
    if (!user || !plateforme) return false;
    journal.info('verification_passee_seule', { user, plateforme, le });
    await resolue(user, plateforme, { par: 'verification_passee_seule', le });
    // (21/11/2026 midi, point 2 de Nico — fausse alerte de c7c382b7 le 17/11 15:35) La vérification passée seule rouvrait la
    // plateforme SANS rendre sa ligne du coffre « connectée » (le blocage l'avait passée « en vérification ») : l'app disait
    // « à reconnecter » ; ouverte, la connexion se vérifiait en 3 s. Désormais, si le coffre ne la dit pas connectée, la
    // session est lue sur la plateforme (lectureSession.js) : lue → le coffre redevient connecté et le relais la laisse
    // passer ; sinon rien ne change (jamais « connecté » sur la seule vérification de l'appareil).
    await sur('rouverture_session', () => rouvrirSiLue(user, plateforme, 'verification_passee_seule'));
    return true;
  }

  /** (21/11/2026 midi, point 2) La ligne du coffre « en vérification » (connecte faux, `bloquee`) d'une plateforme SANS blocage
   *  en cours : la session lue sur la plateforme → le coffre redevient connecté et le relais la laisse passer. Rend vrai si
   *  la plateforme est rouverte. Jamais sur une ligne « à reconnecter » d'une session fermée (pas `bloquee`), ni illisible. */
  async function rouvrirSiLue(user, plateforme, raison, lu = null) {
    if (!lecture || !coffre || plateformesBloquees(user).includes(plateforme)) return false;
    const c = lu ?? await coffre.lire(user).catch(() => null);
    const s = c?.[plateforme];
    if (!s || s.connecte === true || s.illisible || !s.bloquee) return false;
    const r = await lecture.lire(user, plateforme, { raison });
    if (r?.issue !== 'ok') return false;
    const h = navigateurs.ouvert(user);
    const cookies = h ? (await h.cdp.send('Storage.getCookies').catch(() => null))?.cookies : null;
    if (!cookies) return false;
    await coffre.sauvegarderCookies(user, cookies, { verifiees: [plateforme], preuves: { [plateforme]: { le: new Date().toISOString(), http: r.http, par: 'page_de_fond' } } });
    await navigateurs.permettre?.(user, [...new Set([...(h.permises ?? []), plateforme])]);
    journal.info('session_rouverte_apres_lecture', { user, plateforme, raison });
    await sur('publication', () => publier(user, plateforme));
    if (relanceTaches) await sur('relance_taches', () => relanceTaches.relancer(user, plateforme, { par: raison }));
    return true;
  }

  // Une ligne relue sans succès (session perdue ou sans conclusion) n'est relue qu'au bout de 6 h : jamais une page de plus
  // sur la plateforme toutes les 10 min.
  const orphelinesLues = new Map();
  async function rouvrirOrphelines(user) {
    if (!lecture || !coffre) return 0;
    const lu = await coffre.lire(user).catch(() => null);
    if (!lu) return 0;
    let n = 0;
    for (const p of ['vinted', 'leboncoin', 'beebs', 'depop']) {
      const s = lu[p];
      if (!s || s.connecte === true || !s.bloquee || plateformesBloquees(user).includes(p)) continue;
      const cle = `${user}:${p}`;
      const d = orphelinesLues.get(cle);
      if (d && Date.now() < d.reprendre) continue;
      if (await rouvrirSiLue(user, p, 'coffre_en_verification_sans_blocage', lu)) { n += 1; orphelinesLues.delete(cle); }
      else orphelinesLues.set(cle, { reprendre: Date.now() + 6 * 3600_000 });
    }
    return n;
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
   * (02/11 soir) LA CONFIRMATION d'une glissière vue dans un onglet de travail (CONFIRMATION_MS après) : l'essai (une page
   * de fond, UNE lecture d'accès). Passée → rouverte sans appeler personne (journal « verification_passagere ») ; une
   * glissière revue, un refus ou un essai impossible au-delà de CONFIRMATION_MAX_MS → « Résoudre » (publié, tâches
   * annotées) ; la session fermée → la personne se reconnecte.
   */
  async function confirmer(user, b) {
    // (21/11/2026) Une confirmation posée plus tard que le blocage (revenue requalifiée) compte son délai depuis SA pose.
    const depuis = Date.parse(b.confirmation?.depuis ?? b.le);
    const issue = Date.now() - depuis > CONFIRMATION_MAX_MS ? 'impossible' : await essayer(user, b, 'confirmation');
    if (issue === null) return null;    // à refaire au relevé suivant (essai déjà en cours, « Me connecter » ouvert…)
    if (issue === 'passe' || issue === 'session_fermee') {
      b.confirmation = { ...b.confirmation, fin_le: new Date().toISOString(), issue };
      await garder();
      if (issue === 'passe') journal.info('verification_passagere', { user, plateforme: b.plateforme, depuis: b.le });
      return issue;
    }
    b.confirmation = { ...b.confirmation, fin_le: new Date().toISOString(), issue };
    await garder();
    journal.alerte('verification_confirmee', { user, plateforme: b.plateforme, issue });
    await sur('publication', () => publier(user, b.plateforme));
    await sur('annotation', () => annoterTaches(user, b.plateforme));
    return issue;
  }

  /**
   * L'ESSAI DES 24 H d'un accès restreint : une page de fond sur la plateforme (la seule à la joindre : exception du
   * verrou pour CETTE page), puis UNE lecture d'accès. Passée → rouverte ; une glissière s'affiche → « à résoudre » (la
   * personne peut glisser) ; refusée → 24 h de plus. (02/11 soir) Le même essai sert à la CONFIRMATION d'une glissière
   * (mode « confirmation ») : la suite est alors décidée par confirmer().
   */
  async function essayer(user, b, mode = 'essai_24h') {
    const h = navigateurs.ouvert(user);
    const cle = `${user}:${b.plateforme}`;
    if (!h || essais.has(cle) || connexionsOuvertes?.().has(user)) return null;
    essais.add(cle);
    let cible = null;
    let issue = 'refuse';
    let rendreRelais = null;
    try {
      ({ targetId: cible } = await h.cdp.send('Target.createTarget', { url: 'about:blank', background: true }));
      const { sessionId } = await h.cdp.send('Target.attachToTarget', { targetId: cible, flatten: true });
      // (20/11, point 5 de Nico — compte 2f8b09d2) Le moteur CHROME n'a pas d'exception par page (permettreCadre = steel
      // seul) : chaque essai finissait « verrou sans exception par page » AVANT de regarder la page → « erreur » → l'accès
      // restait fermé pour toujours (Beebs du compte 2f8b09d2 depuis le 18/11 19:47, essai raté à 19:50). Pour Chrome,
      // l'exception est le relais : la plateforme permise le temps de l'essai, puis la liste d'avant rendue (sauf si l'essai
      // a rouvert la plateforme).
      if (!navigateurs.permettreCadre?.(user, cible, b.plateforme)) {
        if (h.moteur === 'chrome' && typeof navigateurs.permettre === 'function') {
          rendreRelais = (h.permises ?? []).filter((p) => p !== b.plateforme);
          await navigateurs.permettre(user, [...rendreRelais, b.plateforme]);
        } else throw new Error('verrou sans exception par page');
      }
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
          await rouvrir(user, b.plateforme, { cookies, preuve: { le: new Date().toISOString(), http: v.http }, par: mode });
          issue = 'passe';
        } else if (['sans_jeton', 'sans_session', 'anonyme'].includes(v.motif) || v.http === 401) {
          // (02/11) La page répond, mais aucune session : l'accès est rendu, la personne se (re)connecte.
          // (21/11/2026 midi, point 2 de Nico) Jamais sur une seule lecture faite au chargement (le jeton de Leboncoin arrive
          // une seconde après) : la session est relue sur la plateforme (lectureSession.js) — dite fermée seulement si la
          // plateforme le dit ; lue → l'accès est rendu ; sans conclusion → l'essai compte comme refusé, rien n'est dit.
          const r = lecture ? await lecture.lire(user, b.plateforme, { raison: `essai_${mode}`, forcer: true }).catch(() => null) : { issue: 'perdue' };
          if (r?.issue === 'ok') {
            const { cookies } = await h.cdp.send('Storage.getCookies');
            await rouvrir(user, b.plateforme, { cookies, preuve: { le: new Date().toISOString(), http: r.http, par: 'page_de_fond' }, par: mode });
            issue = 'passe';
          } else if (r?.issue === 'perdue') {
            await sessionFermee(user, b.plateforme);
            issue = 'session_fermee';
          }
        }
      }
    } catch (e) { journal.alerte('verification_essai_echec', { user, plateforme: b.plateforme, erreur: e.message }); issue = 'erreur'; }
    finally {
      if (cible) { navigateurs.retirerCadre?.(user, cible); await h.cdp.send('Target.closeTarget', { targetId: cible }).catch(() => {}); }
      if (rendreRelais && issue !== 'passe') {
        await navigateurs.permettre(user, rendreRelais).catch((e) => journal.alerte('verification_relais_non_rendu', { user, plateforme: b.plateforme, erreur: e.message }));
      }
      essais.delete(cle);
    }
    journal.info(mode === 'confirmation' ? 'verification_confirmation' : 'verification_essai_24h', { user, plateforme: b.plateforme, issue });
    if (mode === 'confirmation') return issue;
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
    // (02/11 soir) Les glissières à confirmer, une fois leur délai passé.
    for (const b of (blocages ?? []).filter((x) => !x.debloquee_le && enConfirmation(x))) {
      if (Date.parse(b.confirmation.apres) <= Date.now()) await confirmer(b.user, b);
    }
    if (Date.now() - annotees >= ANNOTATION_MS) {
      annotees = Date.now();
      for (const b of (blocages ?? []).filter((x) => !x.debloquee_le)) await sur('annotation', () => annoterTaches(b.user, b.plateforme));
      // (21/11/2026 midi, point 2 de Nico) Une ligne du coffre restée « en vérification » SANS blocage en cours (vérification
      // passée seule, session dite fermée trop tôt — f0acd3af Leboncoin le 21/11 à 10:31) : l'app dit « à reconnecter ». La
      // session est relue sur la plateforme ; lue → connectée de nouveau. Au plus une lecture par compte et plateforme / 2 min.
      for (const user of navigateurs.ouverts()) {
        if (enConnexion.has(user)) continue;
        await sur('rouverture_orpheline', () => rouvrirOrphelines(user));
      }
    }
  }

  return {
    charger, releve, bloquer, requalifier, revenue, resolue, verificationPassee, sessionFermee, rouvrir, ajouter, plateformesBloquees, blocageDe,
    aTache: (id) => (blocages ?? []).some((b) => b.tache === id),
    ecouter: (f) => { ecouteurs.push(f); },
    surSansPlateforme: (f) => { sansPlateforme = f; },
  };
}
