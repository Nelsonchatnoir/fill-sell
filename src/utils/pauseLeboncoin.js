// ═══════════════════════════════════════════════════════════════════════════
// LE BOUTON « LEBONCOIN REMARCHE » (03/11, point 6) — ce que l'app sait de la pause Leboncoin du compte
// ═══════════════════════════════════════════════════════════════════════════
// Le message de pause (_shared/blocage-leboncoin.js, messageBlocageLbc) dit depuis le 30/10 : « appuie sur « Leboncoin
// remarche » dans FillSell » — et ce bouton n'existait pas. Le serveur, lui, sait faire l'essai demandé : un
// `essai_demande_le` plus récent que la dernière preuve du blocage met le compte en « essai » (etatBlocageLbc) ; depuis
// le 03/11 (point 7), l'essai est UNE visite de contrôle (relevé, lecture seule), jamais une action — puis levée et
// reprise prudente, ou pause prolongée jusqu'à la visite suivante (2 h).
// Ici, la lecture PURE de platform_settings.leboncoin.blocage_acces pour le bandeau (BandeauLeboncoinPause).
// ⛔ Jamais d'écriture sans pause en cours : écrire `essai_demande_le` dans un blocage absent CRÉERAIT un blocage.

const objet = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
const ms = (v) => { const t = Date.parse(String(v ?? '')); return Number.isFinite(t) ? t : NaN; };

/**
 * L'état du bandeau : null (rien à montrer : pas de pause, ou pause levée — reprise prudente), sinon
 * { depuis, demande, sessionFermee } — demande = un essai déjà demandé que le serveur n'a pas encore tranché ;
 * sessionFermee = (07/11, Goulvenk) la dernière visite a vu la page de connexion (signe « session_fermee »,
 * _shared/blocage-leboncoin.js) : le bandeau dit « connecte-toi à Leboncoin », jamais « Leboncoin a restreint l'accès ».
 * @param {unknown} platformSettings
 */
export function pauseLeboncoin(platformSettings) {
  const b = objet(objet(objet(platformSettings)?.leboncoin)?.blocage_acces);
  if (!b || !b.depuis) return null;          // un blocage sans date de pose n'est pas une vraie pause : rien
  if (Number.isFinite(ms(b.leve_le))) return null;   // levé : reprise prudente, plus de pause à montrer
  const demande = ms(b.essai_demande_le);
  const preuve = ms(b.derniere_preuve) || ms(b.depuis) || 0;
  return { depuis: b.depuis, demande: Number.isFinite(demande) && demande > preuve, sessionFermee: String(b.signe ?? '') === 'session_fermee' };
}

/** Le patch de platform_settings_fusionner sur ['leboncoin', 'blocage_acces'] — seulement si la pause tient encore. */
export function patchEssaiDemande(platformSettings, maintenantIso = new Date().toISOString()) {
  const p = pauseLeboncoin(platformSettings);
  if (!p) return null;
  return { essai_demande_le: maintenantIso };
}

export const TEXTES_PAUSE_LBC = {
  fr: {
    titre: 'Leboncoin est en pause sur ton compte',
    texte: (depuis) => `Leboncoin a restreint l'accès depuis ta connexion${depuis ? ` (${depuis})` : ''} : FillSell a tout mis en pause sur Leboncoin pour ne pas aggraver le blocage. Ouvre leboncoin.fr dans ton navigateur : si la page s'affiche normalement, appuie sur « Leboncoin remarche ».`,
    titreSession: 'Connecte-toi à Leboncoin sur ton ordinateur',
    texteSession: (depuis) => `Ta session Leboncoin semble fermée${depuis ? ` (${depuis})` : ''} : FillSell attend ta connexion pour reprendre sur Leboncoin. Ouvre leboncoin.fr dans Chrome sur ton ordinateur, connecte-toi à ton compte, puis appuie sur « Leboncoin remarche ».`,
    bouton: 'Leboncoin remarche',
    demande: 'C\'est noté : au prochain passage de ton ordinateur, FillSell fait UNE visite de contrôle sur Leboncoin (une simple lecture, rien n\'est publié). Si Leboncoin répond normalement, ta file repart d\'elle-même, doucement ; sinon la pause continue et FillSell revérifiera seul, sans rien publier.',
    dejaDemande: 'Contrôle demandé : FillSell fait UNE visite de contrôle sur Leboncoin (une simple lecture) au prochain passage de ton ordinateur.',
    finie: 'Leboncoin n\'est plus en pause sur ton compte : rien à faire.',
    erreur: 'La demande n\'est pas passée. Réessaie dans un instant.',
    plusTard: 'Plus tard',
  },
  en: {
    titre: 'Leboncoin is paused on your account',
    texte: (depuis) => `Leboncoin restricted access from your connection${depuis ? ` (${depuis})` : ''}: FillSell paused everything on Leboncoin so the block doesn't get worse. Open leboncoin.fr in your browser: if the page shows normally, tap “Leboncoin works again”.`,
    titreSession: 'Log in to Leboncoin on your computer',
    texteSession: (depuis) => `Your Leboncoin session seems closed${depuis ? ` (${depuis})` : ''}: FillSell is waiting for you to log in before resuming on Leboncoin. Open leboncoin.fr in Chrome on your computer, log in to your account, then tap “Leboncoin works again”.`,
    bouton: 'Leboncoin works again',
    demande: 'Noted: on your computer\'s next check, FillSell makes ONE control visit to Leboncoin (a simple read, nothing is posted). If Leboncoin answers normally, your queue resumes on its own, gently; otherwise the pause goes on and FillSell will check again on its own, posting nothing.',
    dejaDemande: 'Check requested: FillSell makes ONE control visit to Leboncoin (a simple read) on your computer\'s next check.',
    finie: 'Leboncoin is no longer paused on your account: nothing to do.',
    erreur: 'The request did not go through. Try again in a moment.',
    plusTard: 'Later',
  },
};
