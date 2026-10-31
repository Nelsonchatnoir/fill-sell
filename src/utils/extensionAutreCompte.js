// ── L'EXTENSION DE CE NAVIGATEUR TRAVAILLE POUR UN AUTRE COMPTE (15/10, P18) ──
// Cas Stéphanie : deux comptes Google, donc deux comptes FillSell — l'un avec
// ses 26 articles, l'autre vide. L'extension garde le compte auquel elle est
// rattachée : un AUTRE compte connecté sur fillsell.app ne la fait jamais
// basculer seule (garde du 03/09, incident Nadège) — le popup propose
// « Changer de compte FillSell ? », mais rien ne le disait dans l'app. Pire :
// « Synchroniser » parlait à l'extension de CE navigateur, qui relevait le
// dressing de SON compte, et l'app attendait un relevé qui n'arrivait jamais.
//
// ⛔ (31/10, lot F) « AUTRE COMPTE » SEULEMENT SUR PREUVE. La règle du 15/10
// concluait « autre compte » d'un SILENCE : l'extension répond dans ce
// navigateur, et aucun passage noté pour ce compte depuis 6 min (puis 3 min
// plus tard). Faux chez Johan (son extension pinguait, entre deux longs cycles,
// 4 alertes du 30 au 31/10), chez Sébastien (service worker muet après sa mise
// à jour), nicolas.menar, sos.cuisine : la présence est annoncée par le pont de
// la page, qui répond même quand le service worker est muet. Désormais :
//   · le pont (extension ≥ 0.6.162) demande au service worker pour QUEL compte
//     il travaille et le dit (`__fillsellCompte` : vivant, meme) — seul
//     « meme: false » allume l'alerte « autre compte » (jamais l'identité de
//     l'autre compte) ;
//   · un silence (aucun passage depuis 6 min, confirmé 3 min plus tard) sans
//     cette preuve donne l'état « muette » : « Ton ordinateur ne répond pas »,
//     dans « À régler », sans durée et sans bandeau ;
//   · une extension plus ancienne (pas de `__fillsellCompte`) ne peut plus
//     déclencher « autre compte » : au pire, l'état « muette ».
// Deux lectures de deux colonnes par ouverture de page, jamais en boucle ; une
// relecture au retour sur l'onglet (au plus une toutes les 30 s).
import { useEffect, useRef, useState } from 'react';
import { ecouterPresenceExtension, lireCapaciteSyncCompte, pinguerExtension } from './vintedSync';

export const SILENCE_AUTRE_COMPTE_MS = 6 * 60 * 1000;
export const ATTENTE_CONFIRMATION_MS = 3 * 60 * 1000;
const RELECTURE_MIN_MS = 30 * 1000;

/** Aucun passage de l'extension noté pour ce compte depuis SILENCE_AUTRE_COMPTE_MS (ou jamais). */
export function compteSansExtension(capacite) {
  if (!capacite || capacite.inconnu) return false; // lecture ratée : on ne conclut rien
  if (capacite.jamaisVue) return true;
  return capacite.vueIlYaMs != null && capacite.vueIlYaMs >= SILENCE_AUTRE_COMPTE_MS;
}

/** La preuve « autre compte » : l'extension de ce navigateur dit travailler pour un AUTRE compte. */
export function prouveAutreCompte(compte) {
  return Boolean(compte && compte.vivant === true && compte.meme === false);
}

/**
 * L'état à montrer, pur (testable) : 'autre_compte' (preuve) | 'muette' (silence confirmé) | null.
 * `compte` : la dernière réponse du pont (`__fillsellCompte`) ou null ; `silenceConfirme` : deux lectures
 * silencieuses à 3 min d'écart. Le silence n'est JAMAIS « autre compte ».
 */
export function etatExtensionDuNavigateur({ compte = null, silenceConfirme = false } = {}) {
  if (prouveAutreCompte(compte)) return 'autre_compte';
  // L'extension dit travailler pour CE compte et son service worker répond : le silence se lève tout seul
  // (la demande réveille la veille du poll) — rien à dire tant que la relecture ne le confirme pas.
  if (silenceConfirme) return 'muette';
  return null;
}

export function texteExtensionAutreCompte(lang, email) {
  const fr = lang !== 'en';
  const ici = email ? (fr ? ` Ici, tu es connecté(e) avec ${email}.` : ` Here, you are signed in as ${email}.`) : '';
  return {
    titre: fr ? "L'extension de ce navigateur n'est pas connectée à ce compte" : "This browser's extension isn't signed in to this account",
    texte: fr
      ? `Elle travaille pour un autre compte FillSell. Clique sur l'icône FillSell en haut à droite de Chrome : à « Changer de compte FillSell ? », choisis « Basculer l'extension ».${ici}`
      : `It is working for another FillSell account. Click the FillSell icon at the top right of Chrome: at “Switch FillSell account?”, choose “Switch the extension”.${ici}`,
  };
}

/** (31/10, lot F) L'extension de ce navigateur ne donne plus de nouvelles : un état clair, sans durée. */
export function texteExtensionMuette(lang) {
  const fr = lang !== 'en';
  return {
    titre: fr ? 'Ton ordinateur ne répond pas' : "Your computer isn't responding",
    texte: fr
      ? "L'extension FillSell de ce navigateur ne donne plus de nouvelles. Tes publications reprennent dès qu'elle répond. Si rien ne bouge, ferme complètement Chrome puis rouvre-le."
      : "This browser's FillSell extension has stopped checking in. Your listings resume as soon as it answers. If nothing changes, fully close Chrome and open it again.",
  };
}

/**
 * { autreCompte, muette } pour l'extension qui répond dans ce navigateur.
 * Toujours { false, false } sur l'app native (aucune extension).
 * onConstat({ etat: 'autre_compte' | 'muette', capacite, compte }) : une fois par état et par page.
 */
export function useExtensionAutreCompte({ isNative, userId, onConstat = null }) {
  const [etat, setEtat] = useState(null);
  const constatRef = useRef(onConstat);
  constatRef.current = onConstat;
  useEffect(() => {
    if (isNative || !userId) return undefined;
    let vivant = true;
    let timer = null;
    let vue = false;
    let derniere = 0;
    let compte = null;
    let silence = false;
    const dits = new Set();
    const publier = (capacite = null) => {
      if (!vivant) return;
      const e = etatExtensionDuNavigateur({ compte, silenceConfirme: silence });
      setEtat(e);
      if (e && !dits.has(e)) {
        dits.add(e);
        try { constatRef.current?.({ etat: e, capacite, compte }); } catch { /* jamais un point de panne */ }
      }
    };
    const lire = async () => {
      derniere = Date.now();
      try { return await lireCapaciteSyncCompte(userId); } catch { return null; }
    };
    // La réponse du pont (extension ≥ 0.6.162) : pour quel compte elle travaille.
    const surCompte = (e) => {
      if (e.source !== window || !e.data?.__fillsellCompte) return;
      compte = e.data.__fillsellCompte;
      publier();
    };
    window.addEventListener('message', surCompte);
    const stop = ecouterPresenceExtension(async () => {
      if (vue) return; // une seule vérification par ouverture de page
      vue = true;
      const c1 = await lire();
      if (!vivant || !compteSansExtension(c1)) return;
      timer = setTimeout(async () => {
        timer = null;
        pinguerExtension(); // redemande le compte et réveille la veille du poll de l'extension
        const c2 = await lire();
        if (!vivant || !compteSansExtension(c2)) return;
        silence = true;
        publier(c2);
      }, ATTENTE_CONFIRMATION_MS);
    });
    // Retour sur l'onglet : la personne vient peut-être de basculer l'extension, ou l'ordinateur répond de nouveau.
    const relire = async () => {
      if (document.visibilityState !== 'visible' || Date.now() - derniere < RELECTURE_MIN_MS) return;
      pinguerExtension();
      const c = await lire();
      if (!vivant || !c || c.inconnu) return;
      if (silence && !compteSansExtension(c)) { silence = false; publier(); }
    };
    document.addEventListener('visibilitychange', relire);
    window.addEventListener('focus', relire);
    return () => {
      vivant = false;
      stop();
      if (timer) clearTimeout(timer);
      window.removeEventListener('message', surCompte);
      document.removeEventListener('visibilitychange', relire);
      window.removeEventListener('focus', relire);
    };
  }, [isNative, userId]);
  return { autreCompte: etat === 'autre_compte', muette: etat === 'muette' };
}
