import { useEffect, useState } from 'react';
import { ACCEPTE, REFUSE, etatConsentement, poserConsentement } from '../utils/consentement';
import { chargerPixel } from '../utils/metaPixel';

// ============================================================================
// BANDEAU DE CONSENTEMENT PUBLICITAIRE — 13/09/2026
//
// Ajouté parce que le site n'en avait AUCUN, et qu'un pixel Meta ne peut pas
// se charger sans consentement préalable en France. Sans ce bandeau, le pixel
// resterait inerte à vie et la campagne serait aveugle malgré son installation.
//
// Règles tenues :
// · Refuser est AUSSI simple qu'accepter — deux boutons, même niveau, même
//   taille. Un « refuser » caché derrière un second écran vicie le consentement.
// · Rien n'est chargé tant que la personne n'a pas répondu. Fermer sans
//   répondre n'existe pas : il n'y a pas de croix.
// · Le choix est révocable depuis /legal.
//
// N'apparaît pas dans l'app connectée (/app) : le bandeau vit sur les pages
// publiques, là où arrive le trafic de campagne.
// ============================================================================

export default function BandeauConsentement() {
  // État initial lu directement au premier rendu : le bandeau ne doit pas
  // apparaître après coup chez quelqu'un qui a déjà répondu.
  const [visible, setVisible] = useState(() => etatConsentement() === null);

  // Choix déjà enregistré : on recharge le pixel s'il avait été accepté.
  // no-op si la réponse était « refuse ».
  useEffect(() => { chargerPixel(); }, []);

  if (!visible) return null;

  function repondre(valeur) {
    poserConsentement(valeur);
    setVisible(false);
    if (valeur === ACCEPTE) chargerPixel();
  }

  return (
    <div
      role="dialog"
      aria-label="Consentement aux cookies publicitaires"
      style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 9999,
        background: '#FFFFFF', borderTop: '1px solid #E6E3DD',
        boxShadow: '0 -8px 30px rgba(23,60,49,0.10)', padding: '18px 20px',
      }}
    >
      <div style={{
        maxWidth: 960, margin: '0 auto', display: 'flex', flexWrap: 'wrap',
        alignItems: 'center', gap: 16, justifyContent: 'space-between',
      }}>
        <p style={{
          margin: 0, flex: '1 1 380px', fontSize: 14, lineHeight: 1.6, color: '#3A3A38',
          fontFamily: "-apple-system,'Segoe UI',Arial,sans-serif",
        }}>
          On aimerait mesurer l'efficacité de nos publicités, avec un traceur
          Meta. Ce n'est pas nécessaire au fonctionnement du site, et tu peux
          refuser sans rien perdre.{' '}
          <a href="/legal#confidentialite" style={{ color: '#17835F' }}>En savoir plus</a>
        </p>
        <div style={{ display: 'flex', gap: 10, flex: '0 0 auto' }}>
          <button
            onClick={() => repondre(REFUSE)}
            style={{
              padding: '11px 22px', background: '#FFFFFF', color: '#17835F',
              border: '1px solid #C9DED6', borderRadius: 10, fontSize: 14,
              fontWeight: 700, cursor: 'pointer',
            }}
          >
            Refuser
          </button>
          <button
            onClick={() => repondre(ACCEPTE)}
            style={{
              padding: '11px 22px', background: '#1D9E75', color: '#fff',
              border: 'none', borderRadius: 10, fontSize: 14,
              fontWeight: 700, cursor: 'pointer',
            }}
          >
            Accepter
          </button>
        </div>
      </div>
    </div>
  );
}
