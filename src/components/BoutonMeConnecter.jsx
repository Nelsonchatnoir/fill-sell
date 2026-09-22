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
import { MOTIFS, NOMS_PLATEFORME, estWeb, lienWeb, useDemandeConnexion } from '../utils/connexionPlateformes';
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
    oplaSurWeb: "Opla s'autorise depuis FillSell dans Chrome : clique sur l'icône FillSell, puis sur « Autoriser Opla ».",
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
    oplaSurWeb: 'Opla is allowed from FillSell in Chrome: click the FillSell icon, then “Autoriser Opla”.',
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
function phraseMur(lang, platform, motif) {
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

  // ══ SUR LE WEB, C'EST UN LIEN. RIEN D'AUTRE. ════════════════════════════
  // (2026-09-22, correction de cap) L'app tourne DANS le navigateur qui porte
  // la session : on ouvre la page de connexion dans un onglet, tout de suite.
  // Aucune file, aucune demande en base, aucune attente d'un paquet Chrome Web
  // Store. La file reste le chemin du MOBILE, et d'elle seule — sur un
  // téléphone, ouvrir Vinted ne connecterait pas l'ordinateur.
  // ⚠️ Détection par Capacitor, JAMAIS par la largeur d'écran : un navigateur
  //    étroit reste un navigateur.
  const web = estWeb();
  // ⛔ eBay PAS CONNECTÉ garde sa pop-up à deux voies, même sur le web : c'est
  //    là que se choisit « site » ou « API », et l'API est la voie recommandée.
  //    Filer droit au lien escamoterait le choix.
  const ebayDeuxVoies = platform === 'ebay' && motif === MOTIFS.CONNEXION;
  const lien = web && !ebayDeuxVoies ? lienWeb(platform, motif) : null;
  // Opla sur le web : son mur est une PERMISSION D'HÔTE Chrome. Un lien ne peut
  // pas l'accorder — seul un geste dans le popup de l'extension le peut. On dit
  // donc où cliquer, on ne prétend pas le faire.
  const oplaSurWeb = web && (platform === 'opla' || motif === MOTIFS.AUTORISER_OPLA);

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

  // Le même dessin pour un <a> et un <button> : la personne voit un bouton,
  // pas une technologie.
  const habit = (inerte) => ({
    minHeight: 44, padding: '0 16px', borderRadius: 22, border: `1px solid ${UI.border}`,
    background: UI.card, color: UI.ink, fontFamily: 'inherit', fontSize: 14, fontWeight: 600,
    display: 'inline-flex', alignItems: 'center', gap: 9, flexShrink: 0,
    textDecoration: 'none', cursor: inerte ? 'default' : 'pointer',
    opacity: inerte ? 0.6 : 1, transition: 'opacity .15s ease',
  });
  const dedans = (texte) => (<><PlatformLogo platform={platform} size={20} /><span>{texte}</span></>);

  const bouton = lien ? (
    // ⛔ `rel="noopener noreferrer"` : un onglet ouvert par nous ne doit pas
    //    pouvoir revenir sur notre fenêtre, et la plateforme n'a pas à savoir
    //    d'où vient la personne.
    <a
      href={lien} target="_blank" rel="noopener noreferrer" className="rg-focus"
      onClick={() => { if (onOuverte) setTimeout(onOuverte, 1500); }}
      style={habit(false)}
    >
      {dedans(libelle(t, platform, motif))}
    </a>
  ) : (
    <button
      type="button"
      onClick={etat === 'muette' || etat === 'refusee' || etat === 'trop_vieille' ? () => { reinitialiser(); auClic(); } : auClic}
      disabled={enVol || etat === 'ouverte'}
      className="rg-focus"
      style={habit(enVol || etat === 'ouverte')}
    >
      {dedans(enVol ? t.enCours
        : etat === 'muette' || etat === 'refusee' || etat === 'trop_vieille' ? t.reessayer
        : libelle(t, platform, motif))}
    </button>
  );

  // Opla sur le web : pas de bouton qui mentirait, la consigne exacte.
  const corps = oplaSurWeb
    ? <Etat texte={t.oplaSurWeb} ton="info" />
    : (<>{bouton}{messageEtat && <Etat texte={messageEtat} ton={etat} />}</>);

  return (
    <>
      {variante === 'bouton' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, ...style }}>{corps}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, ...style }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ flex: 1, minWidth: 180, fontSize: 13.5, lineHeight: 1.5, color: UI.mute2 }}>
              {phraseMur(lang, platform, motif)}
            </span>
            {!oplaSurWeb && bouton}
          </div>
          {oplaSurWeb ? <Etat texte={t.oplaSurWeb} ton="info" />
            : messageEtat && <Etat texte={messageEtat} ton={etat} />}
        </div>
      )}

      {modaleEbay && (
        <ModaleEbayDeuxVoies
          t={t}
          busyApi={busyApi}
          // Sur le web, « Me connecter sur eBay » est un lien direct ; sur
          // mobile, il passe par l'ordinateur comme le reste.
          lienSite={web ? lienWeb('ebay', MOTIFS.CONNEXION) : null}
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
function ModaleEbayDeuxVoies({ t, onSite, onApi, onFermer, busyApi, lienSite }) {
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
        {/* Sur le WEB, la voie « site » est un lien direct — instantane, aucune file. */}
        <VoieEbay titre={t.ebaySite} sous={t.ebaySiteSous} onClick={onSite} lien={lienSite} onLien={onFermer} />

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

function VoieEbay({ titre, sous, onClick, principal = false, disabled = false, libelleEnCours, lien = null, onLien }) {
  const Balise = lien ? "a" : "button";
  const propres = lien
    ? { href: lien, target: "_blank", rel: "noopener noreferrer", onClick: onLien }
    : { type: "button", onClick, disabled };
  return (
    <Balise
      {...propres} className="rg-focus"
      style={{
        textDecoration: "none",
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
    </Balise>
  );
}
