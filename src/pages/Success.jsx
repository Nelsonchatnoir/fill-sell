import { useNavigate } from "react-router-dom";
export default function Success(){
  const nav = useNavigate();
  return(
    <div style={{position:"fixed",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,#3EACA0,#E8956D)",padding:"24px",boxSizing:"border-box"}}>
      <div style={{width:"100%",maxWidth:420,textAlign:"center"}}>
        <div style={{fontSize:72,marginBottom:20}}>🎉</div>
        <div style={{fontSize:28,fontWeight:900,color:"#fff",marginBottom:12,letterSpacing:"-0.5px"}}>Bienvenue sur le plan Premium !</div>
        <div style={{fontSize:16,color:"rgba(255,255,255,0.85)",marginBottom:40,lineHeight:1.6}}>Ton abonnement est actif. Tu peux maintenant ajouter des articles en illimité.</div>
        <button onClick={()=>nav("/app")} style={{width:"100%",padding:"16px",background:"#fff",color:"#3EACA0",border:"none",borderRadius:14,fontSize:16,fontWeight:800,cursor:"pointer",boxShadow:"0 8px 24px rgba(0,0,0,0.15)"}}>
          Accéder à l'app →
        </button>
      </div>
    </div>
  );
}