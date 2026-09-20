// ═══════════════════════════════════════════════════════════════════════════
// eBAY — LA POLITIQUE DE LIVRAISON, PAR ARTICLE (2026-09-20, demande Louis)
// ═══════════════════════════════════════════════════════════════════════════
// « Il faudrait pouvoir choisir différents modèles de transport en fonction
//  des articles et si l'on veut ou non envoyer à l'étranger. »
//
// eBay modélise exactement ça par ses BUSINESS POLICIES : un compte peut en
// avoir plusieurs, et chaque annonce en porte une. Jusqu'ici on appliquait
// celle du COMPTE à toutes les annonces, choisie une fois dans Réglages.
//
// ⛔ L'INTERNATIONAL N'EST PAS UN RÉGLAGE D'ANNONCE : c'est une propriété de
//    la POLITIQUE. On l'affiche (« envoi à l'étranger »), on ne le modifie
//    jamais — la configuration que le vendeur a faite chez eBay est reprise
//    telle quelle et n'est jamais écrasée.
// ⛔ ZÉRO FRICTION : replié, et sans choix l'annonce part avec la politique
//    du compte — exactement comme avant pour qui ne touche à rien.
// ⛔ AUCUN APPEL TANT QU'ON N'OUVRE PAS. La liste se lit au premier
//    déploiement, une seule fois par écran.

import { useState } from 'react';
import { Truck, Check, Globe } from 'lucide-react';
import { UI } from './ui';
import { agirEbay } from '../utils/ebayCompte';

const MOTS = {
  fr: {
    titre: 'LIVRAISON EBAY', ouvrir: 'Changer', fermer: 'Fermer',
    duCompte: 'La politique de livraison de ton compte',
    chargement: 'Lecture de tes politiques eBay…',
    aucune: 'Aucune politique de livraison lue sur ton compte eBay.',
    echec: 'Tes politiques eBay n’ont pas pu être lues — l’annonce partira avec celle du compte.',
    etranger: 'envoi à l’étranger',
    france: 'France seulement',
    jours: (n) => `préparation ${n} j`,
    revenir: 'Revenir à celle du compte',
  },
  en: {
    titre: 'EBAY DELIVERY', ouvrir: 'Change', fermer: 'Close',
    duCompte: 'Your account’s delivery policy',
    chargement: 'Reading your eBay policies…',
    aucune: 'No delivery policy found on your eBay account.',
    echec: 'Your eBay policies could not be read — the listing will use the account one.',
    etranger: 'ships abroad',
    france: 'domestic only',
    jours: (n) => `${n}-day handling`,
    revenir: 'Back to the account one',
  },
};

export default function CarteLivraisonEbay({ lang = 'fr', champs = {}, onChange }) {
  const T = MOTS[lang === 'en' ? 'en' : 'fr'];
  const [ouvert, setOuvert] = useState(false);
  const [liste, setListe] = useState(null);     // null = jamais lu
  const [etat, setEtat] = useState('repos');    // repos | lecture | echec

  const choisie = String(champs.ebayFulfillmentPolicyId ?? '').trim() || null;
  const nomChoisie = choisie ? (liste?.find((p) => p.id === choisie)?.nom ?? choisie) : null;

  async function ouvrir_() {
    setOuvert(true);
    if (liste !== null || etat === 'lecture') return;
    setEtat('lecture');
    try {
      const r = await agirEbay('lister_politiques', { type: 'fulfillment' });
      setListe(Array.isArray(r?.liste) ? r.liste : []);
      setEtat('repos');
    } catch {
      setEtat('echec');
    }
  }

  const st = {
    bloc: { border: `1px solid ${UI.border}`, borderRadius: 14, padding: 12, background: UI.paper, marginBottom: 12 },
    eyebrow: { fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', color: UI.mute2 },
    lien: { background: 'none', border: 'none', color: UI.tealDeep, fontWeight: 700, fontSize: 12.5,
            cursor: 'pointer', fontFamily: 'inherit', padding: '6px 2px', flexShrink: 0 },
    ligne: { display: 'flex', alignItems: 'flex-start', gap: 9, width: '100%', textAlign: 'left',
             padding: '9px 10px', borderRadius: 10, border: `1px solid ${UI.border}`, background: UI.card,
             cursor: 'pointer', fontFamily: 'inherit', marginTop: 6 },
    petit: { fontSize: 11, color: UI.mute2, lineHeight: 1.4 },
  };

  return (
    <div style={st.bloc}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <span style={st.eyebrow}>{T.titre}</span>
        <button type="button" style={st.lien} onClick={() => (ouvert ? setOuvert(false) : ouvrir_())}>
          {ouvert ? T.fermer : T.ouvrir}
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 4 }}>
        <Truck size={15} color={UI.tealDeep} style={{ flexShrink: 0, marginTop: 3 }} />
        <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: UI.ink, lineHeight: 1.3, overflowWrap: 'anywhere' }}>
          {nomChoisie ?? T.duCompte}
        </div>
      </div>

      {ouvert && (
        <div style={{ marginTop: 10 }}>
          {etat === 'lecture' && <div style={st.petit}>{T.chargement}</div>}
          {etat === 'echec' && <div style={st.petit}>{T.echec}</div>}
          {etat === 'repos' && liste?.length === 0 && <div style={st.petit}>{T.aucune}</div>}
          {(liste ?? []).map((p) => {
            const actif = choisie === p.id;
            return (
              <button key={p.id} type="button" onClick={() => onChange?.('ebayFulfillmentPolicyId', actif ? '' : p.id)}
                style={{ ...st.ligne, borderColor: actif ? UI.tealDeep : UI.border }}>
                <span style={{ width: 17, height: 17, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                               border: `1.5px solid ${actif ? UI.tealDeep : UI.border}`,
                               background: actif ? UI.tealDeep : 'transparent',
                               display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {actif && <Check size={11} color="#fff" strokeWidth={3} />}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: UI.ink, overflowWrap: 'anywhere' }}>{p.nom || p.id}</span>
                  <span style={{ ...st.petit, display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                    <Globe size={11} color={p.a_international ? UI.tealDeep : UI.mute} />
                    {p.a_international ? T.etranger : T.france}
                    {p.delai_traitement_jours != null && ` · ${T.jours(p.delai_traitement_jours)}`}
                  </span>
                </span>
              </button>
            );
          })}
          {choisie && (
            <button type="button" onClick={() => onChange?.('ebayFulfillmentPolicyId', '')}
              style={{ ...st.lien, marginTop: 6 }}>{T.revenir}</button>
          )}
        </div>
      )}
    </div>
  );
}
