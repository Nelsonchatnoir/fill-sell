import { useNavigate } from "react-router-dom";

const C = { teal: "#3EACA0", peach: "#E8956D", text: "#111827", sub: "#6B7280", label: "#9CA3AF" };

const css = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; overflow-x: hidden; background: #F8F7F4; }
  .lp-btn-main { padding: 15px 32px; background: linear-gradient(135deg,#3EACA0,#E8956D); color: #fff; border: none; border-radius: 14px; font-size: 16px; font-weight: 700; cursor: pointer; box-shadow: 0 8px 24px rgba(62,172,160,0.4); transition: all 0.2s; }
  .lp-btn-main:hover { transform: translateY(-3px); box-shadow: 0 14px 32px rgba(62,172,160,0.5); }
  .lp-btn-sec { padding: 15px 32px; background: rgba(255,255,255,0.15); color: #fff; border: 2px solid rgba(255,255,255,0.4); border-radius: 14px; font-size: 16px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
  .lp-btn-sec:hover { background: rgba(255,255,255,0.25); transform: translateY(-3px); }
  .feat-card { background: #fff; border-radius: 20px; padding: 32px 28px; border: 1px solid rgba(0,0,0,0.06); box-shadow: 0 8px 32px rgba(0,0,0,0.06); transition: transform 0.2s, box-shadow 0.2s; }
  .feat-card:hover { transform: translateY(-6px); box-shadow: 0 20px 48px rgba(0,0,0,0.1); }
  .lp-grid3 { display: grid; grid-template-columns: repeat(3,1fr); gap: 24px; }
  .lp-nav { position: sticky; top: 0; z-index: 100; background: rgba(255,255,255,0.92); backdrop-filter: blur(12px); border-bottom: 1px solid rgba(0,0,0,0.06); padding: 0 24px; }
  .lp-nav-inner { max-width: 1100px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; height: 64px; }
  @media(max-width: 768px) {
    .lp-grid3 { grid-template-columns: 1fr; }
    .lp-hero-title { font-size: 36px !important; }
    .lp-hero-btns { flex-direction: column !important; }
    .lp-hero-btns button { width: 100%; }
    .lp-nav-right { gap: 8px !important; }
    .lp-nav-cta { display: none !important; }
  }
`;

export default function LandingPage() {
  const nav = useNavigate();

  return (
    <div>
      <style>{css}</style>

      {/* ── NAVBAR ── */}
      <nav className="lp-nav">
        <div className="lp-nav-inner">
          <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => nav("/")}>
            <img src="/logo.png" style={{ height: 34 }} alt="Fill & Sell" />
            <span style={{ fontSize: 17, fontWeight: 800, color: C.text }}>Fill & Sell</span>
          </div>
          <div className="lp-nav-right" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={() => nav("/login")} style={{ padding: "8px 18px", background: "transparent", color: C.sub, border: "1px solid rgba(0,0,0,0.12)", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
              Connexion
            </button>
            <button className="lp-btn-main lp-nav-cta" style={{ padding: "8px 20px", fontSize: 14 }} onClick={() => nav("/login")}>
              Essai gratuit
            </button>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section style={{ background: "linear-gradient(135deg,#3EACA0 0%,#60b9b4 45%,#E8956D 100%)", padding: "100px 24px 90px", textAlign: "center", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -80, right: -80, width: 320, height: 320, background: "rgba(255,255,255,0.06)", borderRadius: "50%" }} />
        <div style={{ position: "absolute", bottom: -60, left: -60, width: 240, height: 240, background: "rgba(255,255,255,0.04)", borderRadius: "50%" }} />
        <div style={{ maxWidth: 720, margin: "0 auto", position: "relative" }}>
          <div style={{ display: "inline-block", background: "rgba(255,255,255,0.2)", borderRadius: 99, padding: "5px 16px", fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 28, border: "1px solid rgba(255,255,255,0.3)" }}>
            🚀 Déjà utilisé par des centaines de revendeurs Vinted
          </div>
          <h1 className="lp-hero-title" style={{ fontSize: 52, fontWeight: 900, color: "#fff", letterSpacing: "-2px", lineHeight: 1.1, marginBottom: 22 }}>
            Track tes profits Vinted<br />automatiquement 💰
          </h1>
          <p style={{ fontSize: 19, color: "rgba(255,255,255,0.88)", lineHeight: 1.6, marginBottom: 44, maxWidth: 520, margin: "0 auto 44px" }}>
            Arrête de deviner tes marges. Sache exactement combien tu gagnes — article par article, mois par mois.
          </p>
          <div className="lp-hero-btns" style={{ display: "flex", gap: 14, justifyContent: "center" }}>
            <button className="lp-btn-main" onClick={() => nav("/login")}>Commencer gratuitement →</button>
            <button className="lp-btn-sec" onClick={() => document.getElementById("features").scrollIntoView({ behavior: "smooth" })}>Voir comment ça marche</button>
          </div>
          <p style={{ marginTop: 20, fontSize: 13, color: "rgba(255,255,255,0.6)" }}>✓ Gratuit · ✓ Sans CB · ✓ Prêt en 30 secondes</p>
        </div>
      </section>

      {/* ── STATS ── */}
      <section style={{ background: "#fff", borderBottom: "1px solid rgba(0,0,0,0.06)", padding: "0 24px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(4,1fr)", textAlign: "center" }}>
          {[["500+","Revendeurs actifs"],["12k€","Profits trackés"],["98%","Satisfaction"],["30s","Pour démarrer"]].map(([v, l]) => (
            <div key={l} style={{ padding: "28px 16px" }}>
              <div style={{ fontSize: 36, fontWeight: 900, background: "linear-gradient(135deg,#3EACA0,#E8956D)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{v}</div>
              <div style={{ fontSize: 13, color: C.sub, marginTop: 4 }}>{l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" style={{ padding: "90px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.teal, textTransform: "uppercase", letterSpacing: 2, marginBottom: 12 }}>Fonctionnalités</div>
            <h2 style={{ fontSize: 38, fontWeight: 900, color: C.text, letterSpacing: "-1px", marginBottom: 14 }}>Tout ce qu'il te faut</h2>
            <p style={{ fontSize: 16, color: C.sub, maxWidth: 460, margin: "0 auto" }}>Simple, rapide, efficace. Conçu pour les revendeurs qui veulent scaler.</p>
          </div>
          <div className="lp-grid3">
            {[
              { icon: "📊", title: "Dashboard en temps réel", desc: "Bénéfices du mois, marge moyenne, évolution sur 6 mois. Tout d'un coup d'œil." },
              { icon: "🧮", title: "Calcul automatique des marges", desc: "Entre le prix d'achat et de vente — Fill & Sell calcule instantanément ta marge nette." },
              { icon: "📦", title: "Gestion du stock", desc: "Suis chaque article de l'achat à la vente. Sache ce que tu as en stock et ce que ça vaut." },
              { icon: "📋", title: "Historique complet", desc: "Retrouve toutes tes ventes avec les détails : prix, marge, date. Analyse ce qui marche." },
              { icon: "📱", title: "100% mobile", desc: "Enregistre une vente en 10 secondes depuis ton téléphone, juste après avoir vendu." },
              { icon: "🔒", title: "Données sécurisées", desc: "Tes données sont stockées sur nos serveurs. Accessibles partout, tout le temps." },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="feat-card">
                <div style={{ fontSize: 38, marginBottom: 14 }}>{icon}</div>
                <div style={{ fontSize: 17, fontWeight: 800, color: C.text, marginBottom: 8 }}>{title}</div>
                <div style={{ fontSize: 14, color: C.sub, lineHeight: 1.7 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── MOCK PREVIEW ── */}
      <section style={{ background: "linear-gradient(180deg,#F0FAF9,#F8F7F4)", padding: "80px 24px" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <h2 style={{ fontSize: 34, fontWeight: 900, color: C.text, letterSpacing: "-1px", marginBottom: 12 }}>Un dashboard conçu pour la clarté</h2>
            <p style={{ fontSize: 16, color: C.sub }}>Pas de complexité inutile. Juste les chiffres qui comptent.</p>
          </div>
          {/* Faux screenshot */}
          <div style={{ background: "#fff", borderRadius: 24, overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,0.12)", border: "1px solid rgba(0,0,0,0.06)" }}>
            {/* Header mock */}
            <div style={{ background: "linear-gradient(135deg,#3EACA0cc,#E8956Dcc)", padding: "14px 20px", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 32, height: 32, background: "rgba(255,255,255,0.3)", borderRadius: 9 }} />
              <div style={{ flex: 1, height: 8, background: "rgba(255,255,255,0.4)", borderRadius: 99, maxWidth: 140 }} />
              {["143,00 €","67,50 €","2 art."].map(v => (
                <div key={v} style={{ background: "rgba(255,255,255,0.2)", borderRadius: 10, padding: "5px 14px", fontSize: 12, fontWeight: 800, color: "#fff" }}>{v}</div>
              ))}
            </div>
            {/* KPI mock */}
            <div style={{ padding: 20, display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
              {[
                { icon: "💰", label: "Bénéfice ce mois", val: "143,00 €", color: "#3EACA0" },
                { icon: "📊", label: "Marge moyenne", val: "38.2%", color: "#E8956D" },
                { icon: "🏆", label: "Revenu brut", val: "374,00 €", color: "#3EACA0" },
                { icon: "💸", label: "Capital investi", val: "231,00 €", color: "#DD6B20" },
              ].map(({ icon, label, val, color }) => (
                <div key={label} style={{ background: "#F9FAFB", borderRadius: 14, padding: "14px 16px", border: "1px solid rgba(0,0,0,0.05)" }}>
                  <div style={{ fontSize: 18, marginBottom: 8 }}>{icon}</div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: C.label, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color }}>{val}</div>
                </div>
              ))}
            </div>
            {/* Chart mock */}
            <div style={{ padding: "0 20px 20px" }}>
              <div style={{ background: "#F9FAFB", borderRadius: 14, padding: 16, height: 90, display: "flex", alignItems: "flex-end", gap: 8, border: "1px solid rgba(0,0,0,0.05)" }}>
                {[30, 55, 40, 70, 45, 90].map((h, i) => (
                  <div key={i} style={{ flex: 1, background: i === 5 ? "#3EACA0" : "#3EACA030", borderRadius: "6px 6px 0 0", height: `${h}%`, transition: "all 0.3s" }} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section style={{ padding: "90px 24px", textAlign: "center", background: "linear-gradient(135deg,#3EACA0,#E8956D)" }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <h2 style={{ fontSize: 42, fontWeight: 900, color: "#fff", letterSpacing: "-1.5px", marginBottom: 16 }}>Prêt à booster tes profits ?</h2>
          <p style={{ fontSize: 18, color: "rgba(255,255,255,0.85)", marginBottom: 40, lineHeight: 1.6 }}>
            Rejoins des centaines de revendeurs qui trackent leurs ventes avec Fill & Sell.
          </p>
          <button className="lp-btn-main" style={{ fontSize: 18, padding: "18px 48px", background: "#fff", color: C.teal }} onClick={() => nav("/login")}>
            Commencer gratuitement →
          </button>
          <p style={{ marginTop: 18, fontSize: 13, color: "rgba(255,255,255,0.65)" }}>✓ Gratuit · ✓ Sans CB · ✓ Prêt en 30 secondes</p>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ background: "#111827", padding: "32px 24px", textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 12 }}>
          <img src="/logo.png" style={{ height: 28, filter: "brightness(0) invert(1) opacity(0.7)" }} alt="Fill & Sell" />
          <span style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>Fill & Sell</span>
        </div>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>© 2026 Fill & Sell · Fait pour les revendeurs Vinted 🏷️</p>
      </footer>
    </div>
  );
}
