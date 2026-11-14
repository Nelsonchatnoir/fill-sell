// ============================================================================
// SOURCE D'ACQUISITION — d'où vient un inscrit (13/09/2026)
//
// Constat : aucune colonne utm / source / campaign / referrer n'existait. Une
// campagne Meta partait aveugle.
//
// PRINCIPE : PREMIER CONTACT, JAMAIS LE DERNIER.
// On relève à l'arrivée sur le site, on garde le temps que la personne
// s'inscrive (elle ne s'inscrit pas forcément dans la seconde : elle revient
// le lendemain, en direct), et on écrit sur son profil À LA CRÉATION DU COMPTE.
// Une valeur déjà posée n'est JAMAIS écrasée — ni ici, ni en base (trigger
// profiles_acquisition_immuable).
//
// CE QU'ON NE RELÈVE PAS
// Uniquement des identifiants de campagne, plus le referrer réduit à son
// ORIGINE (schéma + domaine). Jamais l'URL complète : un chemin peut porter
// une donnée personnelle (…/invitation?email=…). Jamais un paramètre d'URL
// autre que ceux listés ci-dessous.
//
// RGPD / CONSENTEMENT : mesure interne first-party. Rien ne part vers un
// tiers, la valeur vit sur le profil de la personne, dans notre base. C'est
// distinct du pixel Meta, qui lui est un traceur publicitaire et reste soumis
// au consentement (cf. src/utils/consentement.js).
// ============================================================================

const CLE = 'fs_acq';

/** Les seuls paramètres d'URL relevés. Rien d'autre n'est lu. */
const PARAMS = {
  utm_source: 'source',
  utm_medium: 'medium',
  utm_campaign: 'campaign',
  utm_content: 'content',
  fbclid: 'fbclid',
};

/** Bornage : une valeur de campagne anormalement longue est tronquée. */
const MAX = 200;
const propre = (v) => (typeof v === 'string' ? v.trim().slice(0, MAX) : null) || null;

/** Referrer réduit à « https://domaine ». null si interne ou absent. */
function referrerExterne() {
  try {
    const ref = document.referrer;
    if (!ref) return null;
    const u = new URL(ref);
    if (u.hostname === window.location.hostname) return null;
    return `${u.protocol}//${u.hostname}`;
  } catch {
    return null;
  }
}

/**
 * Relève la source si aucune n'est encore mémorisée. Idempotent : les appels
 * suivants ne font rien, c'est ce qui garantit le « premier contact ».
 * Ne lève jamais : en mode privé, localStorage peut jeter à la lecture.
 */
export function capterSource({ plateforme = null } = {}) {
  try {
    if (localStorage.getItem(CLE)) return;

    // App NATIVE (Capacitor iOS/Android, 27/09) : le premier contact, c'est le
    // store. Il n'y a ni URL de campagne ni referrer à lire dans une WebView —
    // sans ceci, un inscrit depuis l'App Store tombait en « direct », ce qui
    // ne distingue rien. `app_ios` / `app_android`, medium « store ».
    // (14/11) Android : Google Play peut ensuite préciser la campagne de
    // l'installation, une fois (enrichirSourceAndroid, INACTIF). iPhone : non.
    if (plateforme === 'ios' || plateforme === 'android') {
      localStorage.setItem(CLE, JSON.stringify({
        source: `app_${plateforme}`, medium: 'store', referrer: null, at: new Date().toISOString(),
      }));
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const acq = {};
    let aDesParams = false;
    for (const [param, champ] of Object.entries(PARAMS)) {
      const v = propre(params.get(param));
      if (v) { acq[champ] = v; aDesParams = true; }
    }

    if (!aDesParams) {
      // Pas de campagne : le referrer fait office de source, à défaut « direct ».
      const ref = referrerExterne();
      acq.source = ref ? ref.replace(/^https?:\/\//, '') : 'direct';
      acq.medium = ref ? 'referral' : 'direct';
    }

    acq.referrer = referrerExterne();
    acq.at = new Date().toISOString();

    localStorage.setItem(CLE, JSON.stringify(acq));
  } catch {
    // Mode privé, stockage plein, cookies bloqués : on ne mesure pas, c'est tout.
  }
}

/** La source mémorisée, ou null. Ne lève jamais. */
export function lireSource() {
  try {
    const brut = localStorage.getItem(CLE);
    return brut ? JSON.parse(brut) : null;
  } catch {
    return null;
  }
}

// ── ANDROID : LA SOURCE RETROUVÉE PAR GOOGLE PLAY (14/11/2026, bloc E1) ─────
// La pub Meta envoie l'Android sur Google Play avec ses UTM dans `referrer`
// (site/gabarits/installer.mjs). Google Play les rend à l'app installée par
// l'Install Referrer API — un module NATIF (android/…/InstallReferrerPlugin.java),
// donc un binaire. ⛔ INACTIF : PLAY_REFERRER_BINAIRE_MIN vaut null → rien n'est
// lu, aucun appel natif (pas même App.getInfo). S'ouvre en écrivant ici la
// version du binaire qui porte le module, APRÈS l'avoir lue, et APRÈS la
// migration 20261114100000 (colonne acquisition_plateforme) et la phrase de
// Legal.jsx (verrou : scripts/acquisition-meta-selftest.mjs).
//
// RÈGLE (la première source gagne, ici comme en base) :
//   · on ne touche QUE la source par défaut de l'app (« app_android / store »,
//     posée par capterSource au premier lancement), jamais lue avant : une
//     source relevée ailleurs (site, lien) n'est jamais remplacée. Ce n'est
//     pas un second contact : Google Play décrit l'INSTALLATION elle-même,
//     d'où la date de capture d'origine gardée (garde « capture avant le
//     compte » du serveur inchangée) ;
//   · une seule lecture réussie (Google : « invoke the API only once ») ; un
//     service indisponible se retente au lancement suivant, 3 fois au plus ;
//   · seuls utm_source / utm_medium / utm_campaign / utm_content sortent,
//     nettoyés et bornés comme sur le site ; l'organique (google-play /
//     organic) laisse « app_android / store » ;
//   · la plateforme part à part (plateforme: 'android' → p_plateforme) : avec
//     source = « meta », l'ancienne règle « source app_android = Android » la
//     compterait « web ». referrer = https://play.google.com (vrai : c'est par
//     là qu'elle est arrivée).
// Le natif est passé en argument (src/lib/referrerPlay.js) : ce fichier reste
// sans Capacitor, il est aussi dans le script en ligne du site.
export const PLAY_REFERRER_BINAIRE_MIN = null;
const PLAY_ESSAIS_MAX = 3;
const PLAY_DELAI_MS = 3000;
const PLAY_PARAMS = { utm_source: 'source', utm_medium: 'medium', utm_campaign: 'campaign', utm_content: 'content' };
const PLAY_REFERRER = 'https://play.google.com';

const versionAuMoins = (v, min) => {
  const lireV = (x) => (/^\d+(\.\d+)*$/.test(String(x ?? '').trim()) ? String(x).trim().split('.').map(Number) : null);
  const a = lireV(v), b = lireV(min);
  if (!a || !b) return false;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return true;
};

/** Le binaire de ce téléphone lit-il le referrer Google Play ? (pur) — borne null (aujourd'hui) = non, partout. */
export function referrerPlayOuvert({ plateforme, binaire, min = PLAY_REFERRER_BINAIRE_MIN } = {}) {
  return plateforme === 'android' && Boolean(min) && versionAuMoins(binaire, min);
}

/**
 * Le referrer rendu par Google Play (getInstallReferrer) → { source, medium, campaign, content }, ou null
 * (organique, « (not set) », sans utm_source, illisible). Pur, ne lève jamais.
 */
export function lireReferrerPlay(brut) {
  try {
    let s = typeof brut === 'string' ? brut.trim().slice(0, 2000) : '';
    if (!s) return null;
    if (!s.includes('=') && /%3D/i.test(s)) s = decodeURIComponent(s);
    const q = {};
    for (const paire of s.split('&')) {
      const i = paire.indexOf('=');
      if (i <= 0) continue;
      const champ = PLAY_PARAMS[paire.slice(0, i).trim()];
      if (!champ || champ in q) continue;
      let v;
      try { v = decodeURIComponent(paire.slice(i + 1).replace(/\+/g, ' ')); } catch { v = ''; }
      v = v.replace(/[^A-Za-z0-9 _.-]/g, '').trim().slice(0, 100);
      if (v && v.toLowerCase() !== 'not set') q[champ] = v;
    }
    if (!q.source) return null;
    if (q.source === 'google-play' && (!q.medium || q.medium === 'organic')) return null;
    return { source: q.source, medium: q.medium ?? null, campaign: q.campaign ?? null, content: q.content ?? null };
  } catch {
    return null;
  }
}

const ecrireSource = (v) => { try { localStorage.setItem(CLE, JSON.stringify(v)); } catch { /* stockage indisponible */ } };
const delai = (p, ms) => Promise.race([Promise.resolve(p), new Promise((r) => setTimeout(() => r({ etat: 'reessayer' }), ms))]);
let lecturePlayEnCours = null;

/**
 * Enrichit UNE fois la source par défaut de l'app Android avec la campagne rendue par Google Play.
 * `binaire` : () => version du binaire ; `disponible` : () => module natif présent ; `lire` : () => { etat, referrer }.
 * Rend une promesse ; jamais d'exception. INACTIF tant que PLAY_REFERRER_BINAIRE_MIN est null.
 */
export function enrichirSourceAndroid({ plateforme, binaire, disponible, lire, min = PLAY_REFERRER_BINAIRE_MIN, delaiMs = PLAY_DELAI_MS } = {}) {
  if (plateforme !== 'android' || !min) return Promise.resolve(null);
  if (lecturePlayEnCours) return lecturePlayEnCours;
  const encore = (a) => a && a.source === 'app_android' && a.medium === 'store' && !a.play;
  if (!encore(lireSource())) return Promise.resolve(null);
  const lecture = (async () => {
    const version = await binaire?.();
    if (!referrerPlayOuvert({ plateforme, binaire: version, min }) || disponible?.() !== true) return null;
    let r;
    try { r = await delai(lire(), delaiMs); } catch { r = { etat: 'reessayer' }; }
    const acq = lireSource();
    if (!encore(acq)) return null;
    if (r?.etat === 'ok') {
      const utm = lireReferrerPlay(r.referrer);
      const nouvelle = utm
        ? { ...utm, referrer: PLAY_REFERRER, at: acq.at, plateforme: 'android', play: 'campagne' }
        : { ...acq, play: 'organique' };
      ecrireSource(nouvelle);
      return nouvelle;
    }
    if (r?.etat === 'indisponible') { ecrireSource({ ...acq, play: 'indisponible' }); return null; }
    const essais = (Number(acq.play_essais) || 0) + 1;
    ecrireSource(essais >= PLAY_ESSAIS_MAX ? { ...acq, play: 'echec', play_essais: essais } : { ...acq, play_essais: essais });
    return null;
  })().catch(() => null);
  lecturePlayEnCours = lecture;
  lecture.then(() => { if (lecturePlayEnCours === lecture) lecturePlayEnCours = null; });
  return lecture;
}

/** Un compte plus vieux que ça n'a plus de « premier contact » à mesurer. */
const COMPTE_RECENT_MS = 30 * 24 * 3600 * 1000;
/** Marge entre la capture et la création du compte (horloges, confirmation). */
const MARGE_CAPTURE_MS = 6 * 3600 * 1000;

/**
 * Écrit la source d'origine sur le profil qui vient d'être créé.
 *
 * ⚠️ NE DOIT JAMAIS FAIRE ÉCHOUER L'INSCRIPTION. Appelée après un signUp
 * réussi, sans await bloquant, et toute erreur est avalée : un compte créé
 * sans source mesurée reste un compte créé.
 *
 * ⛔ CE QUI A ÉTÉ MESURÉ LE 27/09 : ZÉRO profil avec une source depuis la
 * pose du 13/09. Deux causes, toutes deux structurelles :
 *   · l'inscription par e-mail exige une confirmation (153 comptes sur 154
 *     ont reçu le mail) : au retour de signUp il n'y a AUCUNE session, donc
 *     l'UPDATE partait anonyme et la policy RLS « update own profile » le
 *     filtrait EN SILENCE (0 ligne, pas d'erreur) ;
 *   · Google et Apple (285 des 439 inscrits depuis le 13/09) ne passent jamais
 *     par signUp — la fonction n'était pas appelée.
 * Elle est donc désormais appelée AUSSI à la première session (App.jsx,
 * onAuthStateChange), avec `createdAt` : la capture doit dater d'AVANT le
 * compte (à la marge près) — sinon ce n'est pas un premier contact, c'est une
 * visite ultérieure sur le site, et on n'écrit rien. Un compte de plus de
 * 30 jours n'écrit jamais.
 *
 * L'écrasement est impossible même si cette fonction était rappelée : le
 * trigger profiles_acquisition_immuable verrouille les colonnes dès la
 * première pose.
 *
 * ⛔ (25/10) TOUJOURS ZÉRO : 0 profil sur 3 229, 0 sur les 570 inscrits des
 * 30 derniers jours. Troisième cause, celle-là à chaque session : depuis le
 * 06/07 (migration 20260706400000), `authenticated` n'a le droit d'UPDATE que
 * sur 13 colonnes de profiles, et acquisition_* n'en est pas. L'UPDATE direct
 * recevait 42501 → HTTP 403 de PostgREST, rendu dans `error` sans être levé,
 * donc jamais vu. L'origine se pose désormais par la RPC SECURITY DEFINER
 * `poser_origine_inscription` (migration 20261025013000), qui refait côté
 * serveur les mêmes gardes (compte < 30 j, capture antérieure au compte,
 * une seule pose) et garde l'origine à la suppression du compte
 * (origines_comptes_supprimes, anonyme).
 */
export async function poserSourceSurProfil(supabase, userId, { createdAt = null } = {}) {
  try {
    if (!userId) return;
    // (14/11) Une lecture Google Play en cours (bornée par son délai) passe d'abord : un compte créé dans la foulée
    // de l'installation part avec la campagne, pas avec « app_android ». Aucune aujourd'hui (INACTIF).
    if (lecturePlayEnCours) await lecturePlayEnCours;
    const acq = lireSource();
    if (!acq) return;
    const cree = Date.parse(String(createdAt ?? ''));
    if (Number.isFinite(cree)) {
      if (Date.now() - cree > COMPTE_RECENT_MS) return;
      const capte = Date.parse(String(acq.at ?? ''));
      if (Number.isFinite(capte) && capte > cree + MARGE_CAPTURE_MS) return;
    }
    const args = {
      p_source: acq.source ?? null,
      p_medium: acq.medium ?? null,
      p_campaign: acq.campaign ?? null,
      p_content: acq.content ?? null,
      p_fbclid: acq.fbclid ?? null,
      p_referrer: acq.referrer ?? null,
      p_captee_le: acq.at ?? null,
    };
    // (14/11) p_plateforme sur le SEUL chemin Google Play (acq.plateforme posée par enrichirSourceAndroid) : le web
    // et l'iPhone gardent l'appel d'aujourd'hui, à 7 paramètres. Base sans la migration 20261114100000 → PostgREST
    // ne trouve pas la fonction (PGRST202) → rejoué UNE fois sans : la source arrive quand même.
    const avecPlateforme = ['ios', 'android', 'web'].includes(acq.plateforme);
    let { error } = await supabase.rpc('poser_origine_inscription', avecPlateforme ? { ...args, p_plateforme: acq.plateforme } : args);
    if (error && avecPlateforme && error.code === 'PGRST202') ({ error } = await supabase.rpc('poser_origine_inscription', args));
    if (error) console.warn('[acquisition] source non enregistrée :', error.message ?? error.code ?? error);
  } catch (e) {
    console.warn('[acquisition] source non enregistrée :', e?.message ?? e);
  }
}
