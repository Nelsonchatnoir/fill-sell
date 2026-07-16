import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { UI, Loader } from "./ui";

export default function ProtectedRoute({ children }) {
  const [user, setUser] = useState(undefined); // undefined = en cours de vérification

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
  }, []);

  if (user === undefined) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: UI.canvas }}>
      <Loader size={32} thickness={3} />
    </div>
  );

  if (!user) return <Navigate to="/login" replace />;

  return children;
}
