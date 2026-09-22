// ═══════════════════════════════════════════════════════════════════════════
// « ME CONNECTER » — UN SEUL BOUTON, LES CINQ PLATEFORMES (2026-09-22)
// ═══════════════════════════════════════════════════════════════════════════
// Le mur nº1 des nouveaux inscrits : une plateforme pas connectée, un job qui
// meurt, et rien à cliquer. Ce composant EST le geste, et il est le même
// partout — carte d'article bloquée, Réglages › Mes plateformes, étape de
// publication. Un seul endroit à corriger, un seul rendu à regarder.
//
// ⛔ ON N'AFFIRME QUE CE QU'ON A MESURÉ. Ce composant ne décide JAMAIS qu'une
//    plateforme est déconnectée : il reçoit `motif` de l'appelant, qui le tient
//    d'une détection prouvée (etatSession === 'ko', mur serveur déjà reconnu,
//    needs_user_source='opla_acces'). « Jamais vérifié » n'affiche rien — mieux
//    vaut laisser passer que bloquer quelqu'un qui est connecté.
//
// ⛔ AUCUN TEXTE DE DÉVELOPPEUR. Pas d'URL, pas de code, pas de « dans le même
//    Chrome ». Le téléphone pilote, l'ordinateur exécute — et on le dit comme
//    ça, sans expliquer le navigateur à personne.
import { useState } from 'react';
import PlatformLogo from './platform-logos/PlatformLogo';
import { UI } from './ui';
import { MOTIFS, NOMS_PLATEFORME, useDemandeConnexion } from '../utils/connexionPlateformes';
import { demarrerConnexionEbay, ouvrirConsentementEbay } from '../utils/ebayCompte';

const T = {
  fr: {
    meConnecter: 'Me connecter',
    meReconnecter: 'Me reconnecter',
    autoriser: 'Autoriser Opla',
    ouvrirEbay: 'Ouvrir eBay',
    // Les phrases d'état — courtes, rassurantes, jamais culpabilisantes.
    pasConnecte: (n) => `Tu n'es pas connecté à ${n} sur ton ordinateur.`,
    reauth: 'eBay te demande une reconnexion de sécurité pour vendre.',
    vendeur: "Ton compte eBay n'est pas encore prêt pour vendre.",
    oplaAcces: "Opla attend ton autorisation pour que FillSell puisse y déposer.",
    enCours: 'On ouvre…',
    ouverte: (n) => `La page de connexion ${n} s'est ouverte sur ton ordinateur.`,
    ouvertePopup: 'La fenêtre FillSell s\'est ouverte sur ton ordinateur : appuie sur « Autoriser Opla ».',
    ouverteEbayVendeur: "La page d'inscription vendeur eBay s'est ouverte sur ton ordinateur.",
    muette: 'Ton ordinateur ne répond pas. Ouvre Chrome, puis réessaie.',
    tropVieille: 'Ton ordinateur met FillSell à jour. Réessaie dans un moment.',
    refusee: "On n'a pas pu envoyer la demande. Réessaie dans un instant.",
    reessayer: 'Réessayer',
    // eBay, les deux voies
    ebayTitre: 'Connecter eBay',
    ebayIntro: 'Deux façons, au choix.',
    ebaySite: 'Me connecter sur eBay',
    ebaySiteSous: 'Ouvre eBay sur ton ordinateur pour t’y connecter.',
    ebayApi: 'Connecter par API',
    ebayApiSous: 'Se fait depuis ce téléphone, en une fois. Recommandé.',
    fermer: 'Fermer',
  },
  en: {
    meConnecter: 'Sign in',
    meReconnecter: 'Sign in again',
    autoriser: 'Allow Opla',
    ouvrirEbay: 'Open eBay',
    pasConnecte: (n) => `You're not signed in to ${n} on your computer.`,
    reauth: 'eBay is asking you to sign in again to sell.',
    vendeur: 'Your eBay account is not ready to sell yet.',
    oplaAcces: 'Opla is waiting for your permission so FillSell can list there.',
    enCours: 'Opening…',
    ouverte: (n) => `The ${n} sign-in page opened on your computer.`,
    ouvertePopup: 'The FillSell window opened on your computer: tap “Autoriser Opla”.',
    ouverteEbayVendeur: 'The eBay seller registration page opened on your computer.',
    muette: 'Your computer is not responding. Open Chrome, then try again.',
    tropVieille: 'Your computer is updating FillSell. Try again shortly.',
    refusee: "We couldn't send the request. Try again in a moment.",
    reessayer: 'Try again',
    ebayTitre: 'Connect eBay',
    ebayIntro: 'Two ways, your choice.',
    ebaySite: 'Sign in on eBay',
    ebaySiteSous: 'Opens eBay on your computer so you can sign in.',
    ebayApi: 'Connect with API',
    ebayApiSous: 'Done from this phone, in one go. Recommended.',
    fermer: 'Close',
  },
};

/** Le libellé du bouton, par motif. */
function libelle(t, platform, motif) {
  if (motif === MOTIFS.AUTORISER_OPLA) return t.autoriser;
  if (motif === MOTIFS.VENDEUR_EBAY) return t.ouvrirEbay;
  if (motif === MOTIFS.REAUTH_EBAY) return t.meReconnecter;
  return t.meConnecter;
}

/** La phrase qui explique POURQUOI le bouton est là. */
export function phraseMur(lang, platform, motif) {
  const t = T[lang === 'en' ? 'en' : 'fr'];
  if (motif === MOTIFS.AUTORISER_OPLA) return t.oplaAcces;
  if (motif === MOTIFS.VENDEUR_EBAY) return t.vendeur;
  if (motif === MOTIFS.REAUTH_EBAY) return t.reauth;
  return t.pasConnecte(NOMS_PLATEFORME[platform] ?? platform);
}

/**
 * @param {string} platform  vinted | leboncoin | beebs | ebay | opla
 * @param {string} motif     MOTIFS.* — l'appelant le tient d'une détection prouvée
 * @param {'ligne'|'bouton'} variante  ligne = logo + phrase + bouton ; bouton = le bouton seul
 */
export default function BoutonMeConnecter({
  userId, platform, motif = MOTIFS.CONNEXION, lang = 'fr',
  variante = 'ligne', onOuverte, style,
}) {
  const t = T[lang === 'en' ? 'en' : 'fr'];
  const { etat, demander, reinitialiser } = useDemandeConnexion({ userId });
  const [modaleEbay, setModaleEbay] = useState(false);
  const [busyApi, setBusyApi] = useState(false);

  const nom = NOMS_PLATEFORME[platform] ?? platform;
  const enVol = etat === 'demande';

  const lancer = async (motifEffectif = motif) => {
    const r = await demander(platform, motifEffectif);
    if (r?.ok && onOuverte) onOuverte();
  };

  const auClic = () => {
    // eBay PAS CONNECTÉ → les deux voies, côte à côte. Une reconnexion de
    // sécurité, elle, passe TOUJOURS par le site : l'API n'y peut rien.
    if (platform === 'ebay' && motif === MOTIFS.CONNEXION) { setModaleEbay(true); return; }
    lancer();
  };

  // ── La voie API : le parcours OAuth EXISTANT, pas un second ──────────────
  // ⛔ On ne touche pas à ebay_voie_api ici : c'est le retour d'OAuth qui
  //    l'active, une fois le consentement réellement donné. Ouvrir la page ne
  //    prouve rien.
  const connecterParApi = async () => {
    setBusyApi(true);
    try {
      const { url } = await demarrerConnexionEbay();
      if (url) await ouvrirConsentementEbay(url);
      setModaleEbay(false);
    } catch { /* l'écran eBay des Réglages porte le détail ; ici on reste sobre */ }
    finally { setBusyApi(false); }
  };

  const messageEtat =
    etat === 'ouverte'
      ? (motif === MOTIFS.AUTORISER_OPLA ? t.ouvertePopup
        : motif === MOTIFS.VENDEUR_EBAY ? t.ouverteEbayVendeur
        : t.ouverte(nom))
      : etat === 'muette' ? t.muette
      : etat === 'trop_vieille' ? t.tropVieille
      : etat === 'refusee' ? t.refusee
      : null;

  const bouton = (
    <button
      type="button"
      onClick={etat === 'muette' || etat === 'refusee' || etat === 'trop_vieille' ? () => { reinitialiser(); auClic(); } : auClic}
      disabled={enVol || etat === 'ouverte'}
      className="rg-focus"
      style={{
        minHeight: 44, padding: '0 16px', borderRadius: 22, border: `1px solid ${UI.border}`,
        background: UI.card, color: UI.ink, fontFamily: 'inherit', fontSize: 14, fontWeight: 600,
        display: 'inline-flex', alignItems: 'center', gap: 9, flexShrink: 0,
        cursor: enVol || etat === 'ouverte' ? 'default' : 'pointer',
        opacity: enVol || etat === 'ouverte' ? 0.6 : 1,
        transition: 'opacity .15s ease',
      }}
    >
      <PlatformLogo platform={platform} size={20} />
      <span>
        {enVol ? t.enCours
          : etat === 'muette' || etat === 'refusee' || etat === 'trop_vieille' ? t.reessayer
          : libelle(t, platform, motif)}
      </span>
    </button>
  );

  return (
    <>
      {variante === 'bouton' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, ...style }}>
          {bouton}
          {messageEtat && <Etat texte={messageEtat} ton={etat} />}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, ...style }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ flex: 1, minWidth: 180, fontSize: 13.5, lineHeight: 1.5, color: UI.mute2 }}>
              {phraseMur(lang, platform, motif)}
            </span>
            {bouton}
          </div>
          {messageEtat && <Etat texte={messageEtat} ton={etat} />}
        </div>
      )}

      {modaleEbay && (
        <ModaleEbayDeuxVoies
          t={t}
          busyApi={busyApi}
          onSite={() => { setModaleEbay(false); lancer(MOTIFS.CONNEXION); }}
          onApi={connecterParApi}
          onFermer={() => setModaleEbay(false)}
        />
      )}
    </>
  );
}

function Etat({ texte, ton }) {
  const alerte = ton === 'muette' || ton === 'refusee' || ton === 'trop_vieille';
  return (
    <div
      role="status"
      style={{
        fontSize: 12.5, lineHeight: 1.5, padding: '8px 11px', borderRadius: 10,
        color: alerte ? UI.ink : UI.mute2,
        background: alerte ? 'rgba(197,124,110,.10)' : 'rgba(45,106,95,.08)',
        border: `1px solid ${alerte ? 'rgba(197,124,110,.28)' : 'rgba(45,106,95,.20)'}`,
      }}
    >
      {texte}
    </div>
  );
}

// ── eBay : DEUX VOIES, DITES EN UNE LIGNE CHACUNE ──────────────────────────
// ⛔ La voie API réutilise le parcours OAuth existant (demarrerConnexionEbay +
//    ouvrirConsentementEbay, utils/ebayCompte) — le même que la section eBay
//    des Réglages et que l'écran d'entrée. Pas de second parcours.
function ModaleEbayDeuxVoies({ t, onSite, onApi, onFermer, busyApi }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onFermer}
      style={{
        position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(16,20,19,.46)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 440, background: UI.card, borderRadius: 20,
          border: `1px solid ${UI.border}`, padding: 20,
          display: 'flex', flexDirection: 'column', gap: 14,
          boxShadow: '0 18px 48px rgba(16,20,19,.22)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <PlatformLogo platform="ebay" size={26} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: UI.ink }}>{t.ebayTitre}</div>
            <div style={{ fontSize: 12.5, color: UI.mute2 }}>{t.ebayIntro}</div>
          </div>
        </div>

        <VoieEbay
          titre={t.ebayApi} sous={t.ebayApiSous} principal
          onClick={onApi} disabled={busyApi} libelleEnCours="…"
        />
        <VoieEbay titre={t.ebaySite} sous={t.ebaySiteSous} onClick={onSite} />

        <button
          type="button" onClick={onFermer} className="rg-focus"
          style={{
            minHeight: 40, border: 'none', background: 'transparent', color: UI.mute2,
            fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
          }}
        >
          {t.fermer}
        </button>
      </div>
    </div>
  );
}

function VoieEbay({ titre, sous, onClick, principal = false, disabled = false, libelleEnCours }) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled} className="rg-focus"
      style={{
        textAlign: 'left', padding: '13px 15px', borderRadius: 14, cursor: disabled ? 'default' : 'pointer',
        fontFamily: 'inherit', opacity: disabled ? 0.6 : 1,
        border: principal ? 'none' : `1px solid ${UI.border}`,
        background: principal ? `linear-gradient(120deg,${UI.teal},${UI.tealDeep ?? UI.teal})` : UI.canvas,
        color: principal ? '#fff' : UI.ink,
        display: 'flex', flexDirection: 'column', gap: 3,
      }}
    >
      <span style={{ fontSize: 14.5, fontWeight: 700 }}>{disabled ? libelleEnCours ?? titre : titre}</span>
      <span style={{ fontSize: 12.5, lineHeight: 1.45, opacity: principal ? 0.9 : 1, color: principal ? '#fff' : UI.mute2 }}>
        {sous}
      </span>
    </button>
  );
}
