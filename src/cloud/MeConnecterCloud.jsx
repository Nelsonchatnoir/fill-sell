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
import { CLOUD_DOMAINE, CLOUD_PLATEFORMES_CONNEXION } from '../config/cloudOffer';

// (03/11, flotte) L'ADRESSE DU SERVEUR DU COMPTE : plusieurs serveurs Cloud, chacun son adresse (cloud-2.fillsell.app…).
// Lue une fois par session (cloud_serveur_moi, qui attribue un serveur si besoin) ; illisible, absente ou hors de
// *.fillsell.app → l'adresse d'avant (CLOUD_DOMAINE). Rien ne part pour un compte ordinaire : cet écran n'est monté que
// derrière cloudConnexionVisible().
const DOMAINE_CLOUD_PERMIS = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.fillsell\.app$/;
let domaineLu = null;
const domaineCloudValide = (d) => (typeof d === 'string' && DOMAINE_CLOUD_PERMIS.test(d) ? d : null);
async function domaineCloudDuCompte() {
  if (domaineLu) return domaineLu;
  try {
    const { data, error } = await supabase.rpc('cloud_serveur_moi');
    const d = !error && domaineCloudValide(data?.domaine);
    if (d) { domaineLu = d; return d; }
  } catch { /* repli */ }
  return CLOUD_DOMAINE;
}
import { ouvrirConnexion } from './connexion/clientConnexion';
import { lireEtatEbay, ebayVoieApiDuCompte, demarrerConnexionEbay, ouvrirConsentementEbay } from '../utils/ebayCompte';
import { textesConnexion } from './textesConnexion';
import { C, BLANC, MENTHE, DEGRADE_TEAL, POLICE } from './theme';
// (30/10, lot D) L'état de chaque connexion (connecté / à reconnecter) et de l'exécutant (en marche, dernière action).
import { etatConnexion, phraseExecutant, executantArrete, quandParis, verificationsCloud, connectesIsoles } from './executant';

// (01/11) « ferme » n'est plus une fin : la connexion coupée sans « Fermer » (app quittée pour lire un SMS ou un
// courriel) reprend au retour, sur la MÊME page (le serveur l'a gardée, connexion.js REPRISE_MS).
// (02/11) « Résoudre la vérification » : ses fins à elle (résolue, revenue, rien à glisser, session fermée, rien à résoudre).
const ETAPES_FINALES = ['connecte', 'refuse', 'inactif', 'non_autorise', 'expire', 'erreur', 'resolu', 'revenue', 'restreint', 'session_fermee', 'rien'];
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

/** (02/11) La vue d'une page du navigateur Cloud : « Me connecter », ou (mode 'resoudre') la page où la vérification
 *  s'affiche — exportée pour le bandeau (BandeauCloudReconnexion), qui l'ouvre directement. */
export function Vue({ userId, plateforme, nom, lang, onFermer, mode = null }) {
  const resoudre = mode === 'resoudre';
  const T = textesConnexion(lang);
  const conteneur = useRef(null);
  const session = useRef(null);
  const [message, setMessage] = useState('');
  const [clavier, setClavier] = useState(false);
  // (02/11) Un bandeau de cookies est affiché dans la page : la personne peut le refuser d'ici.
  const [cookies, setCookies] = useState(false);
  const [finie, setFinie] = useState(false);
  // (01/11) Le compte lu par le serveur : connecté, mais la page reste pour les étapes de la plateforme.
  const [verifiee, setVerifiee] = useState(false);
  const verifieeRef = useRef(false);

  useEffect(() => {
    let mort = false;
    let tracee = false;   // (01/11) une seule ligne « fin » par connexion
    let finale = false;
    let reprises = 0;
    let arreterAttente = null;
    const fin = (etape, m) => {
      if (tracee) return;
      tracee = true;
      tracerCloud(userId, 'cloud_connexion_fin', { plateforme, etape, message: String(m ?? '').slice(0, 200), ...(resoudre ? { mode: 'resoudre' } : {}) });
    };
    const ouvrir = async () => {
      const { data: { session: s } } = await supabase.auth.getSession();
      // (03/11, flotte) Le serveur du compte ; repli sur l'adresse d'avant (le nom masque l'import à dessein).
      const CLOUD_DOMAINE = await domaineCloudDuCompte();
      if (mort || !conteneur.current) return;
      session.current = ouvrirConnexion({
        url: `wss://${CLOUD_DOMAINE}/connexion/ws`, jeton: s?.access_token ?? null, plateforme, conteneur: conteneur.current, lang, mode,
        surEtat: (etape, m) => {
          if (etape === 'clavier') { setClavier(m === true); return; }
          if (etape === 'cookies') { setCookies(m === true); return; }
          if (etape === 'ferme') { if (!finale && !mort) reprendre(); return; }
          if (m) setMessage(m);
          if (etape === 'verifie' && !verifieeRef.current) {
            verifieeRef.current = true;
            setVerifiee(true);
            tracerCloud(userId, 'cloud_connexion_verifiee', { plateforme });
          }
          if (ETAPES_FINALES.includes(etape)) { finale = true; setFinie(true); fin(etape, m); }
          if (etape === 'connecte' || etape === 'resolu') setTimeout(() => onFermer(true), 1800);
        },
      });
    };
    // (01/11) La connexion coupée sans « Fermer » : reprise dès que l'app est de nouveau devant (iOS coupe tout en
    // arrière-plan), au plus REPRISES_MAX fois, de plus en plus espacées si le serveur ne répond pas.
    const reprendre = () => {
      if (reprises >= REPRISES_MAX) {
        finale = true; setFinie(true); setMessage(T.coupee); fin('ferme', 'reprises_epuisees');
        return;
      }
      const relancer = () => {
        if (mort || finale) return;
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
    tracerCloud(userId, 'cloud_connexion_ouverte', { plateforme, ...(resoudre ? { mode: 'resoudre' } : {}) });
    ouvrir().catch((e) => fin('erreur_client', e?.message ?? e));
    return () => { mort = true; arreterAttente?.(); session.current?.fermer(); };
  }, [userId, plateforme, lang, onFermer, T.coupee, mode, resoudre]);

  return (
    <div role="dialog" aria-modal="true" aria-label={`${T.titre} — ${nom}`} style={{
      position: 'fixed', inset: 0, zIndex: 1200, background: C.canvas, display: 'flex', flexDirection: 'column',
      paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)', touchAction: 'none', fontFamily: POLICE,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px' }}>
        <div style={{ flex: 1, fontWeight: 700, color: C.ink, fontSize: 16 }}>{nom}</div>
        <button type="button" onClick={() => onFermer(verifieeRef.current)} style={{ minHeight: 40, padding: '8px 14px', borderRadius: 10, border: `1px solid ${C.border}`, background: BLANC, color: C.ink, fontWeight: 600 }}>{T.fermer}</button>
      </div>
      <div ref={conteneur} style={{ flex: 1, minHeight: 0, width: '100%', maxWidth: 540, margin: '0 auto', overflow: 'hidden', background: BLANC }} />
      <p role="status" aria-live="polite" style={{ margin: 0, padding: '8px 16px', minHeight: 38, fontSize: 13.5, color: C.mute2 }}>{message}</p>
      {/* (02/11, essai Beebs de Nico : le bandeau Axeptio ne se fermait pas) Le refus, le choix le plus discret. */}
      {!finie && cookies && (
        <div style={{ padding: '0 16px 6px' }}>
          <button type="button" data-cloud-bouton="cookies" onClick={() => session.current?.refuserCookies()} style={{
            width: '100%', minHeight: 40, borderRadius: 12, fontWeight: 600, border: `1px solid ${C.border}`, background: BLANC, color: C.ink,
          }}>{T.refuserCookies}</button>
        </div>
      )}
      {!finie && (
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
      setE({ ...(data ?? {}), arretTexte: a ? T.executantArreteTitre(a.depuis ? quandParis(a.depuis, Date.now(), lang) : null) : null });
    }, () => { if (!mort) setE('echec'); });
    return () => { mort = true; };
  }, [T, lang]);
  if (e === 'echec') return null;
  const brut = e ? phraseExecutant(e, { lang }) : null;
  // Arrêté pour de vrai : jamais « en pause, il repart dès qu'une tâche attend ».
  const p = brut && e?.arretTexte ? { ...brut, etat: 'erreur', titre: e.arretTexte } : brut;
  const couleur = p?.etat === 'en_marche' ? C.teal : p?.etat === 'erreur' ? C.amberInk : C.faint;
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
export default function MeConnecterCloud({ userId, lang = 'fr', onFermer, plateformesFermees = [] }) {
  const T = textesConnexion(lang);
  const [etats, setEtats] = useState(null);   // null = lecture ; 'echec' ; objet
  const [ouverte, setOuverte] = useState(null);
  const [ebayRelie, setEbayRelie] = useState(null);
  // (02/11) Les plateformes en vérification du navigateur Cloud (platform_settings.<plateforme>.cloud_verification).
  const [verifs, setVerifs] = useState([]);
  // (02/11) Les plateformes connectées dans leur navigateur RÉSERVÉ (platform_settings.<pf>.cloud_isole) : jamais au coffre.
  const [isoles, setIsoles] = useState([]);

  const racine = useRef(null);

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
  useEffect(() => {
    const t = setTimeout(() => {
      const vu = auPremierPlan(racine.current, typeof document === 'undefined' ? null : document);
      tracerCloud(userId, 'cloud_me_connecter_ouvert', { visible: vu.visible });
      if (!vu.visible) tracerCloud(userId, 'cloud_me_connecter_cache', { devant: vu.devant });
    }, 600);
    return () => clearTimeout(t);
  }, [userId]);

  const fermerVue = useCallback((connectee) => { setOuverte(null); if (connectee) relire(); }, [relire]);

  const couche = (
    <div ref={racine} data-cloud-me-connecter="" role="dialog" aria-modal="true" aria-label={T.titre} style={{
      position: 'fixed', inset: 0, zIndex: 1100, background: C.canvas, overflowY: 'auto', fontFamily: POLICE,
      paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      <div style={{ maxWidth: 540, margin: '0 auto', padding: '14px 16px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <h2 style={{ flex: 1, margin: 0, fontSize: 20, color: C.ink }}>{T.titre}</h2>
          <button type="button" onClick={onFermer} style={{ minHeight: 40, padding: '8px 14px', borderRadius: 10, border: `1px solid ${C.border}`, background: BLANC, color: C.ink, fontWeight: 600 }}>{T.fermer}</button>
        </div>
        <p style={{ margin: '0 0 14px', padding: '10px 12px', borderRadius: 12, background: MENTHE, color: C.tealDeep, fontSize: 13.5, lineHeight: 1.5 }}>{T.intro}</p>
        <EtatExecutant T={T} lang={lang} />
        {etats === null && <p style={{ color: C.mute2, fontSize: 14 }}>{T.lecture}</p>}
        {etats === 'echec' && <p style={{ color: C.amberInk, fontSize: 14 }}>{T.lectureEchec}</p>}
        {etats && etats !== 'echec' && (
          <div style={{ display: 'grid', gap: 10 }}>
            {CLOUD_PLATEFORMES_CONNEXION.filter((p) => !plateformesFermees.includes(p.id)).map((p) => {
              const verif = verifs.find((x) => x.id === p.id)?.etat ?? null;
              const isole = isoles.includes(p.id) && etatConnexion(etats?.[p.id]) !== 'connecte';
              return (
                <Ligne key={p.id} nom={p.nom} connecte={etatConnexion(etats?.[p.id]) === 'connecte' || isole} verif={verif}
                  texte={isole && !verif ? T.isoleTexte : null}
                  aReconnecter={etatConnexion(etats?.[p.id]) === 'a_reconnecter'} T={T}
                  onClick={() => setOuverte(verif === 'a_resoudre' ? { ...p, mode: 'resoudre' } : p)} />
              );
            })}
            {ebay && (
              // (01/11) Relié par l'API : rien à faire ici (aucun bouton, jamais le navigateur Cloud). Pas relié : la
              // connexion officielle d'eBay (ebay-oauth-start), jamais une page de connexion dans le navigateur Cloud.
              <Ligne nom={T.ebayTitre} connecte={ebay.relie} T={T} texte={ebay.relie ? T.ebayTexteRelie : T.ebayTexte}
                libelle={{ connecte: T.ebayRelie, faire: T.ebayRelier, refaire: T.ebayRelier }} onClick={ebay.onRelier} sansBouton={ebay.relie} />
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
