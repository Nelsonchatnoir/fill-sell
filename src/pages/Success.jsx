import { useEffect } from 'react';
import { useNavigate } from "react-router-dom";
import { track } from '../analytics/analytics';
import useSeo from '../lib/seo';
import { oublierOffre } from '../lib/offreMail';
import { messageSucces } from './succesAchat';

export default function Success(){
  const nav = useNavigate();
  // (05/11 soir) Ce qui a été acheté (create-checkout-session passe ?produit=… ; essai=1 pour un Cloud en essai).
  const m = messageSucces(new URLSearchParams(typeof window !== 'undefined' ? window.location.search : ''));

  // Page de retour Stripe : jamais à indexer (sans ça elle hérite du
  // canonical + title de la home posés par index.html).
  useSeo({ path: '/success', title: 'Paiement confirmé — FillSell', robots: 'noindex' });

  useEffect(() => {
    const sessionId = new URLSearchParams(window.location.search).get('session_id') || '';
    // Une valeur n'est comptée que si elle est connue (jamais 12,99 € pour un Pro, un Business ou un Cloud).
    track('purchase', { currency: 'EUR', ...(m.valeur != null ? { value: m.valeur } : {}), transaction_id: sessionId, ...(m.produit ? { produit: m.produit } : {}) });
    // Le contexte déposé par triggerCheckout a rempli son office : l'achat est
    // passé. Sans ce nettoyage, un passage ultérieur par /cancel (retour
    // arrière, onglet rouvert) journaliserait un abandon pour un achat réussi.
    try { localStorage.removeItem('fs_checkout_ctx'); } catch { /* mode privé */ }
    // L'offre du lien d'e-mail (FILLSELL50) a servi : on ne la colle plus aux
    // passages suivants par la modale des offres.
    oublierOffre();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une seule mesure au retour de Stripe
  }, []);

  return(
    <div style={{position:"fixed",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,#3EACA0,#E8956D)",padding:"24px",boxSizing:"border-box"}}>
      <div style={{width:"100%",maxWidth:420,textAlign:"center"}}>
        <div style={{fontSize:72,marginBottom:20}}>🎉</div>
        <div style={{fontSize:28,fontWeight:700,color:"#fff",marginBottom:12,letterSpacing:"-0.5px"}}>{m.titre}</div>
        <div style={{fontSize:16,color:"rgba(255,255,255,0.85)",marginBottom:12,lineHeight:1.6}}>{m.texte}</div>
        <div style={{fontSize:13,color:"rgba(255,255,255,0.7)",marginBottom:40,fontWeight:600}}>{m.suite ?? ''}</div>
        <button onClick={()=>nav("/app")} style={{width:"100%",padding:"16px",background:"#fff",color:"#3EACA0",border:"none",borderRadius:14,fontSize:16,fontWeight:700,cursor:"pointer",boxShadow:"0 8px 24px rgba(0,0,0,0.15)"}}>
          Accéder à l'app →
        </button>
      </div>
    </div>
  );
}
