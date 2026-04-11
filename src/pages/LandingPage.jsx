import { useState, useEffect } from 'react';
import { useNavigate } from "react-router-dom";
import { track } from '../analytics/analytics';
import { landingTranslations } from '../i18n/translations';

const C = { teal: "#3EACA0", peach: "#E8956D", text: "#111827", sub: "#6B7280", label: "#9CA3AF" };

function getBrowserLang() {
  const saved = localStorage.getItem('fs_lang');
  if (saved) return saved;
  const bl = (navigator.language || navigator.userLanguage || 'fr').toLowerCase().split('-')[0];
  return bl === 'fr' ? 'fr' : 'en';
}

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Plus+Jakarta+Sans:ital,wght@1,700;1,800&display=swap');
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
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 22px;
    font-weight: 800;
    font-style: italic;
    letter-spacing: 0.2px;
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

const FEAT_ICONS = ["📦","📊","🧮","📋","📤","📈"];

export default function LandingPage() {
  const nav = useNavigate();
  const [lang, setLang] = useState(getBrowserLang);
  const l = landingTranslations[lang] || landingTranslations.fr;

  useEffect(() => { track('page_view', { page: 'landing' }); }, []);

  function changeLang(code) {
    setLang(code);
    localStorage.setItem('fs_lang', code);
    track('change_language', { language: code });
  }

  const features = [
    { icon: FEAT_ICONS[0], title: l.feature1Title, desc: l.feature1Desc },
    { icon: FEAT_ICONS[1], title: l.feature2Title, desc: l.feature2Desc },
    { icon: FEAT_ICONS[2], title: l.feature3Title, desc: l.feature3Desc },
    { icon: FEAT_ICONS[3], title: l.feature4Title, desc: l.feature4Desc },
    { icon: FEAT_ICONS[4], title: l.feature5Title, desc: l.feature5Desc },
    { icon: FEAT_ICONS[5], title: l.feature6Title, desc: l.feature6Desc },
  ];

  return (
    <div>
      <style>{css}</style>

      {/* ── NAVBAR ── */}
      <nav className="lp-nav">
        <div className="lp-nav-inner">
          <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => nav("/")}>
            <img src="/logo.png" style={{ height: 34, objectFit: "contain" }} alt="Fill & Sell" />
            <span className="brand-logo">Fill & Sell</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Lang toggle */}
            <div style={{ display:"flex", alignItems:"center", gap:2, background:"rgba(0,0,0,0.06)", borderRadius:99, padding:3 }}>
              {['fr','en'].map(code => (
                <button key={code} onClick={() => changeLang(code)}
                  style={{ padding:"4px 10px", borderRadius:99, border:"none", fontSize:12, fontWeight:800, cursor:"pointer", transition:"all 0.15s",
                           background: lang===code ? "#fff" : "transparent",
                           color: lang===code ? "#0D0D0D" : "#6B7280",
                           boxShadow: lang===code ? "0 1px 3px rgba(0,0,0,0.1)" : "none" }}>
                  {code.toUpperCase()}
                </button>
              ))}
            </div>
            <button onClick={() => nav("/login")} style={{
              padding: "8px 18px", background: "transparent", color: C.sub,
              border: "1px solid rgba(0,0,0,0.12)", borderRadius: 10,
              fontSize: 14, fontWeight: 600, cursor: "pointer", transition: "all 0.15s"
            }}>
              {l.navLogin}
            </button>
            <button className="lp-btn-main lp-nav-cta" style={{ padding: "8px 20px", fontSize: 14 }} onClick={() => nav("/login")}>
              {l.navCta}
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
        <div style={{ position: "absolute", top: -100, right: -80, width: 360, height: 360, background: "rgba(255,255,255,0.06)", borderRadius: "50%", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -60, left: -60, width: 260, height: 260, background: "rgba(255,255,255,0.04)", borderRadius: "50%", pointerEvents: "none" }} />

        <div style={{ maxWidth: 740, margin: "0 auto", position: "relative" }}>
          <div className="hero-badge">{l.badge}</div>

          <h1 className="hero-title" style={{
            fontSize: 54, fontWeight: 900, color: "#fff",
            letterSpacing: "-2px", lineHeight: 1.1, marginBottom: 24,
            textShadow: "0 2px 24px rgba(0,0,0,0.12)"
          }}>
            {l.heroTitle1}<br />{l.heroTitle2} {l.heroEmoji}
          </h1>

          <p className="hero-sub" style={{
            fontSize: 19, color: "rgba(255,255,255,0.88)",
            lineHeight: 1.65, maxWidth: 520, margin: "0 auto 48px",
            fontWeight: 400
          }}>
            {l.heroSub}
          </p>

          <div className="lp-hero-btns" style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
            <button className="lp-btn-main" style={{ fontSize: 17, padding: "16px 36px" }}
              onClick={() => { track('cta_click', { cta: 'hero_signup', page: 'landing' }); nav("/login"); }}>
              {l.heroCta}
            </button>
            <button className="lp-btn-sec"
              onClick={() => { track('cta_click', { cta: 'how_it_works', page: 'landing' }); document.getElementById("features").scrollIntoView({ behavior: "smooth" }); }}>
              {l.heroSecondary}
            </button>
          </div>

          <p style={{ marginTop: 22, fontSize: 13, color: "rgba(255,255,255,0.55)", letterSpacing: "0.2px" }}>
            {l.heroFree} · {l.heroNoCard} · {l.heroReady}
          </p>
        </div>
      </section>

      {/* ── STATS ── */}
      <section style={{ background: "#fff", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 24px" }}>
          <div className="stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", textAlign: "center" }}>
            {[
              [l.stat1Val, l.stat1Label],
              [l.stat2Val, l.stat2Label],
              [l.stat3Val, l.stat3Label],
              [l.stat4Val, l.stat4Label],
            ].map(([v, lbl]) => (
              <div key={lbl} style={{ padding: "30px 16px" }}>
                <div className="stat-value">{v}</div>
                <div style={{ fontSize: 13, color: C.sub, marginTop: 6, fontWeight: 500 }}>{lbl}</div>
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
              {l.featuresLabel}
            </div>
            <h2 style={{ fontSize: 38, fontWeight: 900, color: C.text, letterSpacing: "-1.2px", marginBottom: 16 }}>
              {l.featuresTitle}{" "}
              <span style={{ background: "linear-gradient(135deg,#3EACA0,#E8956D)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
                {l.featuresTitleAccent}
              </span>
            </h2>
          </div>

          <div className="lp-grid3">
            {features.map(({ icon, title, desc }) => (
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
              {l.previewTitle}
            </h2>
            <p style={{ fontSize: 16, color: C.sub, lineHeight: 1.65, maxWidth: 480, margin: "0 auto" }}>
              {l.previewSub}
            </p>
          </div>

          {/* Mock dashboard */}
          <div style={{ background: "#fff", borderRadius: 24, overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,0.12)", border: "1px solid rgba(0,0,0,0.06)" }}>
            <div style={{ background: "linear-gradient(135deg,#3EACA0cc,#E8956Dcc)", padding: "14px 20px", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 32, height: 32, background: "rgba(255,255,255,0.3)", borderRadius: 9 }} />
              <div style={{ flex: 1, height: 8, background: "rgba(255,255,255,0.4)", borderRadius: 99, maxWidth: 140 }} />
              {["143,00 €", "67,50 €", "2 art."].map(v => (
                <div key={v} style={{ background: "rgba(255,255,255,0.2)", borderRadius: 10, padding: "5px 14px", fontSize: 12, fontWeight: 800, color: "#fff" }}>{v}</div>
              ))}
            </div>
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
            <div style={{ fontSize: 12, fontWeight: 700, color: C.teal, textTransform: "uppercase", letterSpacing: "2px", marginBottom: 14 }}>{l.pricingLabel}</div>
            <h2 style={{ fontSize: 38, fontWeight: 900, color: C.text, letterSpacing: "-1px", marginBottom: 16 }}>{l.pricingTitle}</h2>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24, maxWidth: 700, margin: "0 auto" }}>
            {/* Gratuit */}
            <div style={{ background: "#F9FAFB", borderRadius: 20, padding: "32px 28px", border: "1px solid rgba(0,0,0,0.08)", display:"flex", flexDirection:"column" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.sub, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>{l.pricingFreeTitle}</div>
              <div style={{ fontSize: 40, fontWeight: 900, color: C.text, letterSpacing: "-1.5px", marginBottom: 4 }}>{l.pricingFreePrice}</div>
              <div style={{ fontSize: 13, color: C.sub, marginBottom: 28 }}>{l.pricingFreePeriod}</div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14, marginBottom: 0 }}>
                {l.pricingFreeFeatures.map(feat => (
                  <div key={feat} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 16, flexShrink: 0 }}>✓</span>
                    <span style={{ fontSize: 14, color: C.text }}>{feat}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => nav("/login")} style={{ marginTop: 28, width: "100%", padding: "13px", background: "transparent", color: C.teal, border: `1.5px solid ${C.teal}`, borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer", transition: "all 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.background = C.teal; e.currentTarget.style.color = "#fff"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.teal; }}
              >
                {l.pricingFreeCta}
              </button>
            </div>

            {/* Premium */}
            <div style={{ background: "linear-gradient(135deg,#3EACA0,#E8956D)", borderRadius: 20, padding: "32px 28px", position: "relative", overflow: "hidden", boxShadow: "0 20px 60px rgba(62,172,160,0.3)", display:"flex", flexDirection:"column" }}>
              <div style={{ position: "absolute", top: -30, right: -30, width: 120, height: 120, background: "rgba(255,255,255,0.08)", borderRadius: "50%" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.8)", textTransform: "uppercase", letterSpacing: 1 }}>{l.pricingProTitle}</div>
                <span style={{ background: "rgba(255,255,255,0.25)", color: "#fff", fontSize: 11, fontWeight: 800, borderRadius: 99, padding: "3px 10px", border: "1px solid rgba(255,255,255,0.4)" }}>⭐ {l.pricingProBadge}</span>
              </div>
              <div style={{ fontSize: 40, fontWeight: 900, color: "#fff", letterSpacing: "-1.5px", marginBottom: 4 }}>{l.pricingProPrice}</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", marginBottom: 20 }}>{l.pricingProPeriod}</div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14, marginBottom: 0 }}>
                {l.pricingProFeatures.map(feat => (
                  <div key={feat} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 16, flexShrink: 0, color: "#fff" }}>✓</span>
                    <span style={{ fontSize: 14, color: "#fff", fontWeight: 500 }}>{feat}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => nav("/login")} style={{ marginTop: 28, width: "100%", padding: "13px", background: "#fff", color: C.teal, border: "none", borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: "0 8px 24px rgba(0,0,0,0.15)", transition: "all 0.2s" }}
                onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 12px 32px rgba(0,0,0,0.2)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.15)"; }}
              >
                {l.pricingProCta}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section style={{ padding: "96px 24px", textAlign: "center", background: "linear-gradient(135deg,#3EACA0,#E8956D)" }}>
        <div style={{ maxWidth: 620, margin: "0 auto" }}>
          <h2 style={{ fontSize: 42, fontWeight: 900, color: "#fff", letterSpacing: "-1.5px", marginBottom: 18, lineHeight: 1.1 }}>
            {l.ctaTitle}
          </h2>
          <p style={{ fontSize: 18, color: "rgba(255,255,255,0.82)", marginBottom: 44, lineHeight: 1.65 }}>
            {l.ctaSub}
          </p>
          <button className="lp-btn-main" style={{
            fontSize: 18, padding: "18px 48px",
            background: "#fff", color: C.teal,
            boxShadow: "0 12px 40px rgba(0,0,0,0.15)"
          }} onClick={() => nav("/login")}>
            {l.ctaBtn}
          </button>
          <p style={{ marginTop: 20, fontSize: 13, color: "rgba(255,255,255,0.55)" }}>
            {l.ctaNote}
          </p>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ background: "#0F172A", padding: "36px 24px", textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 8 }}>
          <img src="/logo.png" style={{ height: 26, filter: "brightness(0) invert(1) opacity(0.5)" }} alt="Fill & Sell" />
          <span style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.5)", letterSpacing: "-0.3px" }}>Fill & Sell</span>
        </div>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", marginBottom: 6 }}>{l.footerTagline}</p>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.25)" }}>{l.footerRights}</p>
      </footer>
    </div>
  );
}
