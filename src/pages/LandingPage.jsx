import { useState, useEffect } from 'react';
import { useNavigate } from "react-router-dom";
import { track } from '../analytics/analytics';
import { landingTranslations } from '../i18n/translations';

const C = { teal: "#3EACA0", peach: "#E8956D", text: "#111827", sub: "#6B7280", label: "#9CA3AF" };

function getMargeMessage(marginPct,marginEur){
  if(marginEur>=500) return{msg:"Jackpot 💎",color:"#1D9E75"};
  if(marginEur>=200) return{msg:"Grosse affaire 🤑",color:"#1D9E75"};
  if(marginEur>=100) return{msg:"Très belle vente 🚀",color:"#1D9E75"};
  if(marginEur>=50)  return{msg:"Belle marge 💪",color:"#1D9E75"};
  if(marginPct>=50) return{msg:"Affaire en or 🏆",color:"#1D9E75"};
  if(marginPct>=35) return{msg:"Excellent deal 🔥",color:"#1D9E75"};
  if(marginPct>=25) return{msg:"Très bon deal ✅",color:"#1D9E75"};
  if(marginPct>=15) return{msg:"Pas mal 👍",color:"#5DCAA5"};
  if(marginPct>=8)  return{msg:"Moyen, à toi de voir 🤔",color:"#F9A26C"};
  if(marginPct>=1)  return{msg:"Marge très faible ⚠️",color:"#F9A26C"};
  if(marginPct===0) return{msg:"Aucun bénéfice",color:"#6B7280"};
  if(marginPct>=-10) return{msg:"Légère perte 😬",color:"#E53E3E"};
  if(marginPct>=-30) return{msg:"Perte significative ❌",color:"#E53E3E"};
  return{msg:"Grosse perte, évite 🚨",color:"#E53E3E"};
}

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
    font-size: 22px; font-weight: 800; font-style: italic;
    letter-spacing: 0.2px;
    background: linear-gradient(135deg, #3EACA0, #E8956D);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
  }

  .hero-badge {
    display: inline-flex; align-items: center; gap: 6px;
    background: rgba(255,255,255,0.18); backdrop-filter: blur(8px);
    border-radius: 99px; padding: 6px 16px;
    font-size: 13px; font-weight: 600; color: #fff;
    margin-bottom: 28px;
    border: 1px solid rgba(255,255,255,0.28); letter-spacing: 0.1px;
  }

  .stat-value {
    font-size: 40px; font-weight: 900;
    background: linear-gradient(135deg,#3EACA0,#E8956D);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    letter-spacing: -1.5px; line-height: 1;
  }

  .calc-inp {
    flex: 1; min-width: 0; width: 100%;
    padding: 10px 14px; border-radius: 12px;
    border: 1.5px solid rgba(255,255,255,0.25);
    background: rgba(255,255,255,0.15);
    color: #fff; font-size: 15px; font-weight: 600; outline: none;
    transition: border-color 0.2s, background 0.2s;
    font-family: 'Inter', sans-serif;
  }
  .calc-inp::placeholder { color: rgba(255,255,255,0.48); font-weight: 400; }
  .calc-inp:focus { border-color: rgba(255,255,255,0.6); background: rgba(255,255,255,0.22); }
  .calc-inp::-webkit-outer-spin-button,
  .calc-inp::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
  .calc-row { display: flex; gap: 10px; margin-bottom: 14px; }
  .calc-val { transition: color 0.35s ease; }
  .calc-msg { animation: calcFadeIn 0.2s ease; }
  @keyframes calcFadeIn { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:translateY(0); } }

  .faq-details { border-bottom: 1px solid rgba(0,0,0,0.07); }
  .faq-details summary { list-style: none; cursor: pointer; padding: 18px 0; display: flex; justify-content: space-between; align-items: center; }
  .faq-details summary::-webkit-details-marker { display: none; }
  .faq-details[open] .faq-plus { transform: rotate(45deg); }
  .faq-plus { font-size: 22px; color: #3EACA0; transition: transform 0.2s; flex-shrink: 0; }

  @media(max-width: 768px) {
    .lp-grid3 { grid-template-columns: 1fr; }
    .calc-row { flex-direction: column; }
    .dash-kpi { grid-template-columns: repeat(2,1fr) !important; }
    .hero-title { font-size: 36px !important; letter-spacing: -1px !important; }
    .hero-sub { font-size: 16px !important; }
    .lp-hero-btns { flex-direction: column !important; }
    .lp-hero-btns button { width: 100%; }
    .lp-nav-cta { display: none !important; }
    .stats-grid { grid-template-columns: repeat(2,1fr) !important; }
    .brand-logo { font-size: 18px; }
    .pricing-grid { grid-template-columns: 1fr !important; }
  }
`;

const FEAT_ICONS = ["📦","📊","🧮","📋","📤","📈"];

export default function LandingPage() {
  const nav = useNavigate();
  const [lang, setLang] = useState(getBrowserLang);
  const [cBuy, setCBuy] = useState('');
  const [cSell, setCSell] = useState('');
  const [cFees, setCFees] = useState('');

  const l = landingTranslations[lang] || landingTranslations.fr;

  const calcBuy = parseFloat(cBuy) || 0;
  const calcSell = parseFloat(cSell) || 0;
  const calcFees = parseFloat(cFees) || 0;
  const calcMargin = calcSell - calcBuy - calcFees;
  const calcPct = calcBuy > 0 ? (calcMargin / calcBuy) * 100 : 0;
  const hasResult = calcBuy > 0 && calcSell > 0;
  const { msg: calcMsg, color: calcColor } = !hasResult
    ? { msg: '', color: '#6B7280' }
    : getMargeMessage(calcPct, calcMargin);

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
      <nav className="lp-nav" aria-label="Navigation principale">
        <div className="lp-nav-inner">
          <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => nav("/")}>
            <img src="/logo.png" height={34} style={{ objectFit: "contain" }}
              alt="Fill & Sell — tracker profits revente" />
            <span className="brand-logo">Fill & Sell</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Lang toggle */}
            <div style={{ display:"flex", alignItems:"center", gap:2, background:"rgba(0,0,0,0.06)", borderRadius:99, padding:3 }}>
              {['fr','en'].map(code => (
                <button key={code} onClick={() => changeLang(code)}
                  aria-label={`Passer en ${code.toUpperCase()}`}
                  style={{ padding:"4px 10px", borderRadius:99, border:"none", fontSize:12, fontWeight:800, cursor:"pointer", transition:"all 0.15s",
                           background: lang===code ? "#fff" : "transparent",
                           color: lang===code ? "#0D0D0D" : "#6B7280",
                           boxShadow: lang===code ? "0 1px 3px rgba(0,0,0,0.1)" : "none" }}>
                  {code.toUpperCase()}
                </button>
              ))}
            </div>
            <button onClick={() => nav("/login")}
              aria-label="Se connecter à Fill & Sell"
              style={{ padding:"8px 18px", background:"transparent", color:C.sub, border:"1px solid rgba(0,0,0,0.12)", borderRadius:10, fontSize:14, fontWeight:600, cursor:"pointer", transition:"all 0.15s" }}>
              {l.navLogin}
            </button>
            <button className="lp-btn-main lp-nav-cta" style={{ padding:"8px 20px", fontSize:14 }}
              onClick={() => nav("/login")}
              aria-label="Créer un compte gratuit sur Fill & Sell">
              {l.navCta}
            </button>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section style={{ background:"linear-gradient(135deg,#3EACA0 0%,#60b9b4 45%,#E8956D 100%)", padding:"110px 24px 100px", textAlign:"center", position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", top:-100, right:-80, width:360, height:360, background:"rgba(255,255,255,0.06)", borderRadius:"50%", pointerEvents:"none" }} />
        <div style={{ position:"absolute", bottom:-60, left:-60, width:260, height:260, background:"rgba(255,255,255,0.04)", borderRadius:"50%", pointerEvents:"none" }} />

        <div style={{ maxWidth:740, margin:"0 auto", position:"relative" }}>
          <p className="hero-badge">{l.badge}</p>

          <h1 className="hero-title" style={{ fontSize:54, fontWeight:900, color:"#fff", letterSpacing:"-2px", lineHeight:1.1, marginBottom:24, textShadow:"0 2px 24px rgba(0,0,0,0.12)" }}>
            {l.heroTitle1}<br />{l.heroTitle2} {l.heroEmoji}
          </h1>

          <p className="hero-sub" style={{ fontSize:19, color:"rgba(255,255,255,0.88)", lineHeight:1.65, maxWidth:520, margin:"0 auto 48px", fontWeight:400 }}>
            {l.heroSub}
          </p>

          <div className="lp-hero-btns" style={{ display:"flex", gap:14, justifyContent:"center", flexWrap:"wrap" }}>
            <button className="lp-btn-main" style={{ fontSize:17, padding:"16px 36px" }}
              aria-label="Créer un compte gratuit sur Fill & Sell"
              onClick={() => { track('cta_click', { cta:'hero_signup', page:'landing' }); nav("/login"); }}>
              {l.heroCta}
            </button>
            <button className="lp-btn-sec"
              aria-label="Voir comment fonctionne Fill & Sell"
              onClick={() => { track('cta_click', { cta:'how_it_works', page:'landing' }); document.getElementById("features").scrollIntoView({ behavior:"smooth" }); }}>
              {l.heroSecondary}
            </button>
          </div>

          <p style={{ marginTop:22, fontSize:13, color:"rgba(255,255,255,0.55)", letterSpacing:"0.2px" }}>
            {l.heroFree} · {l.heroNoCard} · {l.heroReady}
          </p>

          {/* ── Calculateur marge ── */}
          <div style={{ marginTop:32, background:"rgba(255,255,255,0.1)", backdropFilter:"blur(14px)", borderRadius:20, padding:"24px 28px", maxWidth:520, marginLeft:"auto", marginRight:"auto", border:"1px solid rgba(255,255,255,0.2)", boxShadow:"0 8px 32px rgba(0,0,0,0.1)" }}>
            <p style={{ fontSize:12, fontWeight:700, color:"rgba(255,255,255,0.7)", textTransform:"uppercase", letterSpacing:"1.8px", marginBottom:16, textAlign:"center" }}>
              🧮 {lang === 'fr' ? 'Calcule ta marge' : 'Calculate your margin'}
            </p>
            <div className="calc-row">
              <input className="calc-inp" type="number" min="0" step="0.01"
                placeholder={lang === 'fr' ? 'Achat €' : 'Buy €'}
                value={cBuy} onChange={e => setCBuy(e.target.value)} />
              <input className="calc-inp" type="number" min="0" step="0.01"
                placeholder={lang === 'fr' ? 'Vente €' : 'Sell €'}
                value={cSell} onChange={e => setCSell(e.target.value)} />
              <input className="calc-inp" type="number" min="0" step="0.01"
                placeholder={lang === 'fr' ? 'Frais annexes €' : 'Additional fees €'}
                value={cFees} onChange={e => setCFees(e.target.value)} />
            </div>
            <div style={{ textAlign:"center", padding:"14px 16px", background: hasResult ? `${calcColor}14` : "rgba(255,255,255,0.06)", borderRadius:14, border:`1px solid ${hasResult ? calcColor + '40' : 'rgba(255,255,255,0.12)'}`, transition:"background 0.3s ease, border-color 0.3s ease" }}>
              {hasResult ? (
                <>
                  <div className="calc-val" style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:10, flexWrap:"wrap" }}>
                    <span style={{ fontSize:32, fontWeight:900, color:calcColor, letterSpacing:"-0.5px" }}>
                      {calcMargin >= 0 ? '+' : ''}{calcMargin.toFixed(2)} €
                    </span>
                    <span style={{ fontSize:13, fontWeight:800, color:calcColor, background:`${calcColor}26`, borderRadius:99, padding:"2px 10px" }}>
                      {calcPct.toFixed(1)}%
                    </span>
                  </div>
                  <p key={calcMsg} className="calc-val calc-msg" style={{ fontSize:14, fontWeight:800, color:calcColor, marginTop:6 }}>{calcMsg}</p>
                </>
              ) : (
                <p style={{ fontSize:13, color:"rgba(255,255,255,0.4)", fontWeight:500 }}>
                  {lang === 'fr' ? 'Entre tes prix pour voir ta marge 👆' : 'Enter prices to see your margin 👆'}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS ── */}
      <section aria-label="Chiffres clés" style={{ background:"#fff", borderBottom:"1px solid rgba(0,0,0,0.06)" }}>
        <div style={{ maxWidth:900, margin:"0 auto", padding:"0 24px" }}>
          <div className="stats-grid" style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", textAlign:"center" }}>
            {[
              [l.stat1Val, l.stat1Label],
              [l.stat2Val, l.stat2Label],
              [l.stat3Val, l.stat3Label],
              [l.stat4Val, l.stat4Label],
            ].map(([v, lbl]) => (
              <div key={lbl} style={{ padding:"30px 16px" }}>
                <div className="stat-value">{v}</div>
                <div style={{ fontSize:13, color:C.sub, marginTop:6, fontWeight:500 }}>{lbl}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" style={{ padding:"96px 24px" }}>
        <div style={{ maxWidth:1100, margin:"0 auto" }}>
          <div style={{ textAlign:"center", marginBottom:60 }}>
            <p style={{ fontSize:12, fontWeight:700, color:C.teal, textTransform:"uppercase", letterSpacing:"2px", marginBottom:14 }}>
              {l.featuresLabel}
            </p>
            <h2 style={{ fontSize:38, fontWeight:900, color:C.text, letterSpacing:"-1.2px", marginBottom:16 }}>
              {l.featuresTitle}{" "}
              <span style={{ background:"linear-gradient(135deg,#3EACA0,#E8956D)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
                {l.featuresTitleAccent}
              </span>
            </h2>
          </div>

          <div className="lp-grid3">
            {features.map(({ icon, title, desc }) => (
              <article key={title} className="feat-card">
                <div style={{ fontSize:36, marginBottom:16 }} aria-hidden="true">{icon}</div>
                <h3 style={{ fontSize:16, fontWeight:800, color:C.text, marginBottom:10, letterSpacing:"-0.3px", lineHeight:1.3 }}>{title}</h3>
                <p style={{ fontSize:14, color:C.sub, lineHeight:1.7 }}>{desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── PREVIEW ── */}
      <section aria-label="Aperçu de l'application" style={{ background:"linear-gradient(180deg,#F0FAF9,#F8F7F4)", padding:"80px 24px" }}>
        <div style={{ maxWidth:860, margin:"0 auto" }}>
          <div style={{ textAlign:"center", marginBottom:52 }}>
            <h2 style={{ fontSize:36, fontWeight:900, color:C.text, letterSpacing:"-1.2px", marginBottom:14 }}>
              {l.previewTitle}
            </h2>
            <p style={{ fontSize:16, color:C.sub, lineHeight:1.65, maxWidth:480, margin:"0 auto" }}>
              {l.previewSub}
            </p>
          </div>

          {/* Faux dashboard fidèle au design de l'app */}
          <div className="dash-wrap" style={{ fontFamily:"'Nunito', 'Inter', sans-serif", background:"#fff", borderRadius:20, overflow:"hidden", boxShadow:"0 32px 80px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.06)", border:"1px solid rgba(0,0,0,0.06)",  }}
            role="img" aria-label="Dashboard Fill & Sell - suivi profits revente Vinted eBay Depop">

            {/* 1 — Header gradient */}
            <div style={{ background:"linear-gradient(135deg,#4ECDC4,#F9A26C)", padding:"0 16px", height:44, display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:28, height:28, background:"rgba(255,255,255,0.9)", borderRadius:8, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                <div style={{ width:14, height:14, background:"linear-gradient(135deg,#4ECDC4,#1D9E75)", borderRadius:3 }} />
              </div>
              <div style={{ flex:1, display:"flex", gap:8, justifyContent:"center" }}>
                {["143,00 €","67,50 €","2 art."].map(v => (
                  <div key={v} style={{ background:"rgba(255,255,255,0.22)", backdropFilter:"blur(4px)", borderRadius:99, padding:"3px 12px", fontSize:11, fontWeight:800, color:"#fff", border:"1px solid rgba(255,255,255,0.3)" }}>{v}</div>
                ))}
              </div>
              <div style={{ background:"#1D9E75", borderRadius:99, padding:"3px 10px", fontSize:10, fontWeight:800, color:"#fff", flexShrink:0 }}>Premium ✨</div>
            </div>

            {/* 2 — KPI grid */}
            <div className="dash-kpi" style={{ padding:"16px 16px 12px", display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
              {[
                { icon:"🟡", label:"Bénéfice ce mois", val:"143,00 €", color:"#1D9E75" },
                { icon:"📊", label:"Marge moyenne",    val:"38,2 %",   color:"#1D9E75" },
                { icon:"💰", label:"Revenu brut",      val:"374,00 €", color:"#1D9E75" },
                { icon:"📦", label:"En stock",         val:"4 art.",   color:"#6B7280" },
              ].map(({ icon, label, val, color }) => (
                <div key={label} style={{ background:"#fff", borderRadius:14, padding:"12px 10px", border:"1px solid rgba(0,0,0,0.06)", boxShadow:"0 1px 4px rgba(0,0,0,0.05)" }}>
                  <div style={{ fontSize:15, marginBottom:6 }}>{icon}</div>
                  <div style={{ fontSize:8, fontWeight:700, color:"#A3A9A6", textTransform:"uppercase", letterSpacing:"0.8px", marginBottom:3, lineHeight:1.3 }}>{label}</div>
                  <div style={{ fontSize:16, fontWeight:900, color, fontFamily:"'Nunito', sans-serif" }}>{val}</div>
                </div>
              ))}
            </div>

            {/* 3 — Graphique barres */}
            <div style={{ padding:"0 16px 12px" }}>
              <div style={{ background:"#fff", borderRadius:14, padding:"12px 14px 8px", border:"1px solid rgba(0,0,0,0.06)", boxShadow:"0 1px 4px rgba(0,0,0,0.05)" }}>
                <div style={{ fontSize:8, fontWeight:700, color:"#A3A9A6", textTransform:"uppercase", letterSpacing:"0.8px", marginBottom:10 }}>Évolution des profits</div>
                <div style={{ height:70, display:"flex", alignItems:"flex-end", gap:6 }}
                  role="img" aria-label="Graphique barres évolution profits Fill & Sell">
                  {[35,52,38,65,44,58,88].map((h,i) => (
                    <div key={i} style={{ flex:1, background:i===6?"#0F6E56":"#1D9E7530", borderRadius:"5px 5px 0 0", height:`${h}%`, transition:"height 0.3s" }} />
                  ))}
                </div>
              </div>
            </div>

            {/* 4 — Mini-liste ventes */}
            <div style={{ padding:"0 16px 16px" }}>
              <div style={{ background:"#fff", borderRadius:14, border:"1px solid rgba(0,0,0,0.06)", boxShadow:"0 1px 4px rgba(0,0,0,0.05)", overflow:"hidden" }}>
                <div style={{ padding:"8px 14px", borderBottom:"1px solid rgba(0,0,0,0.05)" }}>
                  <div style={{ fontSize:8, fontWeight:700, color:"#A3A9A6", textTransform:"uppercase", letterSpacing:"0.8px" }}>Dernières ventes</div>
                </div>
                {[
                  { titre:"Nike Air Max 90", date:"Aujourd'hui", montant:"+47,00 €", pct:"58,8%" },
                  { titre:"Veste Levi's vintage", date:"Hier", montant:"+31,50 €", pct:"42,0%" },
                  { titre:"Jordan 1 Retro High", date:"12 avril", montant:"+64,00 €", pct:"32,0%" },
                ].map(({ titre, date, montant, pct }, i, arr) => (
                  <div key={titre} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", borderBottom: i < arr.length-1 ? "1px solid rgba(0,0,0,0.05)" : "none" }}>
                    <div>
                      <div style={{ fontSize:11, fontWeight:700, color:"#0D0D0D", marginBottom:2 }}>{titre}</div>
                      <div style={{ fontSize:9, color:"#A3A9A6", fontWeight:600 }}>{date}</div>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <div style={{ fontSize:12, fontWeight:900, color:"#1D9E75" }}>{montant}</div>
                      <div style={{ fontSize:9, fontWeight:700, color:"#1D9E7599" }}>{pct}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── PLATFORMS ── */}
      <section id="platforms" style={{ padding:"80px 24px", background:"#fff" }}>
        <div style={{ maxWidth:860, margin:"0 auto", textAlign:"center" }}>
          <h2 style={{ fontSize:32, fontWeight:900, color:C.text, letterSpacing:"-1px", marginBottom:14 }}>
            {l.platformsTitle}
          </h2>
          <p style={{ fontSize:16, color:C.sub, marginBottom:36, lineHeight:1.65, maxWidth:600, margin:"0 auto 36px" }}>
            {l.platformsSub}
          </p>
          <div style={{ display:"flex", flexWrap:"wrap", justifyContent:"center", gap:10 }}>
            {l.platforms.map(platform => (
              <span key={platform} style={{ background:"#E8F5F0", color:"#0F6E56", fontWeight:700, fontSize:14, padding:"8px 18px", borderRadius:99, border:"1px solid #9FE1CB", display:"inline-block" }}>
                {platform}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section style={{ padding:"90px 24px", background:"#F8F7F4" }}>
        <div style={{ maxWidth:860, margin:"0 auto" }}>
          <div style={{ textAlign:"center", marginBottom:56 }}>
            <p style={{ fontSize:12, fontWeight:700, color:C.teal, textTransform:"uppercase", letterSpacing:"2px", marginBottom:14 }}>{l.pricingLabel}</p>
            <h2 style={{ fontSize:38, fontWeight:900, color:C.text, letterSpacing:"-1px", marginBottom:16 }}>{l.pricingTitle}</h2>
          </div>

          <div className="pricing-grid" style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(280px, 1fr))", gap:24, maxWidth:700, margin:"0 auto" }}>
            {/* Gratuit */}
            <div style={{ background:"#fff", borderRadius:20, padding:"32px 28px", border:"1px solid rgba(0,0,0,0.08)", display:"flex", flexDirection:"column" }}>
              <p style={{ fontSize:13, fontWeight:700, color:C.sub, textTransform:"uppercase", letterSpacing:1, marginBottom:12 }}>{l.pricingFreeTitle}</p>
              <div style={{ fontSize:40, fontWeight:900, color:C.text, letterSpacing:"-1.5px", marginBottom:4 }}>{l.pricingFreePrice}</div>
              <p style={{ fontSize:13, color:C.sub, marginBottom:28 }}>{l.pricingFreePeriod}</p>
              <ul style={{ flex:1, display:"flex", flexDirection:"column", gap:14, marginBottom:0, listStyle:"none" }}>
                {l.pricingFreeFeatures.map(feat => (
                  <li key={feat} style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <span style={{ fontSize:16, flexShrink:0, color:C.teal }}>✓</span>
                    <span style={{ fontSize:14, color:C.text }}>{feat}</span>
                  </li>
                ))}
              </ul>
              <button onClick={() => nav("/login")}
                aria-label="Créer un compte gratuit sur Fill & Sell"
                style={{ marginTop:28, width:"100%", padding:"13px", background:"transparent", color:C.teal, border:`1.5px solid ${C.teal}`, borderRadius:12, fontSize:14, fontWeight:700, cursor:"pointer", transition:"all 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.background=C.teal; e.currentTarget.style.color="#fff"; }}
                onMouseLeave={e => { e.currentTarget.style.background="transparent"; e.currentTarget.style.color=C.teal; }}>
                {l.pricingFreeCta}
              </button>
            </div>

            {/* Premium */}
            <div style={{ background:"linear-gradient(135deg,#3EACA0,#E8956D)", borderRadius:20, padding:"32px 28px", position:"relative", overflow:"hidden", boxShadow:"0 20px 60px rgba(62,172,160,0.3)", display:"flex", flexDirection:"column" }}>
              <div style={{ position:"absolute", top:-30, right:-30, width:120, height:120, background:"rgba(255,255,255,0.08)", borderRadius:"50%" }} />
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
                <p style={{ fontSize:13, fontWeight:700, color:"rgba(255,255,255,0.8)", textTransform:"uppercase", letterSpacing:1 }}>{l.pricingProTitle}</p>
                <span style={{ background:"rgba(255,255,255,0.25)", color:"#fff", fontSize:11, fontWeight:800, borderRadius:99, padding:"3px 10px", border:"1px solid rgba(255,255,255,0.4)" }}>⭐ {l.pricingProBadge}</span>
              </div>
              <div style={{ fontSize:40, fontWeight:900, color:"#fff", letterSpacing:"-1.5px", marginBottom:4 }}>{l.pricingProPrice}</div>
              <p style={{ fontSize:13, color:"rgba(255,255,255,0.75)", marginBottom:20 }}>{l.pricingProPeriod}</p>
              <ul style={{ flex:1, display:"flex", flexDirection:"column", gap:14, marginBottom:0, listStyle:"none" }}>
                {l.pricingProFeatures.map(feat => (
                  <li key={feat} style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <span style={{ fontSize:16, flexShrink:0, color:"#fff" }}>✓</span>
                    <span style={{ fontSize:14, color:"#fff", fontWeight:500 }}>{feat}</span>
                  </li>
                ))}
              </ul>
              <button onClick={() => nav("/login")}
                aria-label="Passer au plan Premium Fill & Sell"
                style={{ marginTop:28, width:"100%", padding:"13px", background:"#fff", color:C.teal, border:"none", borderRadius:12, fontSize:14, fontWeight:800, cursor:"pointer", boxShadow:"0 8px 24px rgba(0,0,0,0.15)", transition:"all 0.2s" }}
                onMouseEnter={e => { e.currentTarget.style.transform="translateY(-2px)"; e.currentTarget.style.boxShadow="0 12px 32px rgba(0,0,0,0.2)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform="translateY(0)"; e.currentTarget.style.boxShadow="0 8px 24px rgba(0,0,0,0.15)"; }}>
                {l.pricingProCta}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section style={{ padding:"96px 24px", textAlign:"center", background:"linear-gradient(135deg,#3EACA0,#E8956D)" }}>
        <div style={{ maxWidth:620, margin:"0 auto" }}>
          <h2 style={{ fontSize:42, fontWeight:900, color:"#fff", letterSpacing:"-1.5px", marginBottom:18, lineHeight:1.1 }}>
            {l.ctaTitle}
          </h2>
          <p style={{ fontSize:18, color:"rgba(255,255,255,0.82)", marginBottom:44, lineHeight:1.65 }}>
            {l.ctaSub}
          </p>
          <button className="lp-btn-main"
            aria-label="Créer un compte gratuit sur Fill & Sell"
            style={{ fontSize:18, padding:"18px 48px", background:"#fff", color:C.teal, boxShadow:"0 12px 40px rgba(0,0,0,0.15)" }}
            onClick={() => nav("/login")}>
            {l.ctaBtn}
          </button>
          <p style={{ marginTop:20, fontSize:13, color:"rgba(255,255,255,0.55)" }}>{l.ctaNote}</p>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" style={{ padding:"80px 24px", background:"#fff" }}>
        <div style={{ maxWidth:720, margin:"0 auto" }}>
          <h2 style={{ fontSize:32, fontWeight:900, color:C.text, letterSpacing:"-1px", marginBottom:40, textAlign:"center" }}>
            {l.faqTitle}
          </h2>
          {l.faqItems.map((item, i) => (
            <details key={i} className="faq-details">
              <summary>
                <span style={{ fontSize:15, fontWeight:800, color:C.text, paddingRight:16 }}>{item.q}</span>
                <span className="faq-plus" aria-hidden="true">+</span>
              </summary>
              <p style={{ fontSize:14, color:C.sub, paddingBottom:18, lineHeight:1.7 }}>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ── COMPAT BANDEAU ── */}
      <div style={{ background:"#F8F7F4", borderTop:"1px solid rgba(0,0,0,0.07)", padding:"16px 24px", textAlign:"center" }}>
        <p style={{ fontSize:13, color:C.sub, fontWeight:500 }}>
          {lang === 'fr' ? 'Fonctionne avec toutes tes ventes, peu importe la plateforme.' : 'Works with all your sales, whatever the platform.'}
        </p>
      </div>

      {/* ── FOOTER ── */}
      <footer style={{ background:"#0F172A", padding:"36px 24px", textAlign:"center" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:10, marginBottom:8 }}>
          <img src="/logo.png" height={26} style={{ filter:"brightness(0) invert(1) opacity(0.5)" }}
            alt="Fill & Sell - tracker profits revente" />
          <span style={{ fontSize:15, fontWeight:700, color:"rgba(255,255,255,0.5)", letterSpacing:"-0.3px" }}>Fill & Sell</span>
        </div>
        <p style={{ fontSize:13, color:"rgba(255,255,255,0.35)", marginBottom:6 }}>{l.footerTagline}</p>
        <p style={{ fontSize:13, color:"rgba(255,255,255,0.25)" }}>{l.footerRights}</p>
      </footer>
    </div>
  );
}
