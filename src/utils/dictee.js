// ═══════════════════════════════════════════════════════════════════════════
// LA DICTÉE DU STEPPER — enregistrer, faire transcrire, AJOUTER au champ
// (2026-09-25, Romain / voirememe, Chrome sur Mac)
// ═══════════════════════════════════════════════════════════════════════════
// LE CONSTAT. Écran « Publier », champ « Une précision pour la rédaction » :
// Romain touche le micro, Chrome allume son témoin de micro, le bouton passe
// sur « Stop »… et après « Stop » le champ reste VIDE, à chaque essai. Aucune
// trace chez nous : le micro passait par la reconnaissance vocale DU
// NAVIGATEUR (webkitSpeechRecognition), qui envoie le son aux serveurs de
// Google et ne nous dit rien. Et toute erreur était AVALÉE
// (`onerror = () => setMicActive(false)`) : « no-speech » (Chrome n'a pas
// l'accès système au micro sur Mac — le témoin s'allume mais le son est
// muet), « network » (service de Google injoignable), « not-allowed »… le
// bouton revenait au repos, sans un mot. Un micro qui fait semblant.
// Dans l'app iOS/Android, la même API existe à moitié (WebView) et ne rend
// rien non plus.
//
// LE CHOIX : LE MÊME CHEMIN PARTOUT. On enregistre (MediaRecorder, que
// savent faire Chrome, Edge, Safari, Firefox et les WebView iOS ≥ 14.5 /
// Android), puis NOTRE serveur transcrit (voice-transcribe, Whisper — le
// chemin éprouvé du micro de l'assistant et du Lens natif). Conséquences :
//   · la dictée marche là où l'enregistrement marche, et nulle part ailleurs :
//     sans MediaRecorder/getUserMedia, le micro ne s'affiche PAS ;
//   · chaque essai laisse une trace serveur (issue, mime, durée) ;
//   · chaque échec se DIT, avec ce qu'il faut faire.
// ⛔ Une dictée vide, refusée ou ratée ne touche JAMAIS au texte déjà tapé :
//    le texte transcrit s'AJOUTE, rien d'autre n'écrit dans le champ.

import { supabase, supabaseUrl, supabaseAnonKey } from '../lib/supabase';

const DUREE_MAX_MS = 60_000;      // une précision, pas un roman : on coupe à 1 min
const DUREE_MIN_MS = 500;         // en dessous, rien d'exploitable (Whisper hallucine)

/** Le navigateur sait-il ENREGISTRER du son ? Sinon, pas de micro affiché. */
export function dicteeDisponible() {
  try {
    return typeof window !== 'undefined'
      && typeof window.MediaRecorder === 'function'
      && typeof navigator !== 'undefined'
      && typeof navigator.mediaDevices?.getUserMedia === 'function';
  } catch {
    return false;
  }
}

/** Le format d'enregistrement : jamais explicite dans une WebView iOS (elle
 *  lève une exception même quand isTypeSupported dit oui — cf. App.jsx) ;
 *  ailleurs, un format que voice-transcribe accepte (webm, mp4). Firefox rend
 *  de l'ogg par défaut, refusé par le serveur : on lui demande du webm. */
export function formatEnregistrement(isNative) {
  if (isNative) return null;
  const MR = typeof window !== 'undefined' ? window.MediaRecorder : null;
  for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']) {
    try { if (MR?.isTypeSupported?.(t)) return t; } catch { /* essai suivant */ }
  }
  return null;
}

const estMac = () => {
  try { return /Mac|iPhone|iPad/i.test(navigator.userAgent || '') && !/Android/i.test(navigator.userAgent || ''); } catch { return false; }
};

/** Le message d'un refus d'accès au micro, dit simplement, avec le geste. */
export function messageAccesMicro(err, fr = true, isNative = false) {
  const nom = String(err?.name || '');
  if (nom === 'NotAllowedError' || nom === 'SecurityError' || nom === 'PermissionDeniedError') {
    if (isNative) {
      return fr
        ? "Le micro est bloqué pour FillSell : autorise-le dans les réglages de ton téléphone, puis réessaie."
        : 'The microphone is blocked for FillSell: allow it in your phone settings, then try again.';
    }
    return fr
      ? "Le micro est bloqué pour fillsell.app : autorise-le (icône à gauche de l'adresse, en haut du navigateur), puis réessaie."
      : 'The microphone is blocked for fillsell.app: allow it (icon left of the address bar), then try again.';
  }
  if (nom === 'NotFoundError' || nom === 'OverconstrainedError' || nom === 'DevicesNotFoundError') {
    return fr ? 'Aucun micro trouvé sur cet appareil.' : 'No microphone found on this device.';
  }
  if (nom === 'NotReadableError' || nom === 'TrackStartError' || nom === 'AbortError') {
    return fr
      ? 'Le micro est déjà utilisé par une autre application : ferme-la, puis réessaie.'
      : 'The microphone is already in use by another app: close it, then try again.';
  }
  return fr ? "Le micro n'a pas pu s'ouvrir — réessaie." : "The microphone couldn't start — try again.";
}

/** Rien entendu : on dit quoi vérifier, sans accuser personne. */
export function messageRienEntendu(fr = true, isNative = false) {
  const base = fr ? "Je n'ai rien entendu dans cet enregistrement." : "I couldn't hear anything in that recording.";
  if (!isNative && estMac()) {
    return fr
      ? `${base} Sur Mac, vérifie que ton navigateur a accès au micro : Réglages Système › Confidentialité et sécurité › Micro. Puis réessaie.`
      : `${base} On a Mac, check that your browser can use the microphone: System Settings › Privacy & Security › Microphone. Then try again.`;
  }
  return fr ? `${base} Parle près du micro, puis réessaie.` : `${base} Speak close to the microphone, then try again.`;
}

/**
 * Démarre une dictée. Rend un contrôleur { arreter(), annuler() } ou null si
 * le micro n'a pas pu s'ouvrir (le message a alors été donné).
 *   · onEtat('ecoute' | 'transcription' | 'repos')
 *   · onTexte(texte)  — seulement avec un texte NON VIDE
 *   · onMessage(texte | null) — une phrase à afficher sous le champ
 * `transcrire` est injectable pour les tests (par défaut : voice-transcribe).
 */
export async function demarrerDictee({ lang = 'fr', isNative = false, onEtat, onTexte, onMessage, transcrire = transcrireAudio } = {}) {
  const fr = lang !== 'en';
  const etat = (e) => { try { onEtat?.(e); } catch { /* affichage seulement */ } };
  const dire = (m) => { try { onMessage?.(m); } catch { /* affichage seulement */ } };
  if (!dicteeDisponible()) {
    dire(fr ? "La dictée n'est pas disponible dans ce navigateur." : 'Dictation is not available in this browser.');
    etat('repos');
    return null;
  }
  let flux;
  try {
    flux = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    console.warn('[dictée] accès micro refusé :', err?.name, err?.message);
    dire(messageAccesMicro(err, fr, isNative));
    etat('repos');
    return null;
  }
  const format = formatEnregistrement(isNative);
  const Enregistreur = window.MediaRecorder;
  let enreg;
  try {
    enreg = format ? new Enregistreur(flux, { mimeType: format }) : new Enregistreur(flux);
  } catch {
    try { enreg = new Enregistreur(flux); } catch (err) {
      flux.getTracks().forEach((t) => t.stop());
      console.warn("[dictée] enregistreur impossible à créer :", err?.message ?? err);
      dire(fr ? "Ce navigateur n'arrive pas à enregistrer le son — la dictée n'y est pas disponible." : "This browser can't record audio — dictation isn't available here.");
      etat('repos');
      return null;
    }
  }
  const morceaux = [];
  const debut = Date.now();
  let annule = false;
  enreg.ondataavailable = (e) => { if (e?.data && e.data.size > 0) morceaux.push(e.data); };
  const minuteur = setTimeout(() => { try { if (enreg.state === 'recording') enreg.stop(); } catch { /* déjà arrêté */ } }, DUREE_MAX_MS);
  enreg.onstop = async () => {
    clearTimeout(minuteur);
    try { flux.getTracks().forEach((t) => t.stop()); } catch { /* déjà libéré */ }
    if (annule) { etat('repos'); return; }
    const duree = Date.now() - debut;
    const mime = String(enreg.mimeType || format || 'audio/mp4').split(';')[0] || 'audio/mp4';
    const audio = new Blob(morceaux, { type: mime });
    if (!audio.size || duree < DUREE_MIN_MS) {
      dire(fr ? 'Enregistrement trop court : touche le micro, parle, puis touche « Stop ».' : 'Recording too short: tap the mic, speak, then tap “Stop”.');
      etat('repos');
      return;
    }
    etat('transcription');
    try {
      const r = await transcrire({ audio, mime, lang: fr ? 'fr' : 'en', dureeMs: duree });
      const texte = String(r?.texte ?? '').trim();
      if (texte) { dire(null); onTexte?.(texte); }
      else if (r?.erreur) dire(r.erreur);
      else dire(messageRienEntendu(fr, isNative));
    } catch (err) {
      console.warn('[dictée] transcription impossible :', err?.message ?? err);
      dire(fr ? "La dictée n'a pas pu joindre le serveur — vérifie ta connexion et réessaie. Ton texte n'a pas été touché." : "Dictation couldn't reach the server — check your connection and try again. Your text wasn't touched.");
    } finally {
      etat('repos');
    }
  };
  try {
    enreg.start();
  } catch (err) {
    clearTimeout(minuteur);
    flux.getTracks().forEach((t) => t.stop());
    console.warn("[dictée] démarrage de l'enregistrement refusé :", err?.message ?? err);
    dire(fr ? "L'enregistrement n'a pas pu démarrer — réessaie." : "Recording couldn't start — try again.");
    etat('repos');
    return null;
  }
  dire(null);
  etat('ecoute');
  return {
    arreter() { try { if (enreg.state !== 'inactive') enreg.stop(); } catch { /* déjà arrêté */ } },
    annuler() { annule = true; try { if (enreg.state !== 'inactive') enreg.stop(); } catch { /* déjà arrêté */ } },
  };
}

/** L'envoi à voice-transcribe (le chemin du micro de l'assistant et du Lens natif). */
export async function transcrireAudio({ audio, mime, lang, dureeMs }) {
  const { data: { session } = {} } = await supabase.auth.getSession();
  const jeton = session?.access_token;
  if (!jeton) {
    return { erreur: lang === 'en' ? 'Your session has expired: sign in again, then try again.' : 'Ta session a expiré : reconnecte-toi, puis réessaie.' };
  }
  const ext = (mime.split('/')[1] || 'webm').replace('mpeg', 'mp3');
  const fd = new FormData();
  fd.append('audio', audio, `dictee.${ext}`);
  fd.append('lang', lang);
  fd.append('duree_ms', String(Math.max(0, Math.round(dureeMs || 0))));
  const res = await fetch(`${supabaseUrl}/functions/v1/voice-transcribe`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jeton}`, apikey: supabaseAnonKey },
    body: fd,
  });
  const json = await res.json().catch(() => ({}));
  if (json?.text) return { texte: String(json.text) };
  const fr = lang !== 'en';
  if (res.status === 429 || json?.error === 'quota_exceeded') {
    return { erreur: fr ? 'Tu as atteint ta limite de dictées pour aujourd’hui — tu peux écrire ta précision au clavier.' : "You've reached today's dictation limit — you can type your note instead." };
  }
  if (res.status === 415) {
    return { erreur: fr ? "Ce navigateur enregistre dans un format que la dictée ne lit pas encore — écris ta précision au clavier." : "This browser records in a format dictation can't read yet — type your note instead." };
  }
  if (res.status === 503 || json?.error === 'ai_unavailable') {
    return { erreur: fr ? 'La transcription est momentanément indisponible — réessaie dans un instant.' : 'Transcription is briefly unavailable — try again in a moment.' };
  }
  if (res.status === 401) {
    return { erreur: fr ? 'Ta session a expiré : reconnecte-toi, puis réessaie.' : 'Your session has expired: sign in again, then try again.' };
  }
  // voice-transcribe rend un message HUMAIN et localisé quand il filtre un
  // enregistrement inexploitable (hallucination) : on l'affiche tel quel.
  if (json?.filtered && typeof json?.error === 'string') return { erreur: json.error };
  if (res.ok) return { texte: '' };
  return { erreur: fr ? "La transcription a échoué — réessaie. Ton texte n'a pas été touché." : "Transcription failed — try again. Your text wasn't touched." };
}

/** Ajoute le texte dicté APRÈS ce qui est déjà écrit — jamais à la place. */
export function ajouterDictee(existant, dicte) {
  const a = String(existant ?? '');
  const b = String(dicte ?? '').trim();
  if (!b) return a;
  if (!a.trim()) return b;
  return `${a.replace(/\s+$/, '')} ${b}`;
}
