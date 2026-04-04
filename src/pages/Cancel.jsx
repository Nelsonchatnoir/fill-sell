import { useNavigate } from "react-router-dom";
export default function Cancel(){
  const nav = useNavigate();
  return(
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"#F8F7F4",gap:16}}>
      <div style={{fontSize:48}}>😕</div>
      <div style={{fontSize:22,fontWeight:800,color:"#111827"}}>Paiement annulé</div>
      <div style={{fontSize:15,color:"#6B7280"}}>Tu peux réessayer à tout moment.</div>
      <button onClick={()=>nav("/app")} style={{padding:"12px 28px",background:"#3EACA0",color:"#fff",border:"none",borderRadius:12,fontSize:15,fontWeight:700,cursor:"pointer",marginTop:8}}>
        Retour à l'app
      </button>
    </div>
  );
}