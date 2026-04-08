import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

const TEAL = "#3EACA0";
const PEACH = "#E8956D";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  // Supabase injecte la session depuis le fragment d'URL (#access_token=…)
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
      else setMsg("Lien invalide ou expiré. Recommence depuis la page de connexion.");
    });
  }, []);

  async function handleSubmit() {
    if (!password || password.length < 6) { setMsg("Le mot de passe doit faire au moins 6 caractères."); return; }
    if (password !== confirm) { setMsg("Les mots de passe ne correspondent pas."); return; }
    setLoading(true);
    setMsg("");
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { setMsg("Erreur : " + error.message); return; }
    setMsg("✅ Mot de passe mis à jour !");
    setTimeout(() => navigate("/app"), 1500);
  }

  const inputStyle = {
    padding: "13px 16px", borderRadius: 12, border: "1px solid rgba(0,0,0,0.12)",
    fontSize: 15, outline: "none", fontFamily: "inherit", width: "100%", boxSizing: "border-box",
  };

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", background: `linear-gradient(135deg,${TEAL} 0%,${PEACH} 100%)`, boxSizing: "border-box" }}>
      <div style={{ background: "#fff", borderRadius: 24, padding: "36px 28px", width: "100%", maxWidth: 400, boxShadow: "0 24px 64px rgba(0,0,0,0.2)", boxSizing: "border-box" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <img src="/logo.png" style={{ height: 52, marginBottom: 12, objectFit: "contain" }} alt="Fill & Sell" />
          <div style={{ fontSize: 18, fontWeight: 800, color: "#1A202C", marginBottom: 4 }}>Nouveau mot de passe</div>
          <div style={{ fontSize: 14, color: "#718096" }}>Choisis un nouveau mot de passe pour ton compte.</div>
        </div>

        {ready ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <input
              type="password" placeholder="Nouveau mot de passe" value={password}
              onChange={e => setPassword(e.target.value)} style={inputStyle}
            />
            <input
              type="password" placeholder="Confirmer le mot de passe" value={confirm}
              onChange={e => setConfirm(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSubmit()}
              style={inputStyle}
            />
            <button
              onClick={handleSubmit} disabled={loading}
              style={{ padding: "14px", background: `linear-gradient(135deg,${TEAL},${PEACH})`, color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", width: "100%", boxShadow: "0 4px 16px rgba(62,172,160,0.35)", opacity: loading ? 0.7 : 1 }}>
              {loading ? "Mise à jour…" : "Enregistrer le mot de passe"}
            </button>
          </div>
        ) : (
          !msg && <div style={{ textAlign: "center", color: "#718096", fontSize: 14 }}>Vérification du lien…</div>
        )}

        {msg && (
          <div style={{ marginTop: 16, fontSize: 13, textAlign: "center", color: msg.startsWith("✅") ? TEAL : "#E53E3E", fontWeight: 600 }}>
            {msg}
          </div>
        )}

        {!ready && msg && (
          <div style={{ textAlign: "center", marginTop: 16 }}>
            <span onClick={() => navigate("/login")} style={{ fontSize: 13, color: TEAL, cursor: "pointer", textDecoration: "underline" }}>
              ← Retour à la connexion
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
