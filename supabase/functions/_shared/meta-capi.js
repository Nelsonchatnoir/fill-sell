// ═══════════════════════════════════════════════════════════════════════════
// API DE CONVERSIONS META — L'INSCRIPTION ENVOYÉE PAR LE SERVEUR (15/11/2026 soir, ordre de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Pur (aucun réseau, aucune base) : partagé par la fonction edge meta-inscription (Deno) et son verrou
// (scripts/meta-capi-inscription-selftest.mjs, Node). Verrou : selftest:meta-capi-inscription.
//
// Pourquoi : le pixel du navigateur rate des inscriptions (bloqueur de pub, page fermée trop tôt). Le serveur envoie
// AUSSI « CompleteRegistration » aux DEUX pixels (compte pub perso de Nico 921207750637065, « FillSell Web »
// 1425992186075849), avec le MÊME event_id que l'événement du navigateur : Meta n'en compte qu'un.
// Décisions de Nico (15/11 soir) : SEULEMENT avec l'accord au bandeau (comme le pixel), web seulement (les apps natives
// n'ont ni bandeau ni traceur Meta) ; la politique de confidentialité le dit (Legal.jsx, même commit).
// Données envoyées, et RIEN d'autre : e-mail et identifiant de compte en empreinte SHA-256 (jamais en clair), fbp/fbc
// quand ils existent, IP et navigateur de la personne, adresse de la page.
//
// (17/11/2026, ordre de Nico — « les inscriptions n'arrivent pas chez Meta ») CAUSE PROUVÉE : les secrets
// META_CAPI_TOKEN_<pixel> n'ont jamais existé (Meta avait refusé de générer les jetons le 15/11) ; chaque inscription
// notait « jeton_absent » sans que personne ne le voie. Décisions de Nico du 17/11 :
//   · le serveur n'envoie qu'au pixel « FillSell Web » 1425992186075849 (portefeuille FillSell, qui donne un jeton),
//     partagé avec le compte pub perso ; le pixel 921207750637065 appartient au compte pub perso, hors de tout
//     portefeuille : Meta n'y donne AUCUN jeton → navigateur seulement (PIXELS_NAVIGATEUR_SEUL), jamais « jeton_absent » ;
//   · accord au bandeau WEB seulement (inchangé) : une inscription faite dans l'app n'envoie rien ; l'essai Cloud
//     (StartTrial) et le premier paiement (Subscribe, Purchase) partent pour une personne qui a dit oui sur le web à son
//     inscription, quel que soit le canal de paiement (Stripe, Apple, Google), avec la valeur et la devise de la source ;
//   · jamais un compte de test, jamais un achat de test ; jeton absent ou envoi raté = trace claire, et une alerte à
//     support@ au 4e échec d'affilée (plus de 3). Orchestration : ./meta-capi-envoi.js. Verrou : selftest:meta-capi-envoi.

export const PIXELS_META = Object.freeze(['921207750637065', '1425992186075849']);
/** Les pixels qui reçoivent l'API de conversions (un jeton existe pour eux). */
export const PIXELS_CAPI = Object.freeze(['1425992186075849']);
/** Le pixel du compte pub perso : navigateur seulement (Meta n'y donne aucun jeton, décision de Nico du 17/11). */
export const PIXELS_NAVIGATEUR_SEUL = Object.freeze(['921207750637065']);
export const FEATURE_INSCRIPTION = 'meta_capi_inscription';
export const FEATURE_EVENEMENT = 'meta_capi_evenement';
export const FEATURE_ESSAI = 'meta_capi_essai';
/** Les traces qui comptent pour la série d'échecs (jamais les essais de Nico). */
export const FEATURES_SUIVIES = Object.freeze([FEATURE_INSCRIPTION, FEATURE_EVENEMENT]);
export const ENVOYE = 'envoye';
export const JETON_ABSENT = 'jeton_absent';
/** « Plus de 3 fois d'affilée » : l'alerte part au 4e échec de suite, une fois par série. */
export const SEUIL_ALERTE = 4;
export const ADRESSE_ALERTE = 'support@fillsell.app';
export const EVENEMENTS_SERVEUR = Object.freeze(['StartTrial', 'Subscribe', 'Purchase']);
export const URL_APP = 'https://fillsell.app/app';
export const VERSION_GRAPH = 'v23.0';
// Le compte doit être né il y a moins de 30 min : seule une inscription réelle, et récente, part (jamais un compte
// existant, jamais un rejeu tardif).
export const AGE_MAX_COMPTE_MS = 30 * 60_000;
// L'adresse de la page : notre site seulement, sans paramètres (rien d'autre ne part).
const SITES = /^https:\/\/(www\.)?fillsell\.app(\/[A-Za-z0-9\-._~/]*)?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FBP = /^fb\.[0-9]\.[0-9]{10,16}\.[0-9]{1,24}$/;
const FBC = /^fb\.[0-9]\.[0-9]{10,16}\.[A-Za-z0-9_-]{1,400}$/;

/** Le nom du secret qui porte le jeton d'un pixel (jamais le jeton lui-même dans le code). */
export const nomSecretJeton = (pixel) => `META_CAPI_TOKEN_${pixel}`;

/**
 * La demande du navigateur (pure) : { user_id, event_id, fbp?, fbc?, source_url } — ou null si elle n'est pas
 * conforme (le serveur ne fait alors rien, et ne le dit pas au navigateur).
 */
export function lireDemande(texte) {
  let d;
  try { d = typeof texte === 'string' ? JSON.parse(texte) : texte; } catch { return null; }
  if (!d || typeof d !== 'object') return null;
  if (!UUID.test(String(d.user_id ?? '')) || !UUID.test(String(d.event_id ?? ''))) return null;
  const url = String(d.source_url ?? '');
  return {
    user_id: String(d.user_id).toLowerCase(),
    event_id: String(d.event_id).toLowerCase(),
    fbp: FBP.test(String(d.fbp ?? '')) ? String(d.fbp) : null,
    fbc: FBC.test(String(d.fbc ?? '')) ? String(d.fbc) : null,
    source_url: SITES.test(url) ? url : 'https://fillsell.app/app',
  };
}

/** L'adresse IP de la personne d'après les en-têtes (pure) : la première de x-forwarded-for, sinon cf-connecting-ip. */
export function ipDuClient(entetes) {
  const lire = (n) => (typeof entetes?.get === 'function' ? entetes.get(n) : entetes?.[n]) ?? '';
  const brute = String(lire('x-forwarded-for')).split(',')[0].trim() || String(lire('cf-connecting-ip')).trim();
  return /^[0-9a-f.:]{3,45}$/i.test(brute) ? brute : null;
}

/** L'empreinte SHA-256 en hexadécimal minuscule (Web Crypto : Deno et Node). */
export async function sha256Hex(texte) {
  const octets = new TextEncoder().encode(String(texte));
  const h = await globalThis.crypto.subtle.digest('SHA-256', octets);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * L'événement « CompleteRegistration » (pure, async pour le hachage) — ou { refus } :
 *   compte : { id, email, created_at } lu par le serveur (auth.users), jamais ce que dit le navigateur ;
 *   demande : lireDemande(...) ; ip, ua : la requête du navigateur ; maintenant : l'horloge (injectable).
 */
export async function evenementInscription({ compte, demande, ip, ua, maintenant = Date.now() }) {
  if (!demande) return { refus: 'demande_invalide' };
  if (!compte?.id || String(compte.id).toLowerCase() !== demande.user_id) return { refus: 'compte_inconnu' };
  const email = String(compte.email ?? '').trim().toLowerCase();
  if (!email.includes('@')) return { refus: 'email_absent' };
  const ne = Date.parse(String(compte.created_at ?? ''));
  if (!Number.isFinite(ne) || maintenant - ne > AGE_MAX_COMPTE_MS || ne - maintenant > 60_000) return { refus: 'compte_pas_recent' };
  const ua_ = String(ua ?? '').slice(0, 512);
  if (!ip || !ua_) return { refus: 'ip_ou_navigateur_absent' };
  const user_data = {
    em: [await sha256Hex(email)],
    external_id: [await sha256Hex(String(compte.id).toLowerCase())],
    client_ip_address: ip,
    client_user_agent: ua_,
    ...(demande.fbp ? { fbp: demande.fbp } : {}),
    ...(demande.fbc ? { fbc: demande.fbc } : {}),
  };
  return {
    evenement: {
      event_name: 'CompleteRegistration',
      event_time: Math.floor(ne / 1000),
      event_id: demande.event_id,
      action_source: 'website',
      event_source_url: demande.source_url,
      user_data,
    },
  };
}

/** L'adresse d'envoi d'un pixel (pure). */
export const urlEnvoi = (pixel, version = VERSION_GRAPH) => `https://graph.facebook.com/${version}/${pixel}/events`;

// ═══════════════════════════════════════════════════════════════════════════
// (17/11/2026, ordre de Nico) L'ESSAI, LE PREMIER PAIEMENT, LES COMPTES DE TEST, LA SÉRIE D'ÉCHECS — règles pures
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Un compte de test de Nico (liste de Nico, 17/11) : rien ne part chez Meta. L'adresse sans son alias « +… » :
 * nicolas.svobodny*, hoosslocal, googlereview, test (test, test2…), nicotest (nicotest, nicotest2…), tout domaine.
 * Une adresse illisible compte comme un compte de test (le doute ne part pas).
 */
export function estCompteDeTest(email) {
  const e = String(email ?? '').trim().toLowerCase();
  const at = e.lastIndexOf('@');
  if (at <= 0) return true;
  const local = e.slice(0, at).split('+')[0];
  return /^nicolas\.svobodny/.test(local) || /^(hoosslocal|googlereview|test\d*|nicotest\d*)$/.test(local);
}

/**
 * Ce que l'inscription a gardé pour les événements d'après (trace meta_capi_inscription, accord au bandeau) :
 * fbp, fbc et le navigateur, relus au format (jamais ce qui n'en a pas la forme). Une trace d'avant le 17/11 n'a
 * que des booléens : rien n'est relu, l'événement part sans eux.
 */
export function contexteDeTrace(metadata) {
  const c = metadata?.contexte ?? {};
  const ua = typeof c.ua === 'string' ? c.ua.slice(0, 512) : '';
  return {
    fbp: FBP.test(String(c.fbp ?? '')) ? String(c.fbp) : null,
    fbc: FBC.test(String(c.fbc ?? '')) ? String(c.fbc) : null,
    ua: ua.trim() ? ua : null,
  };
}

/**
 * Un montant lu à la source → { montant, devise } ou null : un objet { montant, devise } (mails Cloud) ou le texte
 * des alertes de paiement (« 24.99 EUR », Stripe et Apple). Jamais un prix inventé : sans source, rien.
 */
export function lireMontant(v) {
  if (v && typeof v === 'object') {
    const montant = Number(v.montant);
    const devise = String(v.devise ?? '').toUpperCase();
    return Number.isFinite(montant) && montant > 0 && /^[A-Z]{3}$/.test(devise) ? { montant: Math.round(montant * 100) / 100, devise } : null;
  }
  const m = String(v ?? '').trim().match(/^([0-9]+(?:[.,][0-9]{1,3})?)\s*([A-Za-z]{3})$/);
  if (!m) return null;
  return lireMontant({ montant: Number(m[1].replace(',', '.')), devise: m[2] });
}

/**
 * Les événements Meta d'un passage des mails Cloud (_shared/cloud-mails-envoi.ts, tous canaux) :
 *   essai_debut → StartTrial (valeur : le prix de la première échéance, lu à la source) ;
 *   paiement d'un DÉBUT payant ou d'une FIN D'ESSAI → Subscribe + Purchase (valeur : le montant payé). Un
 *   renouvellement n'est jamais un premier paiement.
 * `prixEssai` : le prix de la première échéance (lirePrix de l'appelant) ou null.
 * @param {any} evenements
 * @param {any} [prixEssai]
 */
export function demandesDeCloud(evenements, prixEssai = null) {
  const out = [];
  for (const e of Array.isArray(evenements) ? evenements : []) {
    if (e?.evenement === 'essai_debut') out.push({ nom: 'StartTrial', montant: lireMontant(prixEssai) });
    if (e?.evenement === 'paiement' && ['debut', 'fin_essai'].includes(e?.faits?.contexte)) {
      const m = lireMontant(e.faits.montant);
      out.push({ nom: 'Subscribe', montant: m }, { nom: 'Purchase', montant: m });
    }
  }
  return out;
}

/**
 * Les événements Meta d'un paiement CRÉDITÉ (alerte payment_alert d'email-tunnel, appelée par les webhooks des trois
 * canaux et validate-google-purchase) : un abonnement → Subscribe + Purchase ; un pack → Purchase. Un achat de test,
 * une alerte d'échec : rien.
 */
export function demandesDePaiement(alerte) {
  if (!alerte || alerte.ok !== true || alerte.test === true) return [];
  const m = lireMontant(alerte.montant);
  if (alerte.type === 'abonnement') return [{ nom: 'Subscribe', montant: m }, { nom: 'Purchase', montant: m }];
  if (alerte.type === 'pack') return [{ nom: 'Purchase', montant: m }];
  return [];
}

/** L'identifiant d'un événement serveur : un par compte et par nom (« le premier » ; Meta dédoublonne un rejeu). */
export async function idEvenementServeur(userId, nom) {
  return `${String(nom).toLowerCase()}-${(await sha256Hex(`${String(userId).toLowerCase()}:${nom}`)).slice(0, 32)}`;
}

/**
 * L'événement serveur StartTrial / Subscribe / Purchase (pure, async pour le hachage) — ou { refus } :
 *   compte : { id, email } relu par le serveur ; contexte : contexteDeTrace(trace d'inscription) ;
 *   canal : 'stripe' | 'apple' | 'google' ; montant : lireMontant(...) ou null ; maintenant : l'horloge.
 * Stripe (paiement sur notre site) part en « website » avec le navigateur de l'inscription ; sans navigateur gardé, et
 * pour Apple et Google (achat dans la boutique, confirmé par son serveur), en « system_generated ». Purchase exige une
 * valeur : sans montant lu à la source, il ne part pas.
 * @param {{ nom: string, compte: any, contexte?: any, canal?: string | null, montant?: any, maintenant?: number }} p
 */
export async function evenementServeur({ nom, compte, contexte = {}, canal, montant = null, maintenant = Date.now() }) {
  if (!EVENEMENTS_SERVEUR.includes(nom)) return { refus: 'evenement_inconnu' };
  if (!compte?.id) return { refus: 'compte_inconnu' };
  const email = String(compte.email ?? '').trim().toLowerCase();
  if (!email.includes('@')) return { refus: 'email_absent' };
  if (estCompteDeTest(email)) return { refus: 'compte_de_test' };
  const m = lireMontant(montant);
  if (nom === 'Purchase' && !m) return { refus: 'montant_absent' };
  const web = canal === 'stripe' && Boolean(contexte?.ua);
  const user_data = {
    em: [await sha256Hex(email)],
    external_id: [await sha256Hex(String(compte.id).toLowerCase())],
    ...(web ? { client_user_agent: String(contexte.ua).slice(0, 512) } : {}),
    ...(contexte?.fbp ? { fbp: contexte.fbp } : {}),
    ...(contexte?.fbc ? { fbc: contexte.fbc } : {}),
  };
  return {
    evenement: {
      event_name: nom,
      event_time: Math.floor(maintenant / 1000),
      event_id: await idEvenementServeur(compte.id, nom),
      action_source: web ? 'website' : 'system_generated',
      ...(web ? { event_source_url: URL_APP } : {}),
      user_data,
      ...(m ? { custom_data: { value: m.montant, currency: m.devise } } : {}),
    },
  };
}

/** Le statut d'un envoi à un pixel (pure) : « envoye », « http_<code>:<message> ». Jamais le jeton. */
export function statutReponse({ ok, status, corps }) {
  if (ok && Number(corps?.events_received ?? 0) >= 1) return ENVOYE;
  const msg = String(corps?.error?.message ?? (ok ? 'aucun evenement recu' : '')).replace(/access_token=[^&\s]+/g, 'access_token=…').slice(0, 120);
  return `http_${Number(status) || 0}:${msg}`;
}

/** Une trace est-elle un échec ? (aucun pixel, ou un pixel qui n'a pas reçu) */
export function estEchec(pixels) {
  const v = Object.values(pixels ?? {});
  return v.length === 0 || v.some((s) => s !== ENVOYE);
}

/** Le nombre d'échecs de suite, en partant de la trace la plus récente (`traces` : métadonnées, la plus récente d'abord). */
export function serieEchecs(traces) {
  let n = 0;
  for (const t of Array.isArray(traces) ? traces : []) { if (!estEchec(t?.pixels)) break; n++; }
  return n;
}

/** L'alerte part quand la série atteint EXACTEMENT le seuil (le 4e échec) : une fois par série, jamais à chaque échec. */
export const doitAlerter = (traces) => serieEchecs(traces) === SEUIL_ALERTE;

/** Le mail d'alerte à support@ (pur) : ce qui échoue, et quoi faire. Aucune donnée personnelle, jamais le jeton. */
export function texteAlerte(traces) {
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const derniers = (Array.isArray(traces) ? traces : []).slice(0, SEUIL_ALERTE);
  const jeton = derniers.some((t) => Object.values(t?.pixels ?? {}).includes(JETON_ABSENT));
  const sujet = `🚨 Meta (API de conversions) : ${SEUIL_ALERTE} envois ratés d'affilée${jeton ? ' — jeton absent' : ''}`;
  const lignes = derniers.map((t) => `<li>${esc(t?.nom ?? 'CompleteRegistration')} — ${esc(JSON.stringify(t?.pixels ?? {}))}</li>`).join('');
  const cause = jeton
    ? "Cause : le secret Supabase <code>META_CAPI_TOKEN_&lt;pixel&gt;</code> est absent. Le recréer dans le Gestionnaire d'événements Meta (pixel FillSell Web, Paramètres, « Générer un token d'accès ») et le ranger en secret Supabase : aucun redéploiement."
    : "Cause : Meta refuse l'envoi (voir le message ci-dessus) — jeton expiré ou révoqué, pixel supprimé, ou Meta indisponible. Traces : usage_logs, features meta_capi_inscription et meta_capi_evenement.";
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"></head><body style="font-family:sans-serif;font-size:14px;color:#111827;">
<p><strong>Les ${SEUIL_ALERTE} derniers événements envoyés à Meta par le serveur ont échoué.</strong> Meta ne voit plus les inscriptions, essais et paiements par l'API de conversions (le pixel du navigateur continue).</p>
<ul>${lignes}</ul>
<p>${cause}</p>
<p style="color:#6B7280;font-size:12px;">Une seule alerte par série : la suivante partira après un envoi réussi puis ${SEUIL_ALERTE} nouveaux échecs.</p>
</body></html>`;
  return { sujet, html };
}
