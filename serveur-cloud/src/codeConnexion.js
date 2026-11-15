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
export const INACTIVITE_CODE_MS = 10 * 60_000;
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
export const EXPRESSION_CODE_DEMANDE = `(() => {
  const vis = (e) => { try { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden') return false;
    const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; } catch (x) { return true; } };
  const champs = [...document.querySelectorAll('input')]
    .filter((i) => !/^(hidden|checkbox|radio|submit|button|image|reset|file|range|color)$/i.test(i.type || 'text') && vis(i))
    .slice(0, 12)
    .map((i) => ({ type: String(i.type || 'text'), ac: String(i.getAttribute('autocomplete') || ''), mode: String(i.getAttribute('inputmode') || ''),
      nom: [i.name, i.id, i.getAttribute('data-testid'), i.getAttribute('aria-label'), i.placeholder].filter(Boolean).join(' ').slice(0, 200),
      max: i.maxLength > 0 ? i.maxLength : null }));
  const texte = champs.length ? String((document.body && document.body.innerText) || '').slice(0, 4000) : '';
  return { hote: location.hostname, champs, texte };
})()`;

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
export function lireCodeDemande(v) {
  if (!v || typeof v !== 'object' || !Array.isArray(v.champs) || !v.champs.length) return null;
  const texte = String(v.texte ?? '');
  const parleDuCode = MOT_CODE.test(texte);
  const champs = v.champs.filter((c) => c && typeof c === 'object' && !EXCLUS.test(String(c.nom ?? '')) && !/^(password|email)$/i.test(String(c.type ?? '')));
  const numerique = (c) => /^(numeric|decimal)$/i.test(String(c.mode ?? '')) || /^(tel|number)$/i.test(String(c.type ?? ''));
  const code = champs.filter((c) => String(c.ac ?? '').toLowerCase() === 'one-time-code'
    || NOM_CODE.test(` ${String(c.nom ?? '')}`)
    || (parleDuCode && numerique(c) && Number(c.max) >= 4 && Number(c.max) <= 8));
  // Les cases d'un chiffre (une par chiffre) : au moins 4, sur une page qui parle d'un code.
  const cases = champs.filter((c) => Number(c.max) === 1);
  if (!code.length && !(parleDuCode && cases.length >= 4)) return null;
  // Par où : d'abord les phrases qui parlent du code, sinon toute la page.
  const phrases = texte.split(/[\n.!?]+/).filter((p) => MOT_CODE.test(p)).join(' ');
  const canalDe = (t) => (APPLI.test(t) ? 'appli' : SMS.test(t) && !EMAIL.test(t) ? 'sms' : EMAIL.test(t) && !SMS.test(t) ? 'email'
    : EMAIL.test(t) && SMS.test(t) ? 'inconnu' : null);
  const canal = canalDe(phrases) ?? canalDe(texte) ?? 'inconnu';
  const tous = code.length ? code : cases;
  return { canal, chiffres: tous.some(numerique) || cases.length >= 4, hote: String(v.hote ?? '').toLowerCase() };
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
    expire: (qui, canal) => `Page closed: the ${qui} code wasn't entered in time. Open "Sign in" again when you have ${canal === 'sms' ? 'your phone and messages' : canal === 'email' ? 'your inbox' : 'your code'} at hand: ${qui} will send you a new code.`,
  },
});
