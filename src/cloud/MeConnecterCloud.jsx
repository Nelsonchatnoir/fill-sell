// ═══════════════════════════════════════════════════════════════════════════
// L'ÉCRAN « ME CONNECTER » — l'option Sans ordinateur (05/10)
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
import { supabase } from '../lib/supabase';
import { CLOUD_DOMAINE, CLOUD_PLATEFORMES_CONNEXION } from '../config/cloudOffer';
import { ouvrirConnexion } from './connexion/clientConnexion';
import { lireEtatEbay, ebayVoieApiDuCompte, demarrerConnexionEbay, ouvrirConsentementEbay } from '../utils/ebayCompte';
import { textesConnexion } from './textesConnexion';
import { C, BLANC, MENTHE, DEGRADE_TEAL, POLICE } from './theme';

const ETAPES_FINALES = ['connecte', 'refuse', 'inactif', 'non_autorise', 'expire', 'erreur', 'ferme'];

function Ligne({ nom, connecte, libelle, onClick, T, texte = null }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: BLANC, border: `1px solid ${C.border}`, borderRadius: 14 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, color: C.ink, fontSize: 15.5 }}>{nom}</div>
        <div style={{ fontSize: 13, color: connecte ? C.tealDeep : C.mute2, marginTop: 2 }}>
          <span aria-hidden="true" style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, marginRight: 6, background: connecte ? C.teal : C.faint }} />
          {connecte ? (libelle?.connecte ?? T.connecte) : (libelle?.aConnecter ?? T.aConnecter)}
        </div>
        {texte && <div style={{ fontSize: 12.5, color: C.mute, marginTop: 4, lineHeight: 1.4 }}>{texte}</div>}
      </div>
      <button type="button" onClick={onClick} style={{
        flexShrink: 0, minHeight: 40, padding: '9px 14px', borderRadius: 11, fontWeight: 700, fontSize: 14,
        border: connecte ? `1px solid ${C.border}` : 'none', background: connecte ? BLANC : DEGRADE_TEAL, color: connecte ? C.ink : BLANC,
      }}>{connecte ? (libelle?.refaire ?? T.reconnecter) : (libelle?.faire ?? T.meConnecter)}</button>
    </div>
  );
}

function Vue({ plateforme, nom, lang, onFermer }) {
  const T = textesConnexion(lang);
  const conteneur = useRef(null);
  const session = useRef(null);
  const [message, setMessage] = useState('');
  const [clavier, setClavier] = useState(false);
  const [finie, setFinie] = useState(false);

  useEffect(() => {
    let mort = false;
    (async () => {
      const { data: { session: s } } = await supabase.auth.getSession();
      if (mort || !conteneur.current) return;
      session.current = ouvrirConnexion({
        url: `wss://${CLOUD_DOMAINE}/connexion/ws`, jeton: s?.access_token ?? null, plateforme, conteneur: conteneur.current, lang,
        surEtat: (etape, m) => {
          if (etape === 'clavier') { setClavier(m === true); return; }
          if (m) setMessage(m);
          if (ETAPES_FINALES.includes(etape)) setFinie(true);
          if (etape === 'connecte') setTimeout(() => onFermer(true), 1800);
        },
      });
    })();
    return () => { mort = true; session.current?.fermer(); };
  }, [plateforme, lang, onFermer]);

  return (
    <div role="dialog" aria-modal="true" aria-label={`${T.titre} — ${nom}`} style={{
      position: 'fixed', inset: 0, zIndex: 1200, background: C.canvas, display: 'flex', flexDirection: 'column',
      paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)', touchAction: 'none', fontFamily: POLICE,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px' }}>
        <div style={{ flex: 1, fontWeight: 700, color: C.ink, fontSize: 16 }}>{nom}</div>
        <button type="button" onClick={() => onFermer(false)} style={{ minHeight: 40, padding: '8px 14px', borderRadius: 10, border: `1px solid ${C.border}`, background: BLANC, color: C.ink, fontWeight: 600 }}>{T.fermer}</button>
      </div>
      <div ref={conteneur} style={{ flex: 1, minHeight: 0, width: '100%', maxWidth: 540, margin: '0 auto', overflow: 'hidden', background: BLANC }} />
      <p role="status" aria-live="polite" style={{ margin: 0, padding: '8px 16px', minHeight: 38, fontSize: 13.5, color: C.mute2 }}>{message}</p>
      {!finie && (
        <div style={{ display: 'flex', gap: 8, padding: '4px 16px 12px' }}>
          <button type="button" onClick={() => session.current?.ecrire()} style={{
            flex: 1, minHeight: 44, borderRadius: 12, fontWeight: 700, border: clavier ? 'none' : `1px solid ${C.border}`,
            background: clavier ? DEGRADE_TEAL : BLANC, color: clavier ? BLANC : C.ink,
          }}>{T.ecrire}</button>
          <button type="button" onClick={() => session.current?.termine()} style={{ flex: 1, minHeight: 44, borderRadius: 12, fontWeight: 700, border: `1px solid ${C.border}`, background: BLANC, color: C.ink }}>{T.fini}</button>
        </div>
      )}
    </div>
  );
}

/**
 * @param {{ userId: string, lang?: string, onFermer: () => void }} p
 */
export default function MeConnecterCloud({ userId, lang = 'fr', onFermer }) {
  const T = textesConnexion(lang);
  const [etats, setEtats] = useState(null);   // null = lecture ; 'echec' ; objet
  const [ouverte, setOuverte] = useState(null);
  const [ebayRelie, setEbayRelie] = useState(null);

  const relire = useCallback(() => {
    setEtats(null);
    supabase.rpc('cloud_coffre_etat_moi').then(({ data, error }) => setEtats(error ? 'echec' : (data ?? {})), () => setEtats('echec'));
    // eBay : la connexion OFFICIELLE (API), jamais le navigateur Cloud.
    lireEtatEbay().then((e) => setEbayRelie(ebayVoieApiDuCompte(e) === true), () => setEbayRelie(null));
  }, []);
  const relierEbay = useCallback(async () => {
    try { const { url } = await demarrerConnexionEbay(); if (url) await ouvrirConsentementEbay(url); }
    catch (e) { console.warn('[cloud] connexion eBay :', e?.message ?? e); }
  }, []);
  const ebay = ebayRelie === null ? null : { relie: ebayRelie, onRelier: relierEbay };
  useEffect(() => { if (userId) relire(); }, [userId, relire]);

  const fermerVue = useCallback((connectee) => { setOuverte(null); if (connectee) relire(); }, [relire]);

  return (
    <div role="dialog" aria-modal="true" aria-label={T.titre} style={{
      position: 'fixed', inset: 0, zIndex: 1100, background: C.canvas, overflowY: 'auto', fontFamily: POLICE,
      paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      <div style={{ maxWidth: 540, margin: '0 auto', padding: '14px 16px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <h2 style={{ flex: 1, margin: 0, fontSize: 20, color: C.ink }}>{T.titre}</h2>
          <button type="button" onClick={onFermer} style={{ minHeight: 40, padding: '8px 14px', borderRadius: 10, border: `1px solid ${C.border}`, background: BLANC, color: C.ink, fontWeight: 600 }}>{T.fermer}</button>
        </div>
        <p style={{ margin: '0 0 14px', padding: '10px 12px', borderRadius: 12, background: MENTHE, color: C.tealDeep, fontSize: 13.5, lineHeight: 1.5 }}>{T.intro}</p>
        {etats === null && <p style={{ color: C.mute2, fontSize: 14 }}>{T.lecture}</p>}
        {etats === 'echec' && <p style={{ color: C.amberInk, fontSize: 14 }}>{T.lectureEchec}</p>}
        {etats && etats !== 'echec' && (
          <div style={{ display: 'grid', gap: 10 }}>
            {CLOUD_PLATEFORMES_CONNEXION.map((p) => (
              <Ligne key={p.id} nom={p.nom} connecte={etats?.[p.id]?.connecte === true} T={T} onClick={() => setOuverte(p)} />
            ))}
            {ebay && (
              <Ligne nom={T.ebayTitre} connecte={ebay.relie} T={T} texte={T.ebayTexte}
                libelle={{ connecte: T.ebayRelie, faire: T.ebayRelier, refaire: T.ebayRelier }} onClick={ebay.onRelier} />
            )}
          </div>
        )}
      </div>
      {ouverte && <Vue plateforme={ouverte.id} nom={ouverte.nom} lang={lang} onFermer={fermerVue} />}
    </div>
  );
}
