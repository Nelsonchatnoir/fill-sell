// ═══════════════════════════════════════════════════════════════════════════
// L'ÉCRAN « ME CONNECTER » — l'option FillSell Cloud (05/10)
// ═══════════════════════════════════════════════════════════════════════════
// Un bouton par plateforme. Il mène UNIQUEMENT à la page de connexion de la
// plateforme, ouverte dans le navigateur FillSell du compte (sa place, son
// adresse française dédiée), au format du téléphone : pas de barre d'adresse,
// pas de navigation libre (le serveur refuse tout le reste), pas de zoom.
// eBay a sa ligne à lui : la connexion OFFICIELLE d'eBay (API), jamais ce
// navigateur. Les plateformes proposées viennent de config/cloudOffer.js
// (seulement celles prouvées en réel).
//
// Monté par App derrière cloudConnexionVisible() : drapeau baissé et aucun
// témoin = jamais rendu, jamais une requête.
import { useCallback, useEffect, useRef, useState } from 'react';
// (01/11) UN PORTAIL SUR document.body : ouvert depuis Réglages (portail sur body, z-index 400), l'écran rendu dans
// `.app-root` restait DERRIÈRE sur iPhone (WKWebView peint les couches fixes de `.app-root` dans sa couche, z-index ou
// pas) — « Connecter mes plateformes » ne faisait rien, sans trace (19:38, iPhone de Nico). Même règle que
// FinEssaiCloud et les réglages eux-mêmes : une couche qu'on ouvre depuis Réglages vit sur body.
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { tracerCloud, auPremierPlan } from './traceCloud';
import { CLOUD_PLATEFORMES_CONNEXION } from '../config/cloudOffer';
import { avancementConnexions, textesConnexionsCloud, bilanFermetureMeConnecter, phraseRefusDeCompte } from './connexionsCloud';

// (03/11, flotte) L'ADRESSE DU SERVEUR DU COMPTE : plusieurs serveurs Cloud, chacun son adresse (cloud-2.fillsell.app…).
// Lue une fois par session (cloud_serveur_moi, qui attribue un serveur si besoin) ; illisible, absente ou hors de
// *.fillsell.app → AUCUNE adresse : la connexion se reprend comme une coupure (reprendre, borné), puis « coupée ».
// (07/11, décision de Nico, voie b) Plus de repli sur cloud.fillsell.app : ce nom n'a plus de serveur (cloud-1 supprimé),
// son enregistrement DNS est retiré. Rien ne part pour un compte ordinaire : cet écran n'est monté que derrière
// cloudConnexionVisible().
// (19/11/2026 soir, ordre de Nico — cliente 0909a787, 17:00) L'ÉCRAN DE CONNEXION PASSE TOUJOURS AU PREMIER PLAN.
// Ouvert tout seul (« auto ») pendant qu'une feuille du Cloud animée était montrée (Feuille de FinEssaiCloud, z-index 9990),
// il restait DERRIÈRE (z-index 1100 ; trace cloud_me_connecter_cache, devant = div fs-cloud-anime) : la cliente l'a fermé
// sans le voir. Il vit au-dessus de TOUTE autre couche de l'app (web, iPhone, Android) : Z_CONNEXION_CLOUD est le plus haut
// z-index de src/ (verrou selftest:cloud-connexion-premier-plan, qui relit tous les z-index du code).
export const Z_CONNEXION_CLOUD = 30000;
const DOMAINE_CLOUD_PERMIS = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.fillsell\.app$/;
let domaineLu = null;
const domaineCloudValide = (d) => (typeof d === 'string' && DOMAINE_CLOUD_PERMIS.test(d) ? d : null);
async function domaineCloudDuCompte() {
  if (domaineLu) return domaineLu;
  try {
    const { data, error } = await supabase.rpc('cloud_serveur_moi');
    const d = !error && domaineCloudValide(data?.domaine);
    if (d) { domaineLu = d; return d; }
  } catch { /* illisible : aucune adresse */ }
  return null;
}
import { ouvrirConnexion } from './connexion/clientConnexion';
// (14/11/2026, cliente 13e274de) L'automate de la page : remplacée pendant qu'on ne la regardait pas = pause, jamais une fin.
import { creerSuiviVue } from './connexion/suiviVue';
// (14/11/2026) Un téléphone en « version ordinateur » (Firefox, Chrome, Edge…) : la page de connexion y est minuscule.
import { modeOrdinateur } from './connexion/modeOrdinateur';
import { lireEtatEbay, ebayVoieApiDuCompte, demarrerConnexionEbay, ouvrirConsentementEbay } from '../utils/ebayCompte';
import { textesConnexion, bandeauFournisseur } from './textesConnexion';
import { C, BLANC, MENTHE, DEGRADE_TEAL, POLICE } from './theme';
// (30/10, lot D) L'état de chaque connexion (connecté / à reconnecter) et de l'exécutant (en marche, dernière action).
import { etatConnexion, phraseExecutant, executantArrete, quandParis, verificationsCloud, connectesIsoles } from './executant';

// (01/11) « ferme » n'est plus une fin : la connexion coupée sans « Fermer » (app quittée pour lire un SMS ou un
// courriel) reprend au retour, sur la MÊME page (le serveur l'a gardée, connexion.js REPRISE_MS).
// (02/11) « Résoudre la vérification » : ses fins à elle (résolue, revenue, rien à glisser, session fermée, rien à résoudre).
// (09/11/2026 soir, cliente d813639b) 'remplacee' : une autre page de connexion du compte s'est ouverte (autre appareil,
// autre onglet) — cette page s'arrête et ne se rouvre JAMAIS toute seule (clientConnexion.js, FERMETURES_VOULUES).
// (15/11/2026, cliente 13e274de) « Payer sur Leboncoin » (mode 'payer') : ses fins à elle (payé, page fermée, rien à payer).
const ETAPES_FINALES = ['connecte', 'refuse', 'inactif', 'non_autorise', 'expire', 'erreur', 'resolu', 'revenue', 'restreint', 'session_fermee', 'rien', 'remplacee', 'paye', 'page_fermee', 'rien_a_payer'];
export const REPRISES_MAX = 6;

// (02/11) `verif` : la plateforme attend une vérification du navigateur Cloud ('a_resoudre' : le bouton « Résoudre la
// vérification » ; 'restreint' / 'revenue' : rien à faire, aucun bouton) — elle passe avant « à reconnecter ».
function Ligne({ nom, connecte, libelle, onClick, T, texte = null, aReconnecter = false, sansBouton = false, verif = null }) {
  if (verif) {
    return <Ligne nom={nom} connecte={false} aReconnecter T={{ ...T, aReconnecter: T.verifEtat[verif] }} texte={T.verifLigne[verif]}
      libelle={{ aConnecter: T.verifEtat[verif], faire: T.resoudre }} onClick={onClick} sansBouton={verif !== 'a_resoudre'} />;
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: BLANC, border: `1px solid ${C.border}`, borderRadius: 14 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, color: C.ink, fontSize: 15.5 }}>{nom}</div>
        <div style={{ fontSize: 13, color: connecte ? C.tealDeep : C.mute2, marginTop: 2 }}>
          <span aria-hidden="true" style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, marginRight: 6, background: connecte ? C.teal : aReconnecter ? C.amber : C.faint }} />
          {connecte ? (libelle?.connecte ?? T.connecte) : aReconnecter ? T.aReconnecter : (libelle?.aConnecter ?? T.aConnecter)}
        </div>
        {texte && <div style={{ fontSize: 12.5, color: C.mute, marginTop: 4, lineHeight: 1.4 }}>{texte}</div>}
      </div>
      {/* (02/11, Nico : « Connecté » avec « Me reconnecter » à côté fait croire à un problème) Connectée : aucun bouton
          principal, un lien discret « Changer de compte ». « Me reconnecter » seulement quand elle est déconnectée. */}
      {!sansBouton && connecte && <button type="button" onClick={onClick} data-cloud-bouton="changer" style={{
        flexShrink: 0, minHeight: 40, padding: '8px 4px', border: 'none', background: 'none', color: C.mute2,
        fontWeight: 500, fontSize: 12.5, textDecoration: 'underline', textUnderlineOffset: 3,
      }}>{libelle?.refaire ?? T.changerCompte}</button>}
      {!sansBouton && !connecte && <button type="button" onClick={onClick} data-cloud-bouton={libelle?.faire === T.resoudre ? 'resoudre' : undefined} style={{
        flexShrink: 0, minHeight: 40, padding: '9px 14px', borderRadius: 11, fontWeight: 700, fontSize: 14,
        border: 'none', background: DEGRADE_TEAL, color: BLANC,
      }}>{libelle?.faire ?? (aReconnecter ? T.reconnecter : T.meConnecter)}</button>}
    </div>
  );
}

/**
 * (19/11/2026, client Cloud 8fd44622 — décision de Nico) LE BANDEAU « MOT DE PASSE GOOGLE » de la page de connexion : la
 * page est chez Google (« Se connecter avec Google ») — c'est le mot de passe du compte GOOGLE qu'il faut taper, pas celui
 * de la plateforme ; « Me connecter avec mon e-mail <Plateforme> » ramène la page à la connexion de la plateforme (serveur :
 * revenirPlateforme). Par-dessus le haut de la page comme le bandeau du code (jamais un décalage), replié par « Compris ».
 * Exporté pour le verrou (selftest:cloud-connexion-fournisseur). Fournisseur inconnu : rien.
 */
export function BandeauFournisseur({ fournisseur, nomPlateforme, lang, replie = false, onReplier, onVoir, onRevenir }) {
  const b = bandeauFournisseur(lang, fournisseur, nomPlateforme);
  if (!b) return null;
  const T = textesConnexion(lang);
  if (replie) {
    return (
      <button type="button" data-cloud-bouton="fournisseur-voir" onClick={onVoir} style={{
        position: 'absolute', top: 8, right: 12, zIndex: 2, minHeight: 36, padding: '6px 12px', borderRadius: 18, border: `1.5px solid ${C.amber}`,
        background: BLANC, color: C.amberInk, fontWeight: 700, fontSize: 13, boxShadow: '0 2px 8px rgba(16,32,27,.12)',
      }}>{`${b.replie} · ${T.codeVoir}`}</button>
    );
  }
  return (
    <div role="alert" data-cloud-fournisseur={b.id} style={{
      position: 'absolute', top: 8, left: 12, right: 12, zIndex: 2, maxWidth: 516, margin: '0 auto', padding: '10px 12px',
      borderRadius: 12, border: `1.5px solid ${C.amber}`, background: BLANC, boxShadow: '0 4px 14px rgba(16,32,27,.16)',
    }}>
      <div style={{ fontWeight: 700, color: C.amberInk, fontSize: 14.5 }}>{b.titre}</div>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, marginTop: 4, lineHeight: 1.4 }}>{b.texte}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
        <button type="button" data-cloud-bouton="fournisseur-compris" onClick={onReplier} style={{
          minHeight: 36, padding: '6px 14px', borderRadius: 10, border: `1px solid ${C.border}`, background: BLANC, color: C.ink, fontWeight: 600, fontSize: 13.5,
        }}>{T.codeCompris}</button>
        <button type="button" data-cloud-bouton="revenir-plateforme" onClick={onRevenir} style={{
          minHeight: 36, padding: '6px 14px', borderRadius: 10, border: 'none', background: DEGRADE_TEAL, color: BLANC, fontWeight: 700, fontSize: 13.5,
        }}>{b.revenir}</button>
      </div>
    </div>
  );
}

/** (02/11) La vue d'une page du navigateur Cloud : « Me connecter », ou (mode 'resoudre') la page où la vérification
 *  s'affiche — exportée pour le bandeau (BandeauCloudReconnexion), qui l'ouvre directement. */
// (15/11/2026, cliente 13e274de) mode 'payer' + `job` : la page « Valider et payer » d'un dépôt Leboncoin préparé par le
// Cloud (EcranForfaitLbc, « Payer sur Leboncoin ») — la personne clique elle-même, FillSell ne clique jamais.
export function Vue({ userId, plateforme, nom, lang, onFermer, mode = null, job = null }) {
  const resoudre = mode === 'resoudre';
  const marque = resoudre || mode === 'payer' ? { mode } : {};
  const T = textesConnexion(lang);
  const conteneur = useRef(null);
  const session = useRef(null);
  const [message, setMessage] = useState('');
  const [clavier, setClavier] = useState(false);
  // (02/11) Un bandeau de cookies est affiché dans la page : la personne peut le refuser d'ici.
  const [cookies, setCookies] = useState(false);
  // (15/11/2026, cliente af37fa49 — Kiabi : « un code par e-mail » jamais dit) La page demande un code : son bandeau
  // ({ titre, texte, canal, qui } du serveur, codeConnexion.js), replié par « Compris », rouvert par « Voir ».
  const [code, setCode] = useState(null);
  const [codeReplie, setCodeReplie] = useState(false);
  const codeTrace = useRef(false);
  // (19/11/2026, client Cloud 8fd44622) La page est chez Google ({ nom, plateforme } du serveur) : le bandeau « mot de passe
  // Google », replié par « Compris », rouvert par « Voir » ; tracé une fois par passage chez Google.
  const [fournisseur, setFournisseur] = useState(null);
  const [fournisseurReplie, setFournisseurReplie] = useState(false);
  const fournisseurTrace = useRef(false);
  const [finie, setFinie] = useState(false);
  // (14/11/2026, cliente 13e274de) Remplacée pendant qu'on ne la regardait pas (autre onglet, autre appli, autre écran) :
  // en PAUSE, jamais une fin — « Continuer ici » la reprend là où elle en était (suiviVue.js).
  const [ailleurs, setAilleurs] = useState(false);
  const continuer = useRef(null);
  // (01/11) Le compte lu par le serveur : connecté, mais la page reste pour les étapes de la plateforme.
  const [verifiee, setVerifiee] = useState(false);
  const verifieeRef = useRef(false);

  useEffect(() => {
    let mort = false;
    let tracee = false;   // (01/11) une seule ligne « fin » par connexion
    let reprises = 0;
    let arreterAttente = null;
    const fin = (etape, m) => {
      if (tracee) return;
      tracee = true;
      tracerCloud(userId, 'cloud_connexion_fin', { plateforme, etape, message: String(m ?? '').slice(0, 200), ...marque });
    };
    // (14/11/2026, cliente 13e274de) L'automate de la page (suiviVue.js) : une page remplacée sous les yeux de la personne
    // finit (09/11, cliente d813639b : jamais de reprise toute seule) ; remplacée pendant qu'elle ne la regardait pas, elle
    // se met en pause, et seul un toucher (« Continuer ici ») la reprend.
    const suivi = creerSuiviVue({
      finales: ETAPES_FINALES,
      visible: typeof document === 'undefined' || document.visibilityState === 'visible',
      agir: {
        clavier: (v) => setClavier(v),
        cookies: (v) => setCookies(v),
        code: (c) => {
          setCode(c);
          if (!c) { setCodeReplie(false); codeTrace.current = false; return; }
          // Une ligne par code demandé (jamais à chaque rappel du serveur : reprise, geste après l'avertissement).
          if (!codeTrace.current) { codeTrace.current = true; tracerCloud(userId, 'cloud_connexion_code_vu', { plateforme, canal: c.canal ?? null, qui: c.qui ?? null }); }
        },
        fournisseur: (f) => {
          setFournisseur(f);
          if (!f) { setFournisseurReplie(false); fournisseurTrace.current = false; return; }
          if (!fournisseurTrace.current) { fournisseurTrace.current = true; tracerCloud(userId, 'cloud_connexion_fournisseur_vu', { plateforme, fournisseur: f.nom ?? null }); }
        },
        message: (m) => setMessage(m),
        verifiee: () => {
          if (verifieeRef.current) return;
          verifieeRef.current = true;
          setVerifiee(true);
          tracerCloud(userId, 'cloud_connexion_verifiee', { plateforme });
        },
        fin: (etape, m) => {
          setFinie(true);
          setCode(null);
          setFournisseur(null);
          if (etape === 'remplacee') setMessage(T.remplacee);
          fin(etape, m);
        },
        pause: (par) => {
          setAilleurs(true);
          setClavier(false);
          setCode(null);
          setFournisseur(null);
          setMessage(T.ailleurs);
          tracerCloud(userId, 'cloud_connexion_ailleurs', { plateforme, par, ...marque });
        },
        reprendre: () => { if (!mort) reprendre(); },
        fermerApres: () => setTimeout(() => onFermer(true), 1800),
      },
    });
    const surVisibilite = () => suivi.visibilite(document.visibilityState === 'visible');
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', surVisibilite);
    const ouvrir = async () => {
      const { data: { session: s } } = await supabase.auth.getSession();
      // (03/11, flotte) Le serveur du compte. (07/11) Aucun : reprise bornée, comme une connexion coupée.
      const domaine = await domaineCloudDuCompte();
      if (mort || !conteneur.current) return;
      // (19/11/2026) Une nouvelle connexion (reprise, « Continuer ici ») : le serveur redit Google s'il y est encore.
      setFournisseur(null);
      if (!domaine) { if (!suivi.finale) reprendre(); return; }
      const cette = ouvrirConnexion({
        // (09/11 soir) `reprise` : une reprise automatique ne remplace jamais une autre page ouverte (le serveur la refuse).
        url: `wss://${domaine}/connexion/ws`, jeton: s?.access_token ?? null, plateforme, conteneur: conteneur.current, lang, mode, reprise: reprises > 0, job,
        // (09/11 soir, cliente d813639b) Fermée EXPRÈS par le serveur (une autre page l'a remplacée) : jamais reprise toute
        // seule. (14/11) Fin si la personne la regardait, pause sinon — l'automate décide (suiviVue.js). Seule la connexion
        // EN COURS parle : un message tardif d'une connexion d'avant (reprise, « Continuer ici ») ne touche plus l'écran.
        surEtat: (etape, m, info) => { if (!mort && session.current === cette) suivi.etape(etape, m, info); },
      });
      session.current = cette;
    };
    // (14/11/2026) « Continuer ici » : un TOUCHER — reprise: false, le serveur reprend la page (connexion.js, reprenable)
    // pour cet écran, là où elle en était ; l'autre écran l'apprend et suit la même règle.
    continuer.current = () => {
      if (mort || !suivi.continuerIci()) return;
      reprises = 0;
      setAilleurs(false);
      setMessage('');
      tracerCloud(userId, 'cloud_connexion_continuer_ici', { plateforme, ...marque });
      ouvrir().catch((e) => fin('erreur_client', e?.message ?? e));
    };
    // (01/11) La connexion coupée sans « Fermer » : reprise dès que l'app est de nouveau devant (iOS coupe tout en
    // arrière-plan), au plus REPRISES_MAX fois, de plus en plus espacées si le serveur ne répond pas.
    const reprendre = () => {
      if (reprises >= REPRISES_MAX) {
        suivi.terminer(); setFinie(true); setMessage(T.coupee); fin('ferme', 'reprises_epuisees');
        return;
      }
      const relancer = () => {
        if (mort || suivi.finale || suivi.enPause) return;
        reprises += 1;
        tracerCloud(userId, 'cloud_connexion_reprise', { plateforme, n: reprises });
        ouvrir().catch((e) => fin('erreur_client', e?.message ?? e));
      };
      const delai = Math.min(8000, 500 * 2 ** reprises);
      if (typeof document === 'undefined' || document.visibilityState === 'visible') { setTimeout(relancer, delai); return; }
      const auRetour = () => {
        if (document.visibilityState !== 'visible') return;
        document.removeEventListener('visibilitychange', auRetour);
        arreterAttente = null;
        setTimeout(relancer, 300);
      };
      document.addEventListener('visibilitychange', auRetour);
      arreterAttente = () => document.removeEventListener('visibilitychange', auRetour);
    };
    tracerCloud(userId, 'cloud_connexion_ouverte', { plateforme, ...marque });
    ouvrir().catch((e) => fin('erreur_client', e?.message ?? e));
    return () => {
      mort = true; arreterAttente?.(); continuer.current = null;
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', surVisibilite);
      session.current?.fermer();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `marque` ne dépend que de `mode`
  }, [userId, plateforme, lang, onFermer, T.coupee, T.remplacee, T.ailleurs, mode, resoudre, job]);

  // (19/11/2026, client Cloud 8fd44622) « Me connecter avec mon e-mail <Plateforme> » : la page quitte Google et revient à
  // la connexion de la plateforme (le serveur ferme la fenêtre Google ; rien n'est tapé ni cliqué) ; le bandeau part.
  const revenirPlateforme = () => {
    tracerCloud(userId, 'cloud_connexion_revenir_plateforme', { plateforme, fournisseur: fournisseur?.nom ?? null });
    setFournisseur(null);
    session.current?.revenirPlateforme();
  };

  return (
    // (14/11/2026) translate="no" : la traduction du navigateur ne touche jamais la page de connexion (en plus de <html>).
    <div role="dialog" aria-modal="true" aria-label={`${T.titre} — ${nom}`} translate="no" className="notranslate" style={{
      position: 'fixed', inset: 0, zIndex: Z_CONNEXION_CLOUD + 1, background: C.canvas, display: 'flex', flexDirection: 'column',
      paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)', touchAction: 'none', fontFamily: POLICE,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px' }}>
        <div style={{ flex: 1, fontWeight: 700, color: C.ink, fontSize: 16 }}>{nom}</div>
        <button type="button" onClick={() => onFermer(verifieeRef.current)} style={{ minHeight: 40, padding: '8px 14px', borderRadius: 10, border: `1px solid ${C.border}`, background: BLANC, color: C.ink, fontWeight: 600 }}>{T.fermer}</button>
      </div>
      {/* (15/11/2026) Le bandeau du code se pose PAR-DESSUS le haut de la page (jamais un décalage : la taille de la page est
          prise à l'ouverture, une ligne de plus en bas la couperait) ; la ligne d'état garde sa hauteur. */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div ref={conteneur} style={{ flex: 1, minHeight: 0, width: '100%', maxWidth: 540, margin: '0 auto', overflow: 'hidden', background: BLANC }} />
        {!finie && !ailleurs && code && (codeReplie ? (
          <button type="button" data-cloud-bouton="code-voir" onClick={() => setCodeReplie(false)} style={{
            position: 'absolute', top: 8, right: 12, zIndex: 2, minHeight: 36, padding: '6px 12px', borderRadius: 18, border: `1px solid ${C.teal}`,
            background: MENTHE, color: C.tealDeep, fontWeight: 700, fontSize: 13, boxShadow: '0 2px 8px rgba(16,32,27,.12)',
          }}>{`✉︎ ${code.titre ?? ''} · ${T.codeVoir}`}</button>
        ) : (
          <div role="alert" data-cloud-code={code.canal ?? ''} style={{
            position: 'absolute', top: 8, left: 12, right: 12, zIndex: 2, maxWidth: 516, margin: '0 auto', padding: '10px 12px',
            borderRadius: 12, border: `1px solid ${C.teal}`, background: MENTHE, boxShadow: '0 4px 14px rgba(16,32,27,.16)',
          }}>
            <div style={{ fontWeight: 700, color: C.tealDeep, fontSize: 14.5 }}>{`✉︎ ${code.titre ?? ''}`}</div>
            <div style={{ fontSize: 13, color: C.ink, marginTop: 4, lineHeight: 1.4 }}>{code.texte ?? ''}</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
              <button type="button" data-cloud-bouton="code-compris" onClick={() => setCodeReplie(true)} style={{
                minHeight: 36, padding: '6px 14px', borderRadius: 10, border: 'none', background: DEGRADE_TEAL, color: BLANC, fontWeight: 700, fontSize: 13.5,
              }}>{T.codeCompris}</button>
            </div>
          </div>
        ))}
        {/* (19/11/2026, client Cloud 8fd44622) La page est chez Google : c'est le mot de passe GOOGLE qu'il faut taper, et la
            sortie vers l'e-mail de la plateforme. Le bandeau du code passe devant (l'étape du moment) ; jamais en
            « Résoudre » ni en « Payer ». */}
        {!finie && !ailleurs && !code && !resoudre && mode !== 'payer' && fournisseur && (
          <BandeauFournisseur fournisseur={fournisseur.nom} nomPlateforme={nom} lang={lang} replie={fournisseurReplie}
            onReplier={() => setFournisseurReplie(true)} onVoir={() => setFournisseurReplie(false)} onRevenir={revenirPlateforme} />
        )}
      </div>
      <p role="status" aria-live="polite" style={{ margin: 0, padding: '8px 16px', minHeight: 38, fontSize: 13.5, color: C.mute2 }}>{!finie && !ailleurs && code && message === code.texte ? '' : message}</p>
      {/* (02/11, essai Beebs de Nico : le bandeau Axeptio ne se fermait pas) Le refus, le choix le plus discret. */}
      {!finie && !ailleurs && cookies && (
        <div style={{ padding: '0 16px 6px' }}>
          <button type="button" data-cloud-bouton="cookies" onClick={() => session.current?.refuserCookies()} style={{
            width: '100%', minHeight: 40, borderRadius: 12, fontWeight: 600, border: `1px solid ${C.border}`, background: BLANC, color: C.ink,
          }}>{T.refuserCookies}</button>
        </div>
      )}
      {/* (14/11/2026, cliente 13e274de) En pause (la page continue sur un autre écran FillSell) : un seul geste, « Continuer
          ici », qui la reprend là où elle en était — jamais une reprise toute seule. */}
      {!finie && ailleurs && (
        <div style={{ display: 'flex', gap: 8, padding: '4px 16px 12px' }}>
          <button type="button" data-cloud-bouton="continuer-ici" onClick={() => continuer.current?.()} style={{
            flex: 1, minHeight: 44, borderRadius: 12, fontWeight: 700, border: 'none', background: DEGRADE_TEAL, color: BLANC,
          }}>{T.continuerIci}</button>
        </div>
      )}
      {!finie && !ailleurs && (
        <div style={{ display: 'flex', gap: 8, padding: '4px 16px 12px' }}>
          {/* (02/11) Résoudre : rien à écrire, on fait glisser. */}
          {!resoudre && <button type="button" onClick={() => session.current?.ecrire()} style={{
            flex: 1, minHeight: 44, borderRadius: 12, fontWeight: 700, border: clavier ? 'none' : `1px solid ${C.border}`,
            background: clavier ? DEGRADE_TEAL : BLANC, color: clavier ? BLANC : C.ink,
          }}>{T.ecrire}</button>}
          <button type="button" onClick={() => session.current?.termine()} style={{
            flex: 1, minHeight: 44, borderRadius: 12, fontWeight: 700, border: verifiee ? 'none' : `1px solid ${C.border}`,
            background: verifiee ? DEGRADE_TEAL : BLANC, color: verifiee ? BLANC : C.ink,
          }}>{T.fini}</button>
        </div>
      )}
    </div>
  );
}

/** (30/10, lot D) L'exécutant : en marche / en pause / erreur, sa dernière action, son dernier relevé. */
function EtatExecutant({ T, lang }) {
  const [e, setE] = useState(null);   // null = lecture ; 'echec' (migration absente, réseau) = rien d'affiché
  useEffect(() => {
    let mort = false;
    supabase.rpc('cloud_executant_moi').then(({ data, error }) => {
      if (mort) return;
      if (error) { setE('echec'); return; }
      // (01/11, 23:10) Arrêté pour de vrai (éteint, arrêt de l'essai, muet depuis 25 min) : lu ICI, l'heure mise en mots ici.
      const a = executantArrete({ cloudVoie: true, executant: data ?? {} });
      // (05/11 soir, point 5) Le poste se prépare (juste après le paiement) : « démarre », jamais « arrêté ».
      const demarre = a?.cause === 'demarrage';
      setE({ ...(data ?? {}), demarre, arretTexte: a && !demarre ? T.executantArreteTitre(a.depuis ? quandParis(a.depuis, Date.now(), lang) : null) : null });
    }, () => { if (!mort) setE('echec'); });
    return () => { mort = true; };
  }, [T, lang]);
  if (e === 'echec') return null;
  const brut = e ? phraseExecutant(e, { lang }) : null;
  // Arrêté pour de vrai : jamais « en pause, il repart dès qu'une tâche attend ».
  const p = e?.demarre ? { etat: 'demarrage', titre: T.executantDemarreTitre, detail: [T.executantDemarreTexte(false)] }
    : brut && e?.arretTexte ? { ...brut, etat: 'erreur', titre: e.arretTexte } : brut;
  const couleur = p?.etat === 'en_marche' || p?.etat === 'demarrage' ? C.teal : p?.etat === 'erreur' ? C.amberInk : C.faint;
  return (
    <section aria-live="polite" style={{ margin: '0 0 14px', padding: '12px 14px', borderRadius: 14, background: BLANC, border: `1px solid ${C.border}` }}>
      <div style={{ fontWeight: 700, color: C.ink, fontSize: 15 }}>{T.executantTitre}</div>
      {!p && <div style={{ fontSize: 13, color: C.mute2, marginTop: 4 }}>{T.executantLecture}</div>}
      {p && (
        <>
          <div style={{ fontSize: 13.5, color: C.ink, marginTop: 4 }}>
            <span aria-hidden="true" style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, marginRight: 6, background: couleur }} />
            {p.titre}
          </div>
          {p.detail.map((d) => <div key={d} style={{ fontSize: 12.5, color: C.mute2, marginTop: 4, lineHeight: 1.4 }}>{d}</div>)}
        </>
      )}
    </section>
  );
}

/**
 * @param {{ userId: string, lang?: string, onFermer: () => void }} p
 */
// (25/10) `plateformesFermees` (App.jsx) : Leboncoin d'une adresse de remise hors de France n'a pas de ligne.
// (08/11, urgent U1 de Nico) `choisies` : les plateformes choisies au parcours d'entrée (useConnexionsCloud) — seules
// elles s'affichent, une par une, avec l'avancement « 2 sur 4 connectées » ; vide = toutes celles du Cloud.
// `origine` : qui a ouvert l'écran (auto, retour_stripe, carte_tableau, carte_stock, synchroniser, reglages…), tracé.
export default function MeConnecterCloud({ userId, lang = 'fr', onFermer, plateformesFermees = [], choisies = null, origine = null, plateformeRefus = null }) {
  const T = textesConnexion(lang);
  const TA = textesConnexionsCloud(lang);
  const [etats, setEtats] = useState(null);   // null = lecture ; 'echec' ; objet
  const [ouverte, setOuverte] = useState(null);
  const [ebayRelie, setEbayRelie] = useState(null);
  // (02/11) Les plateformes en vérification du navigateur Cloud (platform_settings.<plateforme>.cloud_verification).
  const [verifs, setVerifs] = useState([]);
  // (02/11) Les plateformes connectées dans leur navigateur RÉSERVÉ (platform_settings.<pf>.cloud_isole) : jamais au coffre.
  const [isoles, setIsoles] = useState([]);

  const racine = useRef(null);
  const plateformesEcran = CLOUD_PLATEFORMES_CONNEXION.filter((p) => !plateformesFermees.includes(p.id) && (!Array.isArray(choisies) || !choisies.length || choisies.includes(p.id)));

  const relire = useCallback(() => {
    setEtats(null);
    supabase.rpc('cloud_coffre_etat_moi').then(({ data, error }) => {
      if (error) tracerCloud(userId, 'cloud_me_connecter_erreur', { etape: 'lecture_connexions', message: String(error.message ?? error).slice(0, 200) });
      setEtats(error ? 'echec' : (data ?? {}));
    }, (e) => {
      tracerCloud(userId, 'cloud_me_connecter_erreur', { etape: 'lecture_connexions', message: String(e?.message ?? e).slice(0, 200) });
      setEtats('echec');
    });
    // eBay : la connexion OFFICIELLE (API), jamais le navigateur Cloud.
    // (01/11, Nico : « il me redemande de me connecter alors que je suis relié par l'API ») ebay-account rend
    // { etat } : c'était l'enveloppe qui était lue (etat.connecte toujours absent) — eBay se disait « à relier »
    // pour tout le monde. La vue publique est dans `etat`, comme partout ailleurs (App.jsx, EbayCompteSection).
    lireEtatEbay().then((r) => setEbayRelie(ebayVoieApiDuCompte(r?.etat ?? null) === true), () => setEbayRelie(null));
    supabase.from('profiles').select('platform_settings, cloud_voie').eq('id', userId).maybeSingle().then(({ data }) => {
      setVerifs(verificationsCloud({ cloudVoie: data?.cloud_voie === true, platformSettings: data?.platform_settings ?? null, plateformes: CLOUD_PLATEFORMES_CONNEXION }));
      setIsoles(connectesIsoles(data?.platform_settings ?? null));
    }, () => { setVerifs([]); setIsoles([]); });
  }, [userId]);
  const relierEbay = useCallback(async () => {
    try { const { url } = await demarrerConnexionEbay(); if (url) await ouvrirConsentementEbay(url); }
    catch (e) { console.warn('[cloud] connexion eBay :', e?.message ?? e); }
  }, []);
  const ebay = ebayRelie === null ? null : { relie: ebayRelie, onRelier: relierEbay };
  useEffect(() => {
    if (!userId) return undefined;
    const t = setTimeout(relire, 0);   // la lecture part hors du rendu de l'effet
    return () => clearTimeout(t);
  }, [userId, relire]);
  // (01/11) L'écran est-il VRAIMENT devant ? Une ligne « ouvert » (visible ou non) ; si une autre couche le cache, ce
  // qu'on voit à sa place est noté (« cloud_me_connecter_cache ») : le bouton muet du 01/11 ne passerait plus inaperçu.
  // (14/11/2026, cliente 13e274de) Les deux seules lignes « cache » de la base disaient « html|notranslate » : l'élément
  // <html> de FillSell (sa classe notranslate), pas une traduction — Firefox Android en « version ordinateur », le test
  // visait le centre d'une fenêtre plus grande que l'écran. auPremierPlan vise désormais la partie visible de l'écran et
  // joint le contexte (traduite, fenêtre, couche, échelle) ; « ordinateur » dit la version ordinateur d'un téléphone.
  const [ordinateur] = useState(() => modeOrdinateur());
  useEffect(() => {
    const t = setTimeout(() => {
      const vu = auPremierPlan(racine.current, typeof document === 'undefined' ? null : document);
      tracerCloud(userId, 'cloud_me_connecter_ouvert', { visible: vu.visible, ...(origine ? { origine } : {}), ...(ordinateur ? { ordinateur: true } : {}) });
      if (!vu.visible) tracerCloud(userId, 'cloud_me_connecter_cache', { devant: vu.devant, ...vu.contexte, ordinateur });
      if (ordinateur) tracerCloud(userId, 'cloud_me_connecter_mode_ordinateur', { ...vu.contexte, ...(origine ? { origine } : {}) });
    }, 600);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- une trace par ouverture : `origine` ne change pas pendant que l'écran est ouvert
  }, [userId]);

  // (14/11/2026 soir, cliente af37fa49 — « Me connecter » de 17:49 ouvert sans connexion) Chaque toucher d'une ligne est
  // tracé, et la fermeture de l'écran dit sa durée et ce qui a été touché (connexionsCloud.bilanFermetureMeConnecter) :
  // « ouvert sans connexion » se LIT en base (aucune ligne touchée, ou une ligne touchée restée muette).
  const ouvertLe = useRef(Date.now());
  const touchees = useRef([]);
  const toucherLigne = (p, etat) => {
    touchees.current.push(p.id);
    tracerCloud(userId, 'cloud_me_connecter_ligne_clic', { plateforme: p.id, etat, ...(p.mode ? { mode: p.mode } : {}), ...(origine ? { origine } : {}) });
  };
  useEffect(() => () => {
    tracerCloud(userId, 'cloud_me_connecter_ferme', bilanFermetureMeConnecter({ ouvertLe: ouvertLe.current, fermeLe: Date.now(), touchees: touchees.current, origine }));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- une trace par fermeture : `origine` ne change pas pendant que l'écran est ouvert
  }, [userId]);

  const fermerVue = useCallback((connectee) => { setOuverte(null); if (connectee) relire(); }, [relire]);

  const couche = (
    // (14/11/2026) translate="no" : la traduction du navigateur ne touche jamais l'écran « Me connecter » (en plus de <html>).
    <div ref={racine} data-cloud-me-connecter="" translate="no" className="notranslate" role="dialog" aria-modal="true" aria-label={T.titre} style={{
      position: 'fixed', inset: 0, zIndex: Z_CONNEXION_CLOUD, background: C.canvas, overflowY: 'auto', fontFamily: POLICE,
      paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      <div style={{ maxWidth: 540, margin: '0 auto', padding: '14px 16px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <h2 style={{ flex: 1, margin: 0, fontSize: 20, color: C.ink }}>{T.titre}</h2>
          <button type="button" onClick={onFermer} style={{ minHeight: 40, padding: '8px 14px', borderRadius: 10, border: `1px solid ${C.border}`, background: BLANC, color: C.ink, fontWeight: 600 }}>{T.fermer}</button>
        </div>
        {/* (20/11/2026, ordre de Nico) Ouvert pour un REFUS du compte par une plateforme : la phrase dit laquelle, en tête,
            avant tout le reste (chaque ligne pouvait dire « Connecté » sans que rien ne nomme le refus). */}
        {origine === 'refus_compte' && plateformeRefus && phraseRefusDeCompte(plateformeRefus, lang) && (
          <p data-refus-compte="" role="alert" style={{ margin: '0 0 12px', padding: '10px 12px', borderRadius: 12, background: BLANC, border: `1.5px solid ${C.amber}`, color: C.amberInk, fontSize: 14, lineHeight: 1.5, fontWeight: 600 }}>
            {phraseRefusDeCompte(plateformeRefus, lang)}
          </p>
        )}
        {/* (14/11/2026, cliente 13e274de) Un téléphone en « version ordinateur » : la page de connexion y est minuscule (page
            dessinée à 980 px puis réduite). On le dit, avec le geste pour revenir à la version mobile. */}
        {ordinateur && (
          <p data-cloud-mode-ordinateur="" role="note" style={{ margin: '0 0 14px', padding: '10px 12px', borderRadius: 12, background: BLANC, border: `1.5px solid ${C.amber}`, color: C.amberInk, fontSize: 13.5, lineHeight: 1.5 }}>{T.modeOrdinateur}</p>
        )}
        <p style={{ margin: '0 0 14px', padding: '10px 12px', borderRadius: 12, background: MENTHE, color: C.tealDeep, fontSize: 13.5, lineHeight: 1.5 }}>{T.intro}</p>
        <EtatExecutant T={T} lang={lang} />
        {etats === null && <p style={{ color: C.mute2, fontSize: 14 }}>{T.lecture}</p>}
        {etats === 'echec' && <p style={{ color: C.amberInk, fontSize: 14 }}>{T.lectureEchec}</p>}
        {etats && etats !== 'echec' && (
          <div style={{ display: 'grid', gap: 10 }}>
            {etats && etats !== 'echec' && (() => {
              const a = avancementConnexions({ plateformes: plateformesEcran, etats, isoles });
              return a.total > 1 ? <p data-cloud-avancement="1" style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 700, color: a.toutes ? C.tealDeep : C.ink }}>{TA.avancement(a)}</p> : null;
            })()}
            {plateformesEcran.map((p) => {
              const verif = verifs.find((x) => x.id === p.id)?.etat ?? null;
              const isole = isoles.includes(p.id) && etatConnexion(etats?.[p.id]) !== 'connecte';
              return (
                <Ligne key={p.id} nom={p.nom} connecte={etatConnexion(etats?.[p.id]) === 'connecte' || isole} verif={verif}
                  texte={isole && !verif ? T.isoleTexte : null}
                  aReconnecter={etatConnexion(etats?.[p.id]) === 'a_reconnecter'} T={T}
                  onClick={() => { const q = verif === 'a_resoudre' ? { ...p, mode: 'resoudre' } : p; toucherLigne(q, verif ?? etatConnexion(etats?.[p.id])); setOuverte(q); }} />
              );
            })}
            {ebay && (
              // (01/11) Relié par l'API : rien à faire ici (aucun bouton, jamais le navigateur Cloud). Pas relié : la
              // connexion officielle d'eBay (ebay-oauth-start), jamais une page de connexion dans le navigateur Cloud.
              <Ligne nom={T.ebayTitre} connecte={ebay.relie} T={T} texte={ebay.relie ? T.ebayTexteRelie : T.ebayTexte}
                libelle={{ connecte: T.ebayRelie, faire: T.ebayRelier, refaire: T.ebayRelier }} onClick={() => { toucherLigne({ id: 'ebay' }, ebay.relie ? 'relie' : 'a_relier'); ebay.onRelier(); }} sansBouton={ebay.relie} />
            )}
          </div>
        )}
      </div>
      {ouverte && <Vue userId={userId} plateforme={ouverte.id} nom={ouverte.nom} lang={lang} onFermer={fermerVue} mode={ouverte.mode ?? null} />}
    </div>
  );
  // Rendu serveur (autotests) : pas de document, la couche se rend telle quelle ; dans l'app, sur document.body.
  return typeof document === 'undefined' ? couche : createPortal(couche, document.body);
}
