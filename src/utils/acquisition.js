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
 */
export async function poserSourceSurProfil(supabase, userId, { createdAt = null } = {}) {
  try {
    if (!userId) return;
    const acq = lireSource();
    if (!acq) return;
    const cree = Date.parse(String(createdAt ?? ''));
    if (Number.isFinite(cree)) {
      if (Date.now() - cree > COMPTE_RECENT_MS) return;
      const capte = Date.parse(String(acq.at ?? ''));
      if (Number.isFinite(capte) && capte > cree + MARGE_CAPTURE_MS) return;
    }
    await supabase
      .from('profiles')
      .update({
        acquisition_source: acq.source ?? null,
        acquisition_medium: acq.medium ?? null,
        acquisition_campaign: acq.campaign ?? null,
        acquisition_content: acq.content ?? null,
        acquisition_fbclid: acq.fbclid ?? null,
        acquisition_referrer: acq.referrer ?? null,
        acquisition_captured_at: acq.at ?? new Date().toISOString(),
      })
      .eq('id', userId);
  } catch (e) {
    console.warn('[acquisition] source non enregistrée :', e?.message ?? e);
  }
}
