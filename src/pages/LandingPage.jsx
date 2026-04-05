import { useNavigate } from "react-router-dom";

const C = { teal: "#3EACA0", peach: "#E8956D", text: "#111827", sub: "#6B7280", label: "#9CA3AF" };

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Sora:wght@700;800&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; overflow-x: hidden; background: #F8F7F4; }

  .lp-btn-main {
    padding: 15px 32px;
    background: linear-gradient(135deg,#3EACA0,#E8956D);
    color: #fff; border: none; border-radius: 14px;
    font-size: 16px; font-weight: 700; cursor: pointer;
    box-shadow: 0 8px 24px rgba(62,172,160,0.4);
    transition: all 0.2s; letter-spacing: -0.2px;
  }
  .lp-btn-main:hover { transform: translateY(-3px); box-shadow: 0 14px 32px rgba(62,172,160,0.5); }

  .lp-btn-sec {
    padding: 15px 32px;
    background: rgba(255,255,255,0.12);
    color: #fff; border: 1.5px solid rgba(255,255,255,0.35);
    border-radius: 14px; font-size: 16px; font-weight: 600;
    cursor: pointer; transition: all 0.2s; backdrop-filter: blur(8px);
  }
  .lp-btn-sec:hover { background: rgba(255,255,255,0.22); transform: translateY(-3px); }

  .feat-card {
    background: #fff; border-radius: 20px; padding: 32px 28px;
    border: 1px solid rgba(0,0,0,0.06);
    box-shadow: 0 8px 32px rgba(0,0,0,0.06);
    transition: transform 0.2s, box-shadow 0.2s;
  }
  .feat-card:hover { transform: translateY(-6px); box-shadow: 0 20px 48px rgba(0,0,0,0.1); }

  .lp-grid3 { display: grid; grid-template-columns: repeat(3,1fr); gap: 24px; }

  .lp-nav {
    position: sticky; top: 0; z-index: 100;
    background: rgba(255,255,255,0.92);
    backdrop-filter: blur(16px);
    border-bottom: 1px solid rgba(0,0,0,0.06);
    padding: 0 24px;
  }
  .lp-nav-inner {
    max-width: 1100px; margin: 0 auto;
    display: flex; align-items: center;
    justify-content: space-between; height: 68px;
  }

  .brand-logo {
    font-family: 'Sora', sans-serif;
    font-size: 22px;
    font-weight: 800;
    letter-spacing: -0.5px;
    background: linear-gradient(135deg, #3EACA0, #E8956D);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .hero-badge {
    display: inline-flex; align-items: center; gap: 6px;
    background: rgba(255,255,255,0.18);
    backdrop-filter: blur(8px);
    border-radius: 99px; padding: 6px 16px;
    font-size: 13px; font-weight: 600; color: #fff;
    margin-bottom: 28px;
    border: 1px solid rgba(255,255,255,0.28);
    letter-spacing: 0.1px;
  }

  .stat-value {
    font-size: 40px; font-weight: 900;
    background: linear-gradient(135deg,#3EACA0,#E8956D);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    letter-spacing: -1.5px; line-height: 1;
  }

  .pricing-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  @media(max-width: 768px) {
    .pricing-grid { grid-template-columns: 1fr !important; }
    .lp-grid3 { grid-template-columns: 1fr; }
    .hero-title { font-size: 36px !important; letter-spacing: -1px !important; }
    .hero-sub { font-size: 16px !important; }
    .lp-hero-btns { flex-direction: column !important; }
    .lp-hero-btns button { width: 100%; }
    .lp-nav-cta { display: none !important; }
    .stats-grid { grid-template-columns: repeat(2,1fr) !important; }
    .brand-logo { font-size: 18px; }
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
          {/* Logo premium */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => nav("/")}>
            <img src="/logo.png" style={{ height: 34, objectFit: "contain" }} alt="Fill & Sell" />
            <span className="brand-logo">Fill & Sell</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={() => nav("/login")} style={{
              padding: "8px 18px", background: "transparent", color: C.sub,
              border: "1px solid rgba(0,0,0,0.12)", borderRadius: 10,
              fontSize: 14, fontWeight: 600, cursor: "pointer", transition: "all 0.15s"
            }}>
              Connexion
            </button>
            <button className="lp-btn-main lp-nav-cta" style={{ padding: "8px 20px", fontSize: 14 }} onClick={() => nav("/login")}>
              Essai gratuit
            </button>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section style={{
        background: "linear-gradient(135deg,#3EACA0 0%,#60b9b4 45%,#E8956D 100%)",
        padding: "110px 24px 100px", textAlign: "center",
        position: "relative", overflow: "hidden"
      }}>
        {/* Décorations */}
        <div style={{ position: "absolute", top: -100, right: -80, width: 360, height: 360, background: "rgba(255,255,255,0.06)", borderRadius: "50%", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -60, left: -60, width: 260, height: 260, background: "rgba(255,255,255,0.04)", borderRadius: "50%", pointerEvents: "none" }} />

        <div style={{ maxWidth: 740, margin: "0 auto", position: "relative" }}>
          <div className="hero-badge">
            🚀 Déjà utilisé par des centaines de revendeurs Vinted
          </div>

          <h1 className="hero-title" style={{
            fontSize: 54, fontWeight: 900, color: "#fff",
            letterSpacing: "-2px", lineHeight: 1.1, marginBottom: 24,
            textShadow: "0 2px 24px rgba(0,0,0,0.12)"
          }}>
            Track tes profits Vinted<br />automatiquement 💰
          </h1>

          <p className="hero-sub" style={{
            fontSize: 19, color: "rgba(255,255,255,0.88)",
            lineHeight: 1.65, maxWidth: 520, margin: "0 auto 48px",
            fontWeight: 400
          }}>
            Arrête de deviner tes marges. Sache exactement combien tu gagnes — article par article.
          </p>

          <div className="lp-hero-btns" style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
            <button className="lp-btn-main" style={{ fontSize: 17, padding: "16px 36px" }} onClick={() => nav("/login")}>
              Créer mon compte gratuit →
            </button>
            <button className="lp-btn-sec" onClick={() => document.getElementById("features").scrollIntoView({ behavior: "smooth" })}>
              Voir comment ça marche
            </button>
          </div>

          <p style={{ marginTop: 22, fontSize: 13, color: "rgba(255,255,255,0.55)", letterSpacing: "0.2px" }}>
            ✓ Gratuit · ✓ Sans carte bancaire · ✓ Prêt en 30 secondes
          </p>
        </div>
      </section>

      {/* ── STATS ── */}
      <section style={{ background: "#fff", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 24px" }}>
          <div className="stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", textAlign: "center" }}>
            {[
              ["500+", "Revendeurs actifs"],
              ["12k€", "Profits trackés"],
              ["98%", "Satisfaction"],
              ["30s", "Pour démarrer"],
            ].map(([v, l]) => (
              <div key={l} style={{ padding: "30px 16px" }}>
                <div className="stat-value">{v}</div>
                <div style={{ fontSize: 13, color: C.sub, marginTop: 6, fontWeight: 500 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" style={{ padding: "96px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 60 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.teal, textTransform: "uppercase", letterSpacing: "2px", marginBottom: 14 }}>
              Fonctionnalités
            </div>
            <h2 style={{ fontSize: 38, fontWeight: 900, color: C.text, letterSpacing: "-1.2px", marginBottom: 16 }}>
              Tout ce qu'il te faut pour scaler
            </h2>
            <p style={{ fontSize: 17, color: C.sub, maxWidth: 460, margin: "0 auto", lineHeight: 1.65 }}>
              Simple, rapide, efficace. Conçu pour les revendeurs qui veulent voir leurs profits augmenter.
            </p>
          </div>

          <div className="lp-grid3">
            {[
              { icon: "📊", title: "Vois instantanément combien tu gagnes", desc: "Bénéfices du mois, marge moyenne, évolution sur 6 mois — tout d'un seul coup d'œil, sans calcul." },
              { icon: "🧮", title: "Calcule tes marges sans effort", desc: "Entre le prix d'achat et de vente — Fill & Sell calcule ta marge nette instantanément." },
              { icon: "📦", title: "Garde le contrôle sur ton stock", desc: "Suis chaque article de l'achat à la vente. Sache toujours ce que tu as en stock et ce que ça vaut." },
              { icon: "📋", title: "Analyse ce qui te rapporte vraiment", desc: "Retrouve toutes tes ventes passées avec les détails : prix, marge, date. Optimise ta stratégie." },
              { icon: "📱", title: "Enregistre une vente en 10 secondes", desc: "Depuis ton téléphone, juste après avoir vendu un article. Simple et rapide comme une notification." },
              { icon: "🔒", title: "Tes données toujours disponibles", desc: "Stockées en sécurité sur nos serveurs. Accessibles depuis n'importe quel appareil, à tout moment." },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="feat-card">
                <div style={{ fontSize: 36, marginBottom: 16 }}>{icon}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 10, letterSpacing: "-0.3px", lineHeight: 1.3 }}>{title}</div>
                <div style={{ fontSize: 14, color: C.sub, lineHeight: 1.7 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PREVIEW ── */}
      <section style={{ background: "linear-gradient(180deg,#F0FAF9,#F8F7F4)", padding: "80px 24px" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 52 }}>
            <h2 style={{ fontSize: 36, fontWeight: 900, color: C.text, letterSpacing: "-1.2px", marginBottom: 14 }}>
              Visualise tes profits en un coup d'œil
            </h2>
            <p style={{ fontSize: 16, color: C.sub, lineHeight: 1.65, maxWidth: 480, margin: "0 auto" }}>
              Des statistiques claires pour comprendre ce qui te rapporte vraiment.
            </p>
          </div>

          {/* Mock dashboard */}
          <div style={{ background: "#fff", borderRadius: 24, overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,0.12)", border: "1px solid rgba(0,0,0,0.06)" }}>
            {/* Header mock */}
            <div style={{ background: "linear-gradient(135deg,#3EACA0cc,#E8956Dcc)", padding: "14px 20px", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 32, height: 32, background: "rgba(255,255,255,0.3)", borderRadius: 9 }} />
              <div style={{ flex: 1, height: 8, background: "rgba(255,255,255,0.4)", borderRadius: 99, maxWidth: 140 }} />
              {["143,00 €", "67,50 €", "2 art."].map(v => (
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
                  <div key={i} style={{ flex: 1, background: i === 5 ? "#3EACA0" : "#3EACA025", borderRadius: "6px 6px 0 0", height: `${h}%`, transition: "all 0.3s" }} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>


      {/* ── PRICING ── */}
      <section style={{ padding: "90px 24px", background: "#fff" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.teal, textTransform: "uppercase", letterSpacing: "2px", marginBottom: 14 }}>Tarifs</div>
            <h2 style={{ fontSize: 38, fontWeight: 900, color: C.text, letterSpacing: "-1px", marginBottom: 16 }}>Simple et transparent</h2>
            <p style={{ fontSize: 16, color: C.sub, maxWidth: 420, margin: "0 auto" }}>Commence gratuitement, passe au premium quand tu es prêt à scaler.</p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, maxWidth: 700, margin: "0 auto" }}>
            {/* Gratuit */}
            <div style={{ background: "#F9FAFB", borderRadius: 20, padding: "32px 28px", border: "1px solid rgba(0,0,0,0.08)", display:"flex", flexDirection:"column" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.sub, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Gratuit</div>
              <div style={{ fontSize: 40, fontWeight: 900, color: C.text, letterSpacing: "-1.5px", marginBottom: 4 }}>0 €</div>
              <div style={{ fontSize: 13, color: C.sub, marginBottom: 28 }}>Idéal pour débuter</div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14, marginBottom: 0 }}>
                {[
                  { label: "Articles en stock", value: "20 max" },
                  { label: "Dashboard", ok: true },
                  { label: "Calcul des marges", ok: true },
                  { label: "Historique des ventes", ok: true },
                  { label: "Statistiques avancées", ok: false },
                  { label: "Support prioritaire", ok: false },
                ].map(({ label, ok, value }) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 16, flexShrink: 0 }}>{ok === false ? "✗" : "✓"}</span>
                    <span style={{ fontSize: 14, color: ok === false ? C.label : C.text, textDecoration: ok === false ? "none" : "none" }}>
                      {label}{value ? ` — ${value}` : ""}
                    </span>
                  </div>
                ))}
              </div>
              <button onClick={() => nav("/login")} style={{ marginTop: 28, width: "100%", padding: "13px", background: "transparent", color: C.teal, border: `1.5px solid ${C.teal}`, borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer", transition: "all 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.background = C.teal; e.currentTarget.style.color = "#fff"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.teal; }}
              >
                Commencer gratuitement
              </button>
            </div>

            {/* Premium */}
            <div style={{ background: "linear-gradient(135deg,#3EACA0,#E8956D)", borderRadius: 20, padding: "32px 28px", position: "relative", overflow: "hidden", boxShadow: "0 20px 60px rgba(62,172,160,0.3)", display:"flex", flexDirection:"column" }}>
              <div style={{ position: "absolute", top: -30, right: -30, width: 120, height: 120, background: "rgba(255,255,255,0.08)", borderRadius: "50%" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.8)", textTransform: "uppercase", letterSpacing: 1 }}>Premium</div>
                <span style={{ background: "rgba(255,255,255,0.25)", color: "#fff", fontSize: 11, fontWeight: 800, borderRadius: 99, padding: "3px 10px", border: "1px solid rgba(255,255,255,0.4)" }}>⭐ Le plus populaire</span>
              </div>
              <div style={{ fontSize: 40, fontWeight: 900, color: "#fff", letterSpacing: "-1.5px", marginBottom: 4 }}>4,99 €</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", marginBottom: 8 }}>par mois · sans engagement</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.9)", fontWeight: 600, marginBottom: 20 }}>🚀 Débloque toutes les fonctionnalités en 1 clic</div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14, marginBottom: 0 }}>
                {[
                  { label: "Articles illimités en stock" },
                  { label: "Dashboard complet" },
                  { label: "Calcul des marges" },
                  { label: "Historique des ventes" },
                  { label: "Statistiques avancées" },
                  { label: "Support prioritaire" },
                ].map(({ label }) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 16, flexShrink: 0, color: "#fff" }}>✓</span>
                    <span style={{ fontSize: 14, color: "#fff", fontWeight: 500 }}>{label}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => nav("/login")} style={{ marginTop: 28, width: "100%", padding: "13px", background: "#fff", color: C.teal, border: "none", borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: "0 8px 24px rgba(0,0,0,0.15)", transition: "all 0.2s" }}
                onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 12px 32px rgba(0,0,0,0.2)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.15)"; }}
              >
                🔓 Débloquer l'illimité
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section style={{ padding: "96px 24px", textAlign: "center", background: "linear-gradient(135deg,#3EACA0,#E8956D)" }}>
        <div style={{ maxWidth: 620, margin: "0 auto" }}>
          <h2 style={{ fontSize: 42, fontWeight: 900, color: "#fff", letterSpacing: "-1.5px", marginBottom: 18, lineHeight: 1.1 }}>
            Commence à suivre tes profits<br />dès aujourd'hui
          </h2>
          <p style={{ fontSize: 18, color: "rgba(255,255,255,0.82)", marginBottom: 44, lineHeight: 1.65 }}>
            Rejoins des centaines de revendeurs qui ont repris le contrôle de leurs marges.
          </p>
          <button className="lp-btn-main" style={{
            fontSize: 18, padding: "18px 48px",
            background: "#fff", color: C.teal,
            boxShadow: "0 12px 40px rgba(0,0,0,0.15)"
          }} onClick={() => nav("/login")}>
            Créer mon compte gratuit →
          </button>
          <p style={{ marginTop: 20, fontSize: 13, color: "rgba(255,255,255,0.55)" }}>
            ✓ Gratuit · ✓ Sans CB · ✓ Prêt en 30 secondes
          </p>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ background: "#0F172A", padding: "36px 24px", textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 12 }}>
          <img src="/logo.png" style={{ height: 26, filter: "brightness(0) invert(1) opacity(0.5)" }} alt="Fill & Sell" />
          <span style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.5)", letterSpacing: "-0.3px" }}>Fill & Sell</span>
        </div>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.25)" }}>© 2026 Fill & Sell · Fait pour les revendeurs Vinted 🏷️</p>
      </footer>
    </div>
  );
}
