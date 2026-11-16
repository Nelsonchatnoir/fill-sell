// ═══════════════════════════════════════════════════════════════════════════
// LA VALIDATION BANCAIRE PENDANT LA FEUILLE DE LA BOUTIQUE — « ON ATTEND TA BANQUE », PUIS LA VEILLE D'ACHAT (16/11/2026,
// ordre de Nico) — pur
// ═══════════════════════════════════════════════════════════════════════════
// Constat (16/11 18:19, iPhone, compte 08918381) : Apple demande une validation bancaire (3-D Secure) ; la personne part
// dans l'appli de sa banque, FillSell passe en arrière-plan ; à son retour la feuille d'Apple a disparu, le module rend
// « User cancelled » (formule_cloud_issue : duree_feuille_ms 35 605) et l'app affichait « Ton essai Premium + Cloud n'a pas
// démarré ». Or la transaction peut encore arriver : Apple la livre plus tard (Transaction.updates → transactionUpdated ;
// le serveur l'active par la notification SUBSCRIBED d'apple-iap-webhook) ; Google Play rend « Purchase is pending » puis
// l'achat passe ACHETÉ (RTDN), sans que personne ne l'acquitte.
// La règle :
//   · une feuille fermée APRÈS un passage en arrière-plan, ou un achat « en attente » (Ask to Buy, Google PENDING) =
//     issue `attente` (raison `validation_banque` / `boutique_en_attente`), la phrase « On attend la validation de ta
//     banque… Dès qu'Apple confirme, ton essai … démarre tout seul : tu n'as rien à refaire. », et UNE VEILLE notée sur
//     l'appareil (compte, produit, formule, canal, depuis) — jamais « n'a pas démarré » à ce moment-là ;
//   · la veille est vérifiée à l'ouverture de l'app, à CHAQUE retour au premier plan (une lecture, puis au plus UNE
//     relecture différée), et à chaque transaction d'abonnement FillSell livrée par Apple (au plus 3 relectures datées) —
//     jamais une boucle (règle : src/utils/relectureBornee.js) ;
//   · vérifier = (a) l'état du SERVEUR (la lecture d'attendreServeur : palier + cloud_etat_moi) ; (c) Android : un achat
//     ACHETÉ du produit chez Google Play → validate-google-purchase (idempotent, une fois par veille), puis l'acquittement
//     (sans lui, Google rembourse et coupe l'abonnement au bout de 3 jours) ; iPhone : aucune fonction ne valide un
//     jwsRepresentation d'abonnement (validate-apple-receipt ne lit que le reçu) — on attend le serveur ;
//   · actif → « Ton essai … a démarré », veille effacée ; 24 h sans confirmation → la veille s'éteint, le bandeau
//     « Reprendre ton essai » revient avec la phrase vraie « Ta banque n'a pas confirmé : rien n'a été prélevé. » ;
//   · chaque fin laisse sa trace : usage_logs `veille_achat_fin` (actif / expiree).
// Verrou : scripts/achat-attente-banque-selftest.mjs (npm run selftest:achat-attente-banque).
import { FORMULES_CLOUD, FORMULES_AVEC_ESSAI, PALIER_DE_FORMULE } from '../../supabase/functions/_shared/formules-cloud.js';
import { NOMS_FORMULES } from './textesFormules';
import { noterEssaiAReprendre, effacerEssaiAReprendre, DELAI_AVANT_BANDEAU_MS } from './repriseEssai';

export const CLE_VEILLE_ACHAT = 'fs_veille_achat_boutique';
export const DUREE_VEILLE_MS = 24 * 3600_000;
/** Après un retour au premier plan : une lecture tout de suite, puis au plus UNE relecture, à ce délai. */
export const DELAI_RELECTURE_RETOUR_MS = 10_000;
/** Après une transaction livrée par Apple (le serveur l'apprend par sa notification) : au plus ces relectures. */
export const RELECTURES_APRES_TRANSACTION_MS = Object.freeze([5_000, 15_000, 45_000]);
/** Prévient les écrans (bandeau « Reprendre ton essai ») qu'une veille a changé. */
export const EVENEMENT_VEILLE = 'fs:veille-achat';
const FORMULES_VEILLEES = new Set([...FORMULES_CLOUD, 'cloud']);

const stockageParDefaut = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };
const signaler = () => {
  try { if (typeof globalThis.dispatchEvent === 'function' && typeof globalThis.CustomEvent === 'function') globalThis.dispatchEvent(new globalThis.CustomEvent(EVENEMENT_VEILLE)); } catch { /* aucun écran à prévenir */ }
};
const nomDe = (formule) => (formule === 'cloud' ? 'FillSell Cloud' : (NOMS_FORMULES[formule] ?? ''));
const nomBoutiqueDe = (canal) => (canal === 'google' ? 'Google Play' : 'Apple');

/**
 * L'issue d'une feuille de la boutique revenue SANS achat (pur). `quitteApp` : l'app est passée en arrière-plan pendant
 * la feuille (l'appli de la banque). null = pas une feuille revenue sans achat (achat rendu, ou erreur).
 */
export function issueFeuilleBoutique({ cancelled = false, enAttente = false, quitteApp = false } = {}) {
  if (enAttente === true) return { etat: 'attente', raison: 'boutique_en_attente' };
  if (cancelled === true && quitteApp === true) return { etat: 'attente', raison: 'validation_banque' };
  if (cancelled === true) return { etat: 'annule', raison: 'boutique_annulee' };
  return null;
}

/** « On attend la validation de ta banque… » — une phrase, sans durée promise (pur). canal : 'apple' | 'google'. */
export function texteAttenteBanque({ lang = 'fr', canal = 'apple', formule = 'premium_cloud', essai = false } = {}) {
  const b = nomBoutiqueDe(canal);
  const nom = nomDe(formule);
  if (lang === 'en') {
    const quoi = formule === 'cloud' ? 'your Cloud' : essai ? `your ${nom} trial` : nom;
    return `Waiting for your bank to approve… As soon as ${b} confirms, ${quoi} starts on its own: you don't need to do anything again.`;
  }
  const quoi = formule === 'cloud' ? 'ton Cloud' : essai ? `ton essai ${nom}` : nom;
  return `On attend la validation de ta banque… Dès ${canal === 'google' ? 'que Google Play' : "qu'Apple"} confirme, ${quoi} démarre tout seul : tu n'as rien à refaire.`;
}

/** La transaction est arrivée, le serveur porte l'abonnement (pur). essai : cloud_etat_moi dit « essai ». */
export function texteVeilleActive({ lang = 'fr', formule = 'premium_cloud', essai = true } = {}) {
  const nom = nomDe(formule);
  if (lang === 'en') return essai ? `Your ${nom} trial has started.` : `${nom} is on.`;
  return essai ? `Ton essai ${nom} a démarré.` : `${nom} est activé.`;
}

/** 24 h sans confirmation (pur) : la phrase vraie. */
export function texteBanqueNonConfirmee(lang = 'fr') {
  return lang === 'en' ? "Your bank didn't confirm: nothing was charged." : "Ta banque n'a pas confirmé : rien n'a été prélevé.";
}

/** Note la veille (une à la fois : la plus récente remplace). Ne lève jamais ; rend la veille notée, ou null. */
export function noterVeilleAchat({ userId, produit, formule, canal, raison, essai = false, repriseEssai = false, origine = null, maintenant = Date.now() } = {}, stockage = stockageParDefaut()) {
  if (!userId || !produit || !FORMULES_VEILLEES.has(formule)) return null;
  const veille = { userId: String(userId), produit: String(produit), formule, canal: canal === 'google' ? 'google' : 'apple',
    raison: raison ?? null, essai: essai === true, repriseEssai: repriseEssai === true, origine, depuis: maintenant };
  try { stockage?.setItem(CLE_VEILLE_ACHAT, JSON.stringify(veille)); } catch { return null; }
  signaler();
  return veille;
}

/** La veille lue, ou null (illisible, incomplète). */
export function lireVeilleAchat(stockage = stockageParDefaut()) {
  try {
    const v = JSON.parse(stockage?.getItem(CLE_VEILLE_ACHAT) ?? 'null');
    return v && typeof v.userId === 'string' && typeof v.produit === 'string' && FORMULES_VEILLEES.has(v.formule) && Number.isFinite(v.depuis) ? v : null;
  } catch { return null; }
}

export function effacerVeilleAchat(stockage = stockageParDefaut()) {
  try { stockage?.removeItem(CLE_VEILLE_ACHAT); } catch { /* stockage indisponible */ }
  signaler();
}

function majVeille(v, champs, stockage) {
  try { stockage?.setItem(CLE_VEILLE_ACHAT, JSON.stringify({ ...v, ...champs })); } catch { /* stockage indisponible */ }
}

/** Une veille en cours (de ce compte si `userId`), pas encore échue (pur). */
export function veilleEnCours({ userId = null, maintenant = Date.now() } = {}, stockage = stockageParDefaut()) {
  const v = lireVeilleAchat(stockage);
  if (!v || (userId && v.userId !== userId)) return false;
  return maintenant - v.depuis < DUREE_VEILLE_MS;
}

/**
 * La feuille de la boutique a-t-elle vu l'app partir ? (pur ; `ecouter(nom, cb)` = CapacitorApp.addListener, injecté)
 *   · iPhone : `pause` (didEnterBackground — l'appli de la banque passe devant). Jamais appStateChange(false) : sur iOS il
 *     suit willResignActive, que la feuille d'Apple et Face ID déclenchent SEULS, sans quitter l'app ;
 *   · Android : appStateChange(false) (onStop — l'app n'est plus visible). Jamais `pause` : il suit onPause, que la
 *     feuille de Google Play déclenche seule.
 * Rend { quitte(), horsAppMs(), arreter() }.
 */
export function surveillerQuitteApp({ platform, ecouter, horloge = () => Date.now() } = {}) {
  let quitte = false;
  let depuis = null;
  let cumul = 0;
  const poignees = [];
  const partir = () => { quitte = true; if (depuis == null) depuis = horloge(); };
  const revenir = () => { if (depuis != null) { cumul += Math.max(0, horloge() - depuis); depuis = null; } };
  const brancher = (nom, cb) => { try { poignees.push(Promise.resolve(ecouter?.(nom, cb)).catch(() => null)); } catch { /* écoute indisponible */ } };
  if (typeof ecouter === 'function') {
    if (platform === 'ios') { brancher('pause', partir); brancher('resume', revenir); }
    else if (platform === 'android') brancher('appStateChange', (e) => { if (e?.isActive === false) partir(); else if (e?.isActive === true) revenir(); });
  }
  return {
    quitte: () => quitte,
    horsAppMs: () => cumul + (depuis != null ? Math.max(0, horloge() - depuis) : 0),
    arreter: () => { for (const p of poignees) p.then((h) => { try { h?.remove?.(); } catch { /* déjà retiré */ } }).catch(() => {}); },
  };
}

/** Un abonnement FillSell (jamais un pack de Pépites, que listenCoinTransactionUpdates traite seul). Pur. */
export const estAbonnementFillSell = (id) => typeof id === 'string' && /^app\.fillsell\./.test(id) && !/^app\.fillsell\.coins\./.test(id);

/** L'achat Google Play ACHETÉ (purchaseState 1) du produit veillé, de CE compte (ou sans compte lisible) — pur. */
export function achatPlayAchete(achats, { produit, userId }) {
  if (!Array.isArray(achats)) return null;
  return achats.find((p) => p?.productIdentifier === produit && typeof p?.purchaseToken === 'string' && p.purchaseToken
    && String(p.purchaseState) === '1' && (!p.appAccountToken || p.appAccountToken === userId)) ?? null;
}

/** L'état du SERVEUR pour la formule veillée : la lecture d'attendreServeur (palier + cloud_etat_moi). null = illisible. */
export async function lireEtatServeurVeille({ supabase, userId, formule }) {
  try {
    const palier = PALIER_DE_FORMULE[formule] ?? null;
    const [p, c] = await Promise.all([
      palier ? supabase.from('profiles').select('is_premium,is_pro,is_business').eq('id', userId).maybeSingle() : Promise.resolve({ data: null, error: null }),
      supabase.rpc('cloud_etat_moi'),
    ]);
    if (c?.error || p?.error) return { actif: null, essai: false };
    const d = p?.data;
    const palierOk = !palier ? true : palier === 'business' ? d?.is_business === true : palier === 'pro' ? d?.is_pro === true : d?.is_premium === true;
    return { actif: palierOk && c?.data?.actif === true, essai: c?.data?.etat === 'essai' };
  } catch { return { actif: null, essai: false }; }
}

/**
 * La veille vivante (App.jsx la branche : ouverture, appStateChange actif, transactionUpdated). Les lectures de la base
 * ne partent QUE sur ces événements — une à la fois, au plus une relecture différée après un retour, au plus
 * RELECTURES_APRES_TRANSACTION_MS après une transaction ; jamais de setInterval.
 * `surFin({ issue, veille, message, bandeau })` : l'écran (toast, palier, données) ; `journal(evenement, metadata)` : la trace.
 */
export function creerVeilleAchat({
  userId, platform, supabase, lireAchatsAndroid = null, acquitterGoogle = null, journal = null, surFin = null,
  stockage = stockageParDefaut(), horloge = () => Date.now(), lang = 'fr',
  poserMinuterie = (f, ms) => setTimeout(f, ms), retirerMinuterie = (t) => clearTimeout(t),
} = {}) {
  let arrete = false;
  let enVol = null;
  let minuterieRetour = null;
  const minuteriesTransaction = new Set();
  const tracer = (evenement, metadata) => { try { journal?.(evenement, metadata); } catch { /* trace seule */ } };

  function finir(v, issue, extra = {}) {
    effacerVeilleAchat(stockage);
    let bandeau = false;
    if (issue === 'actif') effacerEssaiAReprendre(stockage);
    // 24 h sans confirmation : le bandeau « Reprendre ton essai » revient (essai annoncé seulement), avec la phrase vraie.
    if (issue === 'expiree' && v.repriseEssai === true && FORMULES_AVEC_ESSAI.includes(v.formule)) {
      bandeau = noterEssaiAReprendre({ formule: v.formule, origine: 'veille_expiree', canal: v.canal, raison: 'banque_non_confirmee',
        maintenant: horloge() - DELAI_AVANT_BANDEAU_MS }, stockage) === true;
      signaler();
    }
    tracer('veille_achat_fin', { issue, formule: v.formule, produit: v.produit, canal: v.canal, raison: v.raison ?? null,
      depuis_s: Math.round((horloge() - v.depuis) / 1000), bandeau, ...extra });
    const message = issue === 'actif' ? texteVeilleActive({ lang, formule: v.formule, essai: extra.essai === true })
      : bandeau ? null : texteBanqueNonConfirmee(lang);
    try { surFin?.({ issue, veille: v, message, bandeau }); } catch { /* l'écran ne casse jamais la veille */ }
    return { issue, veille: v, message, bandeau };
  }

  async function verifierUneFois(source) {
    const v = lireVeilleAchat(stockage);
    if (!v) return { issue: 'aucune' };
    if (v.userId !== userId) return { issue: 'autre_compte' };
    let valideGoogle = false;
    // (c) Android : l'achat ACHETÉ chez Google Play (PENDING passé à ACHETÉ, sans l'app) → la validation du serveur, une
    // fois par veille (idempotente), puis l'acquittement (même ordre que le filet des Pépites : le serveur d'abord).
    if (platform === 'android' && typeof lireAchatsAndroid === 'function') {
      let achats = null;
      try { achats = await lireAchatsAndroid(); } catch { achats = null; }
      const a = achatPlayAchete(achats, { produit: v.produit, userId });
      if (a && v.googleValide !== true) {
        let erreur = null;
        try { ({ error: erreur } = await supabase.functions.invoke('validate-google-purchase', { body: { productId: v.produit, purchaseToken: a.purchaseToken, userId } })); }
        catch (e) { erreur = e ?? 'exception'; }
        if (!erreur) { valideGoogle = true; v.googleValide = true; majVeille(v, { googleValide: true }, stockage); }
      }
      if (a && v.googleValide === true && a.isAcknowledged === false && typeof acquitterGoogle === 'function') {
        try { await acquitterGoogle(a.purchaseToken); } catch { /* retenté au prochain retour (Google laisse 3 jours) */ }
      }
    }
    // (a) Le serveur, seule foi.
    const etat = await lireEtatServeurVeille({ supabase, userId, formule: v.formule });
    if (etat.actif === true) return finir(v, 'actif', { source, essai: etat.essai, ...(valideGoogle || v.googleValide ? { valide_google: true } : {}) });
    if (horloge() - v.depuis >= DUREE_VEILLE_MS) return finir(v, 'expiree', { source });
    return { issue: 'attente', veille: v };
  }

  /** Une vérification (jamais deux en vol). */
  function verifier(source = 'ouverture') {
    if (arrete) return Promise.resolve({ issue: 'arretee' });
    if (enVol) return enVol;
    enVol = verifierUneFois(source).catch(() => ({ issue: 'erreur' })).finally(() => { enVol = null; });
    return enVol;
  }

  /** Retour au premier plan : une lecture, puis au plus UNE relecture différée (la précédente est remplacée). */
  function surRetour(source = 'retour') {
    if (arrete || !lireVeilleAchat(stockage)) return Promise.resolve({ issue: 'aucune' });
    return verifier(source).then((r) => {
      if (r?.issue === 'attente' && !arrete) {
        if (minuterieRetour) retirerMinuterie(minuterieRetour);
        minuterieRetour = poserMinuterie(() => { minuterieRetour = null; verifier(`${source}_differe`); }, DELAI_RELECTURE_RETOUR_MS);
      }
      return r;
    });
  }

  /** iPhone : une transaction d'abonnement FillSell livrée par Apple pendant la veille. */
  function surTransaction(tx) {
    if (arrete || !estAbonnementFillSell(tx?.productIdentifier)) return Promise.resolve({ issue: 'ignoree' });
    const v = lireVeilleAchat(stockage);
    if (!v || v.userId !== userId) return Promise.resolve({ issue: 'aucune' });
    if (tx?.appAccountToken && String(tx.appAccountToken).toLowerCase() !== String(userId).toLowerCase()) return Promise.resolve({ issue: 'autre_compte' });
    tracer('veille_achat_transaction', { produit: tx.productIdentifier, formule: v.formule, canal: v.canal });
    return verifier('transaction').then((r) => {
      if (r?.issue === 'attente' && !arrete && minuteriesTransaction.size === 0) {
        for (const ms of RELECTURES_APRES_TRANSACTION_MS) {
          const t = poserMinuterie(() => {
            minuteriesTransaction.delete(t);
            if (!lireVeilleAchat(stockage)) { for (const x of minuteriesTransaction) retirerMinuterie(x); minuteriesTransaction.clear(); return; }
            verifier('transaction_differe');
          }, ms);
          minuteriesTransaction.add(t);
        }
      }
      return r;
    });
  }

  function arreter() {
    arrete = true;
    if (minuterieRetour) retirerMinuterie(minuterieRetour);
    minuterieRetour = null;
    for (const t of minuteriesTransaction) retirerMinuterie(t);
    minuteriesTransaction.clear();
  }

  return { verifier, surRetour, surTransaction, arreter };
}
