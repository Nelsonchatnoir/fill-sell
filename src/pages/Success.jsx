import { useNavigate } from "react-router-dom";
export default function Success(){
  const nav = useNavigate();
  return(
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,#3EACA0,#E8956D)",gap:20}}>
      <div style={{fontSize:64}}>🎉</div>
      <div style={{fontSize:28,fontWeight:900,color:"#fff"}}>Bienvenue sur le plan Premium !</div>
      <div style={{fontSize:16,color:"rgba(255,255,255,0.85)"}}>Ton abonnement est actif.</div>
      <button onClick={()=>nav("/app")} style={{padding:"14px 32px",background:"#fff",color:"#3EACA0",border:"none",borderRadius:12,fontSize:16,fontWeight:700,cursor:"pointer",marginTop:12}}>
        Accéder à l'app →
      </button>
    </div>
  );
}