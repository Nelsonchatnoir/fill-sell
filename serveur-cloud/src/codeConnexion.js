// LE CODE DEMANDÉ PENDANT « ME CONNECTER » — un mur que seule la personne peut franchir (pur : aucun réseau, aucun DOM).
// Testé par tests/code-connexion.test.mjs et la simulation (verrou : selftest:cloud-connexion-code).
//
// (15/11/2026, cliente af37fa49 — Beebs « Continuer avec Kiabi », 3 connexions perdues de 07:43 à 08:00) La page Kiabi
// s'affichait (correctif du 14/11), l'e-mail et le mot de passe passaient (identity.kiabi.com /identity/v1/password/login
// 200), puis Kiabi, devant un appareil qu'il ne connaît pas (le navigateur Cloud), exigeait un CODE envoyé par e-mail
// (/identity/v1/mfa/stepup → /identity/v1/passwordless/start → page signInWithCode). Les trois fois, aucun code n'a
// jamais été envoyé à Kiabi (aucune requête après la page du code, enregistrements cloud-2
// beebs-2026-11-15T06-43-19-152Z, T06-45-17-174Z, T06-58-59-349Z) : fermée par elle 66 s après (07:45:11), fermée
// « faute de geste » au bout de 5 min après deux allers-retours vers sa boîte mail (07:52:00), fermée par elle 43 s
// après (08:00:17). Pendant ce temps, FillSell ne disait RIEN du code, et la page se fermait au bout de 5 minutes, le
// temps d'aller lire un e-mail compris, avec « Fermé après un moment sans geste ».
// Règle, pour toutes les plateformes et tous les fournisseurs (Kiabi, Google, Apple, Facebook, et les pages des
// plateformes elles-mêmes) :
//   · une page qui demande un code (champ « one-time-code », ou champ nommé code / OTP / PIN, ou cases d'un chiffre)
//     est reconnue dans la page AFFICHÉE (la fenêtre du fournisseur comprise) ; la personne lit tout de suite QUI lui a
//     envoyé un code, PAR OÙ (e-mail, SMS), où le chercher, et comment le saisir (« Écrire ») ;
//   · le temps laissé grandit : 10 minutes sans geste (au lieu de 5), 25 minutes en tout (au lieu de 15), y compris
//     pendant qu'elle est partie lire son e-mail ;
//   · une minute avant une fermeture faute de geste, elle est prévenue ;
//   · une fermeture pendant l'attente du code le DIT (« le code de Kiabi n'a pas été saisi à temps… un nouveau code »),
//     et la ligne de cloud_connexions porte la raison (« code_non_saisi », « client_au_code »).
// Jamais : lire, garder ou écrire un code à la place de la personne ; le contenu d'un champ n'est jamais lu.

export const INACTIVITE_MS = 5 * 60_000;
export const DUREE_MAX_MS = 15 * 60_000;
// (21/11/2026 nuit, Nico : « une page qui attend un code ne peut être ni fermée… tant que la connexion n'a pas abouti ») 10 → 20 min.
export const INACTIVITE_CODE_MS = 20 * 60_000;
export const DUREE_MAX_CODE_MS = 25 * 60_000;
export const AVANT_FERMETURE_MS = 60_000;

/** Les délais de la page (pure) : plus longs dès qu'un code a été demandé. `d` : réglages injectés (tests). */
export function delaisConnexion({ codeVu = false } = {}, d = {}) {
  const inactivite = codeVu ? (d.inactiviteCodeMs ?? INACTIVITE_CODE_MS) : (d.inactiviteMs ?? INACTIVITE_MS);
  return {
    inactiviteMs: inactivite,
    dureeMaxMs: codeVu ? (d.dureeMaxCodeMs ?? DUREE_MAX_CODE_MS) : (d.dureeMaxMs ?? DUREE_MAX_MS),
    // La personne partie lire son code : la page l'attend autant que l'inactivité permise.
    repriseMs: inactivite,
    avantFermetureMs: d.avantFermetureMs ?? AVANT_FERMETURE_MS,
  };
}

// Ce que la page affichée montre, lu SANS réseau et SANS jamais lire une valeur saisie : les champs visibles (type,
// autocomplete, inputmode, noms, longueur maximale) et le texte de la page. La décision se prend ici (lireCodeDemande).
// (15/11/2026 soir) Écrite par `lecturePage` : sans mesure (détection d'un code, toutes les 2 s), elle ne touche JAMAIS à
// la valeur d'un champ ; avec mesure (EXPRESSION_ETAT_CODE, plus bas), seulement à sa LONGUEUR.
const lecturePage = (mesurer) => `(() => {
  const vis = (e) => { try { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden') return false;
    const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; } catch (x) { return true; } };${mesurer ? `
  const secret = (i) => /^(password|email)$/i.test(i.type || '') || /password|username|email/i.test(i.getAttribute('autocomplete') || '');
  const actif = document.activeElement;` : ''}
  const champs = [...document.querySelectorAll('input')]
    .filter((i) => !/^(hidden|checkbox|radio|submit|button|image|reset|file|range|color)$/i.test(i.type || 'text') && vis(i))
    .slice(0, 12)
    .map((i) => ({ type: String(i.type || 'text'), ac: String(i.getAttribute('autocomplete') || ''), mode: String(i.getAttribute('inputmode') || ''),
      nom: [i.name, i.id, i.getAttribute('data-testid'), i.getAttribute('aria-label'), i.placeholder].filter(Boolean).join(' ').slice(0, 200),
      max: i.maxLength > 0 ? i.maxLength : null${mesurer ? `,
      lg: secret(i) ? null : String(i.value ?? '').length, actif: i === actif` : ''} }));
  const texte = champs.length ? String((document.body && document.body.innerText) || '').slice(0, 4000) : '';
  return { hote: location.hostname, champs, texte };
})()`;
export const EXPRESSION_CODE_DEMANDE = lecturePage(false);

// (15/11/2026 soir, ordre de Nico — point D ; cliente af37fa49 : à 20:17 on ne savait pas ce qu'elle voyait dans le champ
// du code) PENDANT qu'un code est attendu, la même lecture rend aussi, par champ, sa LONGUEUR (seul `.value.length` sort
// de la page, jamais la valeur) et s'il a le clavier (l'élément actif de la page). Un champ de mot de passe, d'e-mail ou
// d'identifiant n'est jamais mesuré (lg: null). La décision reste dans les fonctions pures (etatChampCode).
export const EXPRESSION_ETAT_CODE = lecturePage(true);

const EXCLUS = /postal|promo|zip|parrain|referr|coupon|gift|cadeau|country|pays|countrycode|indicatif|dial/i;
const NOM_CODE = /(^|[\s_\-.:])(otp|totp|pin|mfa|2fa|passcode|code|verification|verif|securitycode|smscode|onetime)/i;
const MOT_CODE = /\bcode\b|\bOTP\b|chiffres|digits/i;
const SMS = /\bSMS\b|\btexto\b|par message|t[ée]l[ée]phone|portable|mobile|\bphone\b|text message/i;
const EMAIL = /e-?mail|courriel|\bmail\b|bo[iî]te de r[ée]ception|\binbox\b|@/i;
const APPLI = /authenticator|application d.authentification|authentication app|appli(cation)? .{0,20}(google|microsoft)/i;

/**
 * La page demande-t-elle un code (pure) ? `v` : la valeur rendue par EXPRESSION_CODE_DEMANDE.
 * → null, ou { canal: 'email' | 'sms' | 'appli' | 'inconnu', chiffres: bool, hote }.
 */
const numerique = (c) => /^(numeric|decimal)$/i.test(String(c.mode ?? '')) || /^(tel|number)$/i.test(String(c.type ?? ''));
// Les champs du code d'une lecture (pure) : { tous, cases, texte } — ou null quand la page ne demande pas de code.
function champsDuCode(v) {
  if (!v || typeof v !== 'object' || !Array.isArray(v.champs) || !v.champs.length) return null;
  const texte = String(v.texte ?? '');
  const parleDuCode = MOT_CODE.test(texte);
  const champs = v.champs.filter((c) => c && typeof c === 'object' && !EXCLUS.test(String(c.nom ?? '')) && !/^(password|email)$/i.test(String(c.type ?? '')));
  const code = champs.filter((c) => String(c.ac ?? '').toLowerCase() === 'one-time-code'
    || NOM_CODE.test(` ${String(c.nom ?? '')}`)
    || (parleDuCode && numerique(c) && Number(c.max) >= 4 && Number(c.max) <= 8));
  // Les cases d'un chiffre (une par chiffre) : au moins 4, sur une page qui parle d'un code.
  const cases = champs.filter((c) => Number(c.max) === 1);
  if (!code.length && !(parleDuCode && cases.length >= 4)) return null;
  return { tous: code.length ? code : cases, cases, texte };
}

export function lireCodeDemande(v) {
  const c = champsDuCode(v);
  if (!c) return null;
  const { tous, cases, texte } = c;
  // Par où : d'abord les phrases qui parlent du code, sinon toute la page.
  const phrases = texte.split(/[\n.!?]+/).filter((p) => MOT_CODE.test(p)).join(' ');
  const canalDe = (t) => (APPLI.test(t) ? 'appli' : SMS.test(t) && !EMAIL.test(t) ? 'sms' : EMAIL.test(t) && !SMS.test(t) ? 'email'
    : EMAIL.test(t) && SMS.test(t) ? 'inconnu' : null);
  const canal = canalDe(phrases) ?? canalDe(texte) ?? 'inconnu';
  return { canal, chiffres: tous.some(numerique) || cases.length >= 4, hote: String(v.hote ?? '').toLowerCase() };
}

/**
 * (15/11/2026 soir, point D) L'état du champ du code (pure), d'après EXPRESSION_ETAT_CODE :
 * → null (pas de page de code), ou { longueur, attendue, clavier }.
 *   longueur : nombre de caractères dans le champ (cases d'un chiffre : cases remplies) ; null si non mesurée ;
 *   attendue : la longueur maximale du champ (cases : leur nombre) ; null si la page n'en dit rien ;
 *   clavier  : le champ du code (une de ses cases) est l'élément actif de la page — ce qui est tapé y entre.
 * Jamais la valeur : la lecture n'en rend que la longueur.
 */
export function etatChampCode(v) {
  const c = champsDuCode(v);
  if (!c) return null;
  const lg = (f) => (Number.isInteger(f.lg) && f.lg >= 0 ? f.lg : null);
  const enCases = c.tous.length > 1 && c.tous.every((f) => Number(f.max) === 1);
  const vises = enCases ? c.tous : [c.tous.find((f) => f.actif === true) ?? c.tous[0]];
  const mesures = vises.map(lg);
  const longueur = mesures.some((x) => x == null) ? null : mesures.reduce((a, b) => a + b, 0);
  const attendue = enCases ? vises.length : (Number(vises[0].max) > 0 ? Number(vises[0].max) : null);
  return { longueur, attendue, clavier: c.tous.some((f) => f.actif === true) };
}

// (15/11/2026 soir, point D) CE QUE VISE UN CLIC (ou un toucher) pendant un code : le bouton sous le doigt, s'il soumet un
// formulaire, s'il est désactivé, et son libellé (60 caractères, le texte du BOUTON, jamais un champ). Lu AVANT de rejouer
// le geste (une validation peut changer la page aussitôt).
export function expressionCibleClic(x, y) {
  const n = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0);
  return `(() => { const e = document.elementFromPoint(${n(x)}, ${n(y)}); if (!e) return null;
  const b = e.closest('button, input[type="submit"], input[type="button"], input[type="image"], [role="button"], a');
  if (!b) return { bouton: false };
  const type = String(b.getAttribute('type') || (b.tagName === 'BUTTON' ? 'submit' : '')).toLowerCase();
  const f = b.form || b.closest('form');
  return { bouton: true, balise: b.tagName.toLowerCase(), soumet: type === 'submit' || type === 'image', formulaire: Boolean(f),
    champCode: Boolean(f && f.querySelector('input[autocomplete="one-time-code"], input[inputmode="numeric"], input[maxlength="1"]')),
    inactif: Boolean(b.disabled || b.getAttribute('aria-disabled') === 'true'),
    libelle: String(b.innerText || b.getAttribute('aria-label') || b.getAttribute('title') || '').trim().slice(0, 60) };
})()`;
}
const RENVOI = /nouveau code|renvoyer|renvoi|recevoir un (autre|nouveau)|new code|resend|send (it )?again|another code/i;
const VALIDER = /valider|confirmer|continuer|v[ée]rifier|connecter|connexion|suivant|ok\b|submit|verify|confirm|continue|sign ?in|log ?in|next/i;
/**
 * Le clic vise-t-il une validation (pure) ? `r` : ce que rend expressionCibleClic.
 * → null (autre chose), { par: 'bouton', inactif } (valider : bouton qui soumet le formulaire du code, ou dont le libellé
 *   valide), ou { par: 'nouveau_code', inactif } (« Envoyer un nouveau code », « Renvoyer le code »…).
 */
export function validationAuClic(r) {
  if (!r || typeof r !== 'object' || r.bouton !== true) return null;
  const libelle = String(r.libelle ?? '');
  const inactif = r.inactif === true;
  if (RENVOI.test(libelle)) return { par: 'nouveau_code', inactif };
  if ((r.soumet === true && r.formulaire === true) || (r.champCode === true && r.balise !== 'a') || VALIDER.test(libelle)) return { par: 'bouton', inactif };
  return null;
}

/** Le fournisseur qui demande le code, d'après l'hôte de la page affichée (pure) ; sinon le nom de la plateforme. */
export function nomFournisseur(hote, nomPlateforme) {
  const h = String(hote ?? '').toLowerCase();
  if (/(^|\.)kiabi\.com$/.test(h)) return 'Kiabi';
  if (/(^|\.)google\.[a-z.]+$/.test(h) || /(^|\.)youtube\.com$/.test(h)) return 'Google';
  if (/(^|\.)apple\.com$/.test(h)) return 'Apple';
  if (/(^|\.)facebook\.com$/.test(h)) return 'Facebook';
  return nomPlateforme;
}

/** La raison écrite dans cloud_connexions (pure) : une fermeture pendant l'attente d'un code le dit. */
export function raisonFermeture(raison, codeEnAttente) {
  if (!codeEnAttente) return raison;
  if (raison === 'expiree' || raison === 'client_parti') return 'code_non_saisi';
  if (raison === 'client') return 'client_au_code';
  return raison;
}

const duree = (n, mot) => `${n} ${mot}${Number(n) > 1 ? 's' : ''}`;
const ECRIRE_FR = '« Écrire »';
const ECRIRE_EN = '"Type"';
export const MESSAGES_CODE = Object.freeze({
  fr: {
    titre: (canal) => (canal === 'email' ? 'Code envoyé par e-mail' : canal === 'sms' ? 'Code envoyé par SMS' : 'Code de vérification demandé'),
    demande: (qui, canal, minutes) => {
      const ou = canal === 'email' ? `${qui} vient de t'envoyer un code par e-mail. Ouvre ta boîte mail (regarde aussi les courriers indésirables)`
        : canal === 'sms' ? `${qui} vient de t'envoyer un code par SMS. Ouvre tes messages`
          : canal === 'appli' ? `${qui} te demande un code de ton application d'authentification. Ouvre-la`
            : `${qui} te demande un code de vérification (reçu par e-mail ou par SMS). Va le lire`;
      return `${ou}, puis reviens ici : la page t'attend ${duree(minutes, 'minute')}. Touche la case du code, appuie sur ${ECRIRE_FR}, tape le code, puis valide sur la page.`
        + (canal === 'email' || canal === 'sms' || canal === 'inconnu' ? ` Rien reçu au bout de 2 minutes ? Demande un nouveau code sur la page.` : '');
    },
    suite: (qui) => `Merci : on continue avec ${qui}…`,
    bientot: 'Toujours là ? Sans geste, cette page se ferme dans 1 minute : touche-la pour la garder ouverte.',
    // (21/11/2026 nuit, priorité 0 de Nico) Ce que la plateforme a répondu à la validation, dit tel quel.
    reponse: (qui, message) => `${qui} a répondu : « ${message} ». Vérifie que c'est le code du DERNIER e-mail ou SMS reçu (un nouveau code annule les précédents), retape-le, puis valide. Toujours refusé ? Demande un nouveau code sur la page.`,
    expire: (qui, canal) => `Page fermée : le code de ${qui} n'a pas été saisi à temps. Rouvre « Me connecter » quand tu as ${canal === 'sms' ? 'ton téléphone et tes messages' : canal === 'email' ? 'ta boîte mail' : 'ton code'} sous la main : ${qui} t'enverra un nouveau code.`,
  },
  en: {
    titre: (canal) => (canal === 'email' ? 'Code sent by email' : canal === 'sms' ? 'Code sent by text' : 'Verification code requested'),
    demande: (qui, canal, minutes) => {
      const ou = canal === 'email' ? `${qui} just emailed you a code. Open your inbox (check the spam folder too)`
        : canal === 'sms' ? `${qui} just texted you a code. Open your messages`
          : canal === 'appli' ? `${qui} asks for a code from your authenticator app. Open it`
            : `${qui} asks for a verification code (sent by email or text). Go read it`;
      return `${ou}, then come back here: the page waits ${duree(minutes, 'minute')} for you. Tap the code box, press ${ECRIRE_EN}, type the code, then confirm on the page.`
        + (canal === 'email' || canal === 'sms' || canal === 'inconnu' ? ` Nothing after 2 minutes? Ask for a new code on the page.` : '');
    },
    suite: (qui) => `Thanks: carrying on with ${qui}…`,
    bientot: 'Still there? With no activity, this page closes in 1 minute: tap it to keep it open.',
    reponse: (qui, message) => `${qui} replied: "${message}". Check it's the code from the LATEST email or text (a new code cancels the previous ones), type it again, then confirm. Still refused? Ask for a new code on the page.`,
    expire: (qui, canal) => `Page closed: the ${qui} code wasn't entered in time. Open "Sign in" again when you have ${canal === 'sms' ? 'your phone and messages' : canal === 'email' ? 'your inbox' : 'your code'} at hand: ${qui} will send you a new code.`,
  },
});

// ── (21/11/2026 nuit, PRIORITÉ 0 de Nico — essais Cloud alisonbertincourt et melinemaros) CE QUE LA PLATEFORME RÉPOND ──
// Le 20/11 au soir, deux connexions Vinted ont buté sur le code de vérification : chez l'une, 8 validations envoyées (bouton
// actif, champ de 4 caractères) sans connexion ; chez l'autre, 18 frappes et aucune validation reconnue. Les journaux ne
// disaient RIEN de la réponse de Vinted (l'enregistrement réseau est coupé, la relecture du champ ne lit que sa longueur) :
// impossible de savoir si le code était refusé, expiré, ou jamais soumis — et la personne ne lisait rien de plus que la
// page. Règle : 2,5 s après chaque validation (bouton ou Entrée), la page AFFICHÉE est relue une fois — le texte VISIBLE de
// ses messages d'erreur (role="alert", aria-live, aria-invalid, classes d'erreur ; 4 au plus, 160 caractères chacun) et la
// présence du champ du code ; jamais la valeur d'un champ. Le message est tracé (journal « connexion_code_reponse »,
// usage_logs « cloud_connexion_code_etat » moment « reponse ») et, refusé, DIT à la personne dans le bandeau du code. Toute
// adresse e-mail et toute suite de 4 chiffres ou plus sont masquées avant d'être gardées.
export const REPONSE_CODE_APRES_MS = 2500;
export const EXPRESSION_REPONSE_CODE = `(() => {
  const vis = (e) => { try { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden') return false;
    const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; } catch (x) { return true; } };
  const sel = '[role="alert"], [aria-live="assertive"], [aria-live="polite"], [aria-invalid="true"], [class*="error" i], [class*="erreur" i], [class*="invalid" i], [class*="danger" i], [data-testid*="error" i]';
  const vus = new Set(); const messages = [];
  for (const e of document.querySelectorAll(sel)) {
    if (messages.length >= 4 || !vis(e) || e.tagName === 'INPUT' || e.tagName === 'TEXTAREA') continue;
    const t = String(e.innerText || '').replace(/\\s+/g, ' ').trim();
    if (!t || t.length > 300 || vus.has(t)) continue;
    vus.add(t); messages.push(t.slice(0, 160));
  }
  const codeEncore = [...document.querySelectorAll('input')].some((i) => vis(i) && (String(i.getAttribute('autocomplete') || '').toLowerCase() === 'one-time-code'
    || /^(numeric|decimal)$/i.test(i.getAttribute('inputmode') || '') || i.maxLength === 1 || /code|otp|pin|verif/i.test([i.name, i.id, i.getAttribute('aria-label'), i.placeholder].filter(Boolean).join(' '))));
  return { hote: location.hostname, messages, codeEncore };
})()`;
/** Un message de la page, sans donnée personnelle (pure) : e-mails et suites de 4 chiffres ou plus masqués, 160 caractères. */
export function messageSansDonnee(t) {
  return String(t ?? '').replace(/[^\s@]+@[^\s@]+/g, '…').replace(/\d{4,}/g, '…').replace(/\s+/g, ' ').trim().slice(0, 160);
}
/**
 * La réponse de la page à une validation du code (pure) : `v` = ce que rend EXPRESSION_REPONSE_CODE.
 * → { issue: 'refusee' (le champ est encore là ET un message d'erreur est visible) | 'sans_reponse' (champ encore là, aucun
 *   message) | 'quittee' (la page du code n'est plus là : passée, ou une autre étape) | 'illisible', message: string|null }.
 */
export function lireReponseCode(v) {
  if (!v || typeof v !== 'object') return { issue: 'illisible', message: null };
  const messages = (Array.isArray(v.messages) ? v.messages : []).map(messageSansDonnee).filter(Boolean);
  if (v.codeEncore !== true) return { issue: 'quittee', message: messages[0] ?? null };
  return messages.length ? { issue: 'refusee', message: messages.join(' · ').slice(0, 160) } : { issue: 'sans_reponse', message: null };
}

// ── (21/11/2026 nuit, complément 3a de Nico — alisonbertincourt) UNE PAGE QUI ATTEND UN CODE VALABLE N'EST JAMAIS JETÉE ──
// Le 20/11 : trois codes Vinted en 7 min (23:40:50, 23:43:25, 23:47:16). « Fermer » à 23:42:30 (après un écran « remplacée,
// ferme puis rouvre ») avait purgé la page et son code ; un toucher sur Leboncoin à 23:45:28 avait remplacé la page du
// 2e code ; au 3e, elle tapait 6 s après la demande un code d'avant — annulé par le nouveau. La règle :
//   · « Fermer » pendant qu'un code est attendu (non connectée, demandé il y a moins de CODE_GARDE_MS) : la page RESTE
//     (comme une personne partie lire son code) ; rouvrir la même plateforme la reprend, code compris ;
//   · une AUTRE plateforme touchée pendant ce temps : la page du code reste, et l'écran le dit ; un 2e toucher sur la même
//     autre plateforme dans les BASCULE_CONFIRMEE_MS remplace (la personne a choisi) ;
//   · rien ne change pour une page sans code, connectée, ou « Résoudre ».
export const CODE_GARDE_MS = INACTIVITE_CODE_MS;
export const BASCULE_CONFIRMEE_MS = 2 * 60_000;

/** La page attend-elle encore un code valable ? (pure) */
export function attendUnCodeValable({ resoudre = false, connectee = false, finie = false, code = null, maintenant = Date.now(), gardeMs = CODE_GARDE_MS } = {}) {
  if (resoudre || connectee || finie || !code || typeof code !== 'object') return false;
  const depuis = Number(code.depuis);
  return Number.isFinite(depuis) && maintenant - depuis < gardeMs;
}

/** Une autre plateforme touchée pendant qu'une page attend son code : retenue (première fois), ou remplacée (2e toucher
 *  confirmé dans la fenêtre) ? `retenue` : { plateforme, le } du dernier refus pour ce compte. (pure) */
export function basculeRetenue({ attendCode = false, memePage = false, reprise = false, fermeeParElle = false, demandee = null, retenue = null, maintenant = Date.now(), fenetreMs = BASCULE_CONFIRMEE_MS } = {}) {
  // (21/11/2026 nuit, 2e message de Nico) Fermée par elle (« Fermer ») : elle a choisi, l'autre plateforme passe.
  if (!attendCode || memePage || reprise || fermeeParElle) return false;
  const confirmee = retenue && retenue.plateforme === demandee && maintenant - Number(retenue.le) < fenetreMs;
  return !confirmee;
}

export const MESSAGES_GARDE = Object.freeze({
  fr: {
    gardee: (nom) => `Ta page ${nom} reste ouverte quelques minutes avec ton code : rouvre ${nom} pour le saisir, rien n'est perdu.`,
    retenue: (nomCode, nomDemande) => `Ta page ${nomCode} attend encore ton code : rouvre ${nomCode} pour le saisir (le code reçu reste valable). Pour fermer ta page ${nomCode} et passer à ${nomDemande}, touche ${nomDemande} une 2e fois.`,
  },
  en: {
    gardee: (nom) => `Your ${nom} page stays open a few minutes with your code: open ${nom} again to type it, nothing is lost.`,
    retenue: (nomCode, nomDemande) => `Your ${nomCode} page is still waiting for your code: open ${nomCode} again to type it (the code you received stays valid). To close your ${nomCode} page and switch to ${nomDemande}, tap ${nomDemande} a second time.`,
  },
});

// ── (21/11/2026 nuit, 2e message de Nico — melinemaros) « VALIDER LE CODE » DEPUIS LE BANDEAU DE L'APP ────────────────
// melinemaros (20/11, 22:05:21 → 22:07:36) : le code (4 caractères) était dans le champ 14 s après la demande, mais AUCUNE
// validation n'est partie (ni Entrée, ni toucher sur un bouton de la page) ; le clavier du téléphone a quitté le champ à
// 22:05:51 (« OK » / « Terminé » du clavier : rien n'est envoyé), 13 frappes ont suivi sans champ actif. Le bandeau du code
// de l'app porte désormais « Valider le code » : SON geste, rejoué tel quel — le champ du code (le dernier rempli) reprend
// le clavier et reçoit Entrée ; sans champ, le bouton de validation de la page (dans le formulaire du code) reçoit un clic à
// son centre. Rien n'est lu ni écrit dans le champ (jamais sa valeur ; seulement « rempli ou non »).
export const EXPRESSION_VALIDER_CODE = `(() => {
  const vis = (e) => { try { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden') return false;
    const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; } catch (x) { return false; } };
  const estCode = (i) => String(i.getAttribute('autocomplete') || '').toLowerCase() === 'one-time-code'
    || /^(numeric|decimal)$/i.test(i.getAttribute('inputmode') || '') || i.maxLength === 1
    || /code|otp|pin|verif/i.test([i.name, i.id, i.getAttribute('aria-label'), i.placeholder].filter(Boolean).join(' '));
  const champs = [...document.querySelectorAll('input')].filter((i) => vis(i) && !i.disabled && estCode(i));
  const remplis = champs.filter((i) => String(i.value || '').length > 0);
  const champ = remplis[remplis.length - 1] || champs[0] || null;
  const VALIDER = /valider|confirmer|continuer|v[ée]rifier|suivant|submit|verify|confirm|continue|next/i;
  const RENVOI = /renvoy|nouveau code|resend|new code|send again/i;
  const formulaire = champ && champ.form ? champ.form : document;
  const boutons = [...formulaire.querySelectorAll('button, [role="button"], input[type="submit"]')].filter((b) => vis(b) && !b.disabled
    && b.getAttribute('aria-disabled') !== 'true' && !RENVOI.test(String(b.innerText || b.value || '')));
  const bouton = boutons.find((b) => b.type === 'submit' && VALIDER.test(String(b.innerText || b.value || '')))
    || boutons.find((b) => VALIDER.test(String(b.innerText || b.value || b.getAttribute('aria-label') || ''))) || null;
  if (champ) { try { champ.focus(); } catch (x) { /* rien */ } }
  const r = bouton ? bouton.getBoundingClientRect() : null;
  return { champ: Boolean(champ), champs: champs.length, remplis: remplis.length, focus: Boolean(champ) && document.activeElement === champ,
    bouton: r ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null };
})()`;

/** Que faire de « Valider le code » (pure) : `v` = ce que rend EXPRESSION_VALIDER_CODE.
 *  → { par: 'entree' (champ rempli au clavier → Entrée) | 'bouton' (le bouton de validation de la page) | 'rien', point? } */
export function choixValiderCode(v) {
  if (!v || typeof v !== 'object') return { par: 'rien' };
  if (v.champ === true && v.focus === true && Number(v.remplis) > 0) return { par: 'entree' };
  const b = v.bouton;
  if (b && Number.isFinite(Number(b.x)) && Number.isFinite(Number(b.y))) return { par: 'bouton', point: { x: Number(b.x), y: Number(b.y) } };
  if (v.champ === true && v.focus === true) return { par: 'entree' };
  return { par: 'rien' };
}

export const MESSAGES_VALIDER = Object.freeze({
  fr: { rien: (qui) => `Je ne trouve ni le champ du code ni le bouton pour valider sur la page de ${qui} : touche le champ du code, tape le code, puis le bouton de la page.` },
  en: { rien: (qui) => `I can't find the code field or the confirm button on the ${qui} page: tap the code field, type the code, then the page's button.` },
});
