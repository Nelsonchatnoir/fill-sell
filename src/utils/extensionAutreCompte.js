// ── L'EXTENSION DE CE NAVIGATEUR TRAVAILLE POUR UN AUTRE COMPTE (15/10, P18) ──
// Cas Stéphanie : deux comptes Google, donc deux comptes FillSell — l'un avec
// ses 26 articles, l'autre vide. L'extension garde le compte auquel elle est
// rattachée : un AUTRE compte connecté sur fillsell.app ne la fait jamais
// basculer seule (garde du 03/09, incident Nadège) — le popup propose
// « Changer de compte FillSell ? », mais rien ne le disait dans l'app. Pire :
// « Synchroniser » parlait à l'extension de CE navigateur, qui relevait le
// dressing de SON compte, et l'app attendait un relevé qui n'arrivait jamais.
//
// LA PREUVE, sans rien changer à l'extension : elle répond dans CE navigateur
// (signal __fillsellExt), Chrome est donc ouvert et elle interroge le serveur
// toutes les 2 min — et pourtant aucun passage n'est noté pour CE compte
// depuis 6 min, ni au chargement, ni 3 min plus tard. Deux lectures de deux
// colonnes par ouverture de page, jamais en boucle ; une relecture au retour
// sur l'onglet (au plus une toutes les 30 s) pour éteindre l'alerte dès que la
// personne a basculé l'extension.
import { useEffect, useRef, useState } from 'react';
import { ecouterPresenceExtension, lireCapaciteSyncCompte } from './vintedSync';

export const SILENCE_AUTRE_COMPTE_MS = 6 * 60 * 1000;
export const ATTENTE_CONFIRMATION_MS = 3 * 60 * 1000;
const RELECTURE_MIN_MS = 30 * 1000;

/** Aucun passage de l'extension noté pour ce compte depuis SILENCE_AUTRE_COMPTE_MS (ou jamais). */
export function compteSansExtension(capacite) {
  if (!capacite || capacite.inconnu) return false; // lecture ratée : on ne conclut rien
  if (capacite.jamaisVue) return true;
  return capacite.vueIlYaMs != null && capacite.vueIlYaMs >= SILENCE_AUTRE_COMPTE_MS;
}

export function texteExtensionAutreCompte(lang, email) {
  const fr = lang !== 'en';
  const ici = email ? (fr ? ` Ici, tu es connecté(e) avec ${email}.` : ` Here, you are signed in as ${email}.`) : '';
  return {
    titre: fr ? "L'extension de ce navigateur n'est pas connectée à ce compte" : "This browser's extension isn't signed in to this account",
    texte: fr
      ? `Elle travaille sans doute pour un autre compte FillSell. Clique sur l'icône FillSell en haut à droite de Chrome : à « Changer de compte FillSell ? », choisis « Basculer l'extension ».${ici}`
      : `It is probably working for another FillSell account. Click the FillSell icon at the top right of Chrome: at “Switch FillSell account?”, choose “Switch the extension”.${ici}`,
  };
}

/**
 * true quand l'extension qui répond dans ce navigateur ne travaille pas pour
 * le compte connecté. Toujours false sur l'app native (aucune extension).
 */
export function useExtensionAutreCompte({ isNative, userId, onConstat = null }) {
  const [autre, setAutre] = useState(false);
  const constatRef = useRef(onConstat);
  constatRef.current = onConstat;
  useEffect(() => {
    if (isNative || !userId) return undefined;
    let vivant = true;
    let timer = null;
    let vue = false;
    let derniere = 0;
    const lire = async () => {
      derniere = Date.now();
      try { return await lireCapaciteSyncCompte(userId); } catch { return null; }
    };
    const stop = ecouterPresenceExtension(async () => {
      if (vue) return; // une seule vérification par ouverture de page
      vue = true;
      const c1 = await lire();
      if (!vivant || !compteSansExtension(c1)) return;
      timer = setTimeout(async () => {
        timer = null;
        const c2 = await lire();
        if (!vivant || !compteSansExtension(c2)) return;
        setAutre(true);
        try { constatRef.current?.(c2); } catch { /* jamais un point de panne */ }
      }, ATTENTE_CONFIRMATION_MS);
    });
    // Retour sur l'onglet : la personne vient peut-être de basculer l'extension.
    const relire = async () => {
      if (document.visibilityState !== 'visible' || Date.now() - derniere < RELECTURE_MIN_MS) return;
      const c = await lire();
      if (vivant && c && !c.inconnu) setAutre((avant) => (avant ? compteSansExtension(c) : avant));
    };
    document.addEventListener('visibilitychange', relire);
    window.addEventListener('focus', relire);
    return () => {
      vivant = false;
      stop();
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', relire);
      window.removeEventListener('focus', relire);
    };
  }, [isNative, userId]);
  return autre;
}
