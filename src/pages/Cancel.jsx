import { useEffect } from 'react';
import { useNavigate } from "react-router-dom";
import { supabase } from '../lib/supabase';
import useSeo from '../lib/seo';
export default function Cancel(){
  const nav = useNavigate();
  // Page de retour Stripe : jamais à indexer.
  useSeo({ path: '/cancel', title: 'Paiement annulé — FillSell', robots: 'noindex' });

  // ── checkout_abandon, voie Stripe (2026-08-09) ────────────────────────────
  // C'est ICI qu'atterrit un utilisateur qui recule devant le prix : Stripe le
  // renvoie sur cancel_url. Rien ne le journalisait — entre le clic et l'achat,
  // le parcours web était muet, et « il a reculé » restait indiscernable de
  // « il a buté sur un écran ».
  // Cette page vit HORS de l'arbre de l'app : ni user, ni props, et la
  // redirection Stripe a détruit tout l'état React. Le contexte du checkout est
  // donc relu dans localStorage, où triggerCheckout l'a déposé juste avant de
  // partir. Fenêtre de 2 h : au-delà, la ligne est un reste d'une autre
  // session (onglet rouvert, retour arrière tardif) et journaliser un abandon
  // qui n'a pas eu lieu maintenant fausserait le compteur. La clé est retirée
  // dans TOUS les cas — une seule ligne par tentative, jamais deux.
  useEffect(() => {
    let ctx = null;
    try {
      const brut = localStorage.getItem('fs_checkout_ctx');
      localStorage.removeItem('fs_checkout_ctx');
      if (brut) ctx = JSON.parse(brut);
    } catch { /* mode privé ou JSON abîmé : on n'a rien à journaliser */ }
    if (!ctx || !Number.isFinite(ctx.at) || Date.now() - ctx.at > 2 * 60 * 60 * 1000) return;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const uid = data?.user?.id;
        if (!uid) return;
        const { error } = await supabase.from('usage_logs').insert({
          user_id: uid,
          feature: 'checkout_abandon',
          metadata: { canal: 'stripe', tier: ctx.tier ?? null, origine: ctx.origine ?? null, motif: 'retour_stripe' },
        });
        if (error) console.warn('[tunnel] checkout_abandon non journalisé :', error.message);
      } catch (e) { console.warn('[tunnel] checkout_abandon non journalisé :', e?.message ?? e); }
    })();
  }, []);

  return(
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"#F8F7F4",gap:16}}>
      <div style={{fontSize:48}}>😕</div>
      <div style={{fontSize:22,fontWeight:700,color:"#111827"}}>Paiement annulé</div>
      <div style={{fontSize:15,color:"#6B7280"}}>Tu peux réessayer à tout moment.</div>
      <button onClick={()=>nav("/app")} style={{padding:"12px 28px",background:"#3EACA0",color:"#fff",border:"none",borderRadius:12,fontSize:15,fontWeight:700,cursor:"pointer",marginTop:8}}>
        Retour à l'app
      </button>
    </div>
  );
}
