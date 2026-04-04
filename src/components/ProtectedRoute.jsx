import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function ProtectedRoute({ children }) {
  const [user, setUser] = useState(undefined); // undefined = en cours de vérification

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
  }, []);

  if (user === undefined) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#3EACA0,#E8956D)" }}>
      <div style={{ color: "#fff", fontSize: 18, fontWeight: 700 }}>Chargement...</div>
    </div>
  );

  if (!user) return <Navigate to="/login" replace />;

  return children;
}
