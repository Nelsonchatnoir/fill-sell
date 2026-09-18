import { createPortal } from 'react-dom';

// ⛔ PORTAIL SUR document.body — OBLIGATOIRE, ET C'EST LE PLUS GRAVE DES TROIS
// (2026-09-18). Rendu dans l'arbre d'App, ce toast vit sous `.app-root`, qui
// est un conteneur de défilement/rognage : WebKit y peint les position:fixed
// DANS SA COUCHE. Par-dessus une page elle-même portalisée sur body (la page
// Réglages), il restait donc INVISIBLE — et lui, contrairement aux deux
// modales, porte les CONFIRMATIONS D'ÉCRITURE : « ✅ Pseudo enregistré »,
// « ✅ Adresse enregistrée », et surtout « ❌ Erreur lors de la sauvegarde ».
// On enregistrait sans savoir si ça avait marché, et un échec passait sous
// silence.
// ⛔ CHANGEMENT DE POINT DE MONTAGE, ET RIEN D'AUTRE : mêmes styles, même
//    z-index (500), mêmes props. Les appelants ne voient aucune différence.
export default function Toast({ message, visible }) {
  return createPortal(
    <div style={{
      position:"fixed",
      bottom:"var(--nav-float-bottom)",
      left:"50%",
      transform:`translateX(-50%) translateY(${visible?0:16}px)`,
      zIndex:500,
      background:"#1B6E62",
      color:"#fff",
      borderRadius:14,
      padding:"12px 20px",
      fontFamily:"'Space Grotesk',-apple-system,BlinkMacSystemFont,sans-serif",
      fontWeight:700,
      fontSize:14,
      boxShadow:"0 8px 24px rgba(0,0,0,0.2)",
      transition:"opacity 0.3s ease, transform 0.3s ease",
      opacity:visible?1:0,
      pointerEvents:visible?"auto":"none",
      whiteSpace:"nowrap",
    }}>
      {message}
    </div>,
    document.body,
  );
}
