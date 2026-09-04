import { useEffect } from 'react';
import { useNavigate } from "react-router-dom";
import { track } from '../analytics/analytics';
import useSeo from '../lib/seo';

export default function Success(){
  const nav = useNavigate();

  // Page de retour Stripe : jamais à indexer (sans ça elle hérite du
  // canonical + title de la home posés par index.html).
  useSeo({ path: '/success', title: 'Paiement confirmé — FillSell', robots: 'noindex' });

  useEffect(() => {
    const sessionId = new URLSearchParams(window.location.search).get('session_id') || '';
    track('purchase', { currency: 'EUR', value: 12.99, transaction_id: sessionId });
    // Le contexte déposé par triggerCheckout a rempli son office : l'achat est
    // passé. Sans ce nettoyage, un passage ultérieur par /cancel (retour
    // arrière, onglet rouvert) journaliserait un abandon pour un achat réussi.
    try { localStorage.removeItem('fs_checkout_ctx'); } catch { /* mode privé */ }
  }, []);

  return(
    <div style={{position:"fixed",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,#3EACA0,#E8956D)",padding:"24px",boxSizing:"border-box"}}>
      <div style={{width:"100%",maxWidth:420,textAlign:"center"}}>
        <div style={{fontSize:72,marginBottom:20}}>🎉</div>
        <div style={{fontSize:28,fontWeight:700,color:"#fff",marginBottom:12,letterSpacing:"-0.5px"}}>Bienvenue sur le plan Premium !</div>
        <div style={{fontSize:16,color:"rgba(255,255,255,0.85)",marginBottom:12,lineHeight:1.6}}>Ton abonnement est actif. Tu peux profiter de l'IA vocale et des stats avancées.</div>
        <div style={{fontSize:13,color:"rgba(255,255,255,0.7)",marginBottom:40,fontWeight:600}}>Annulable à tout moment, en 1 clic</div>
        <button onClick={()=>nav("/app")} style={{width:"100%",padding:"16px",background:"#fff",color:"#3EACA0",border:"none",borderRadius:14,fontSize:16,fontWeight:700,cursor:"pointer",boxShadow:"0 8px 24px rgba(0,0,0,0.15)"}}>
          Accéder à l'app →
        </button>
      </div>
    </div>
  );
}
