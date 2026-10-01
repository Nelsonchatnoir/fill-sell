import { useEffect, useState } from 'react';
import { useNavigate } from "react-router-dom";
import { supabase } from '../lib/supabase';
import useSeo from '../lib/seo';

// ── CE QUE LA PERSONNE LIT EN REVENANT DE LA PAGE DE PAIEMENT (01/10/2026) ──
// Avant : « Paiement annulé · Tu peux réessayer à tout moment », quoi qu'il se
// soit passé. Le 01/10, 9cdr9rm4rn est revenue trois fois de Stripe (banque qui
// demande une validation sur Apple Pay, Klarna qui refuse, Radar qui bloque) :
// rien ne lui a dit quoi faire, elle a fini par payer Premium par Apple —
// Pro perdu. Désormais la page lit la cause de la DERNIÈRE tentative
// (create-checkout-session, action « diagnostic ») et propose la sortie qui
// marche : la carte tapée, que la banque fait valider (3D Secure) — c'est
// ainsi que nicolas.menar a payé le 30/09 après les mêmes refus.
// Une information par ligne, aucun code, aucun nom de produit technique.
const TEXTES = {
  fr: {
    authentification: { titre: 'Ta banque demande une validation', lignes: ["Le moyen choisi ne permet pas cette validation. Rien n'a été débité.", 'Tape le numéro de ta carte : ta banque te demandera de valider (3D Secure).'] },
    radar: { titre: 'Paiement bloqué par sécurité', lignes: ["Plusieurs essais rapprochés ont déclenché une protection. Rien n'a été débité.", 'Tape le numéro de ta carte : ta banque te demandera de valider (3D Secure).'] },
    klarna: { titre: "Klarna n'a pas accepté le paiement", lignes: ["Le paiement en plusieurs fois a été refusé. Rien n'a été débité.", 'Tu peux payer par carte.'] },
    banque: { titre: 'Ta banque a refusé le paiement', lignes: ["Rien n'a été débité.", 'Tape le numéro de ta carte pour la faire valider, ou essaie une autre carte.'] },
    autre: { titre: "Le paiement n'est pas passé", lignes: ["Rien n'a été débité.", 'Tu peux payer par carte.'] },
    payee: { titre: 'Paiement reçu', lignes: ['Ton abonnement est actif.'] },
    annule: { titre: 'Paiement annulé', lignes: ["Rien n'a été débité.", 'Tu peux réessayer à tout moment.'] },
    carte: 'Payer par carte', ouverture: 'Ouverture du paiement…', retour: "Retour à l'app",
    lecture: 'Un instant…', echecOuverture: "Le paiement n'a pas pu s'ouvrir. Réessaie dans un instant.",
  },
  en: {
    authentification: { titre: 'Your bank is asking for a confirmation', lignes: ["The method you chose can't show it. Nothing was charged.", 'Type your card number: your bank will ask you to confirm (3D Secure).'] },
    radar: { titre: 'Payment blocked for security', lignes: ['Several attempts in a row triggered a protection. Nothing was charged.', 'Type your card number: your bank will ask you to confirm (3D Secure).'] },
    klarna: { titre: "Klarna didn't accept the payment", lignes: ['Paying in instalments was declined. Nothing was charged.', 'You can pay by card.'] },
    banque: { titre: 'Your bank declined the payment', lignes: ['Nothing was charged.', 'Type your card number so your bank can confirm it, or try another card.'] },
    autre: { titre: "The payment didn't go through", lignes: ['Nothing was charged.', 'You can pay by card.'] },
    payee: { titre: 'Payment received', lignes: ['Your subscription is active.'] },
    annule: { titre: 'Payment cancelled', lignes: ['Nothing was charged.', 'You can try again anytime.'] },
    carte: 'Pay by card', ouverture: 'Opening the payment…', retour: 'Back to the app',
    lecture: 'One moment…', echecOuverture: "The payment couldn't open. Try again in a moment.",
  },
};
const CAUSES_AVEC_CARTE = new Set(['authentification', 'radar', 'klarna', 'banque', 'autre']);

export default function Cancel(){
  const nav = useNavigate();
  // Page de retour Stripe : jamais à indexer.
  useSeo({ path: '/cancel', title: 'Paiement annulé — FillSell', robots: 'noindex' });
  const lang = (() => { try { return localStorage.getItem('fs_lang') === 'en' ? 'en' : 'fr'; } catch { return 'fr'; } })();
  const T = TEXTES[lang];
  const sessionId = new URLSearchParams(window.location.search).get('session_id') || '';
  const [diag, setDiag] = useState(sessionId ? null : { cause: 'annule', plan: null });
  const [ouverture, setOuverture] = useState(false);
  const [echec, setEchec] = useState(false);

  // ── checkout_abandon, voie Stripe (2026-08-09) ────────────────────────────
  // C'est ICI qu'atterrit un utilisateur qui recule devant le prix : Stripe le
  // renvoie sur cancel_url. Cette page vit HORS de l'arbre de l'app : le
  // contexte du checkout est relu dans localStorage, où triggerCheckout l'a
  // déposé (fenêtre de 2 h), puis retiré dans TOUS les cas — une seule ligne
  // par tentative. (01/10) La ligne porte désormais la CAUSE lue chez Stripe :
  // « il a reculé » et « sa banque a refusé » ne se confondent plus.
  useEffect(() => {
    let ctx = null;
    try {
      const brut = localStorage.getItem('fs_checkout_ctx');
      localStorage.removeItem('fs_checkout_ctx');
      if (brut) ctx = JSON.parse(brut);
    } catch { /* mode privé ou JSON abîmé : on n'a rien à journaliser */ }
    const ctxValide = ctx && Number.isFinite(ctx.at) && Date.now() - ctx.at <= 2 * 60 * 60 * 1000;
    let vivant = true;
    (async () => {
      let resultat = { cause: 'annule', plan: null };
      if (sessionId) {
        try {
          const { data } = await supabase.functions.invoke('create-checkout-session', { body: { action: 'diagnostic', session_id: sessionId } });
          const cause = data?.cause;
          resultat = { cause: CAUSES_AVEC_CARTE.has(cause) || cause === 'payee' ? cause : 'annule', plan: data?.plan ?? null };
        } catch { /* sans diagnostic : le message d'avant */ }
        if (vivant) setDiag(resultat);
      }
      if (!ctxValide) return;
      try {
        const { data } = await supabase.auth.getUser();
        const uid = data?.user?.id;
        if (!uid) return;
        const { error } = await supabase.from('usage_logs').insert({
          user_id: uid,
          feature: 'checkout_abandon',
          metadata: { canal: 'stripe', tier: ctx.tier ?? null, origine: ctx.origine ?? null, motif: 'retour_stripe', cause: resultat.cause },
        });
        if (error) console.warn('[tunnel] checkout_abandon non journalisé :', error.message);
      } catch (e) { console.warn('[tunnel] checkout_abandon non journalisé :', e?.message ?? e); }
    })();
    return () => { vivant = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // « Payer par carte » : une nouvelle page de paiement où le 3D Secure est
  // demandé sur la carte tapée. Même client Stripe, l'ancienne tentative est
  // remplacée proprement côté serveur — jamais un doublon.
  async function payerParCarte() {
    if (ouverture) return;
    setOuverture(true); setEchec(false);
    try {
      const plan = diag?.plan ?? 'standard';
      const { data, error } = await supabase.functions.invoke('create-checkout-session', { body: { product: plan, carte_3ds: true, lang } });
      if (error || !data?.url) throw new Error('ouverture');
      try { localStorage.setItem('fs_checkout_ctx', JSON.stringify({ canal: 'stripe', tier: plan === 'standard' ? 'premium' : plan, origine: 'retour_refus', at: Date.now() })); } catch { /* mode privé */ }
      window.location.href = data.url;
    } catch {
      setEchec(true); setOuverture(false);
    }
  }

  const cause = diag?.cause ?? null;
  const texte = cause ? (T[cause] ?? T.annule) : null;
  const proposeCarte = cause && CAUSES_AVEC_CARTE.has(cause);
  const emoji = cause === 'payee' ? '✅' : proposeCarte ? '💳' : '😕';

  return(
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"#F8F7F4",gap:14,padding:"24px 16px",boxSizing:"border-box",textAlign:"center"}}>
      <div style={{fontSize:48}} aria-hidden="true">{texte ? emoji : '⏳'}</div>
      <div style={{fontSize:22,fontWeight:700,color:"#111827",maxWidth:420}}>{texte ? texte.titre : T.lecture}</div>
      {texte && texte.lignes.map((l, i) => (
        <div key={i} style={{fontSize:15,color:"#4B5563",maxWidth:420,lineHeight:1.5}}>{l}</div>
      ))}
      {proposeCarte && (
        <button onClick={payerParCarte} disabled={ouverture} style={{padding:"13px 28px",background:"#3EACA0",color:"#fff",border:"none",borderRadius:12,fontSize:15,fontWeight:700,cursor:ouverture?"wait":"pointer",marginTop:8,minWidth:240}}>
          {ouverture ? T.ouverture : T.carte}
        </button>
      )}
      {echec && <div style={{fontSize:14,color:"#9B5148",maxWidth:420}}>{T.echecOuverture}</div>}
      {texte && (
        <button onClick={()=>nav("/app")} style={proposeCarte
          ? {padding:"10px 22px",background:"transparent",color:"#374151",border:"1px solid #D1D5DB",borderRadius:12,fontSize:14,fontWeight:600,cursor:"pointer"}
          : {padding:"12px 28px",background:"#3EACA0",color:"#fff",border:"none",borderRadius:12,fontSize:15,fontWeight:700,cursor:"pointer",marginTop:8}}>
          {T.retour}
        </button>
      )}
    </div>
  );
}
