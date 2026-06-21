// Fill & Sell — Redesigned components

const { useState, useEffect, useRef, useMemo } = React;

/* ─────────────────────────────────────────
   useCountUp — animate a number on mount
   ───────────────────────────────────────── */
function useCountUp(target, duration = 900, decimals = 0) {
  const [val, setVal] = useState(0);
  const startedAt = useRef(null);
  const raf = useRef(null);
  useEffect(() => {
    startedAt.current = null;
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const tick = (ts) => {
      if (startedAt.current == null) startedAt.current = ts;
      const t = Math.min(1, (ts - startedAt.current) / duration);
      setVal(target * ease(t));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);
  return Number(val.toFixed(decimals));
}

function fmtEuro(n, decimals = 2) {
  const fixed = Math.abs(n).toFixed(decimals);
  return fixed.replace('.', ',') + ' €';
}

/* ─────────────────────────────────────────
   Trend pill
   ───────────────────────────────────────── */
function TrendPill({ value, suffix = '%' }) {
  const up = value >= 0;
  return (
    <span className={"kpi-trend" + (up ? '' : ' down')}>
      <svg viewBox="0 0 10 10" fill="none">
        {up ? (
          <path d="M2 7 L5 3 L8 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        ) : (
          <path d="M2 3 L5 7 L8 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        )}
      </svg>
      {up ? '+' : ''}{value.toFixed(1)}{suffix}
    </span>
  );
}

/* ─────────────────────────────────────────
   1) KPI Cards
   ───────────────────────────────────────── */
function KpiHero({ profit, trend }) {
  const animated = useCountUp(profit, 1100, 0);
  return (
    <div className="kpi hero">
      <div className="kpi-top">
        <div className="kpi-icon">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M3 17 L9 11 L13 15 L21 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M15 7 H21 V13" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <TrendPill value={trend} />
      </div>
      <div className="kpi-label">Profit net · ce mois</div>
      <div className="kpi-value">+{animated.toLocaleString('fr-FR')} <span style={{fontWeight:800,fontSize:24,opacity:0.8}}>€</span></div>
      <div className="kpi-sub">Tu es en avance sur le mois dernier 🚀</div>
      <svg className="kpi-spark" viewBox="0 0 80 28" preserveAspectRatio="none">
        <defs>
          <linearGradient id="heroSpark" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.6"/>
            <stop offset="1" stopColor="#fff" stopOpacity="0"/>
          </linearGradient>
        </defs>
        <path d="M0 22 C 8 18, 14 24, 22 16 S 38 8, 46 12 S 62 4, 80 6"
              fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" opacity="0.9"/>
        <path d="M0 22 C 8 18, 14 24, 22 16 S 38 8, 46 12 S 62 4, 80 6 L 80 28 L 0 28 Z"
              fill="url(#heroSpark)"/>
      </svg>
    </div>
  );
}

function KpiSmall({ icon, label, value, decimals = 0, suffix = '', trend, sub }) {
  const animated = useCountUp(value, 900, decimals);
  return (
    <div className="kpi">
      <div className="kpi-top">
        <div className="kpi-icon">{icon}</div>
        {trend != null && <TrendPill value={trend} />}
      </div>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">
        {decimals > 0 ? animated.toLocaleString('fr-FR', {minimumFractionDigits: decimals, maximumFractionDigits: decimals}) : animated.toLocaleString('fr-FR')}
        {suffix && <span style={{fontWeight:800,fontSize:16,opacity:0.7,marginLeft:2}}>{suffix}</span>}
      </div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

function KpiGrid() {
  return (
    <div className="kpi-grid">
      <KpiHero profit={1247} trend={18.4} />
      <KpiSmall
        icon={<span>📊</span>}
        label="Ventes"
        value={42}
        trend={12.5}
        sub="ce mois"
      />
      <KpiSmall
        icon={<span>📈</span>}
        label="Marge moy."
        value={31.2}
        decimals={1}
        suffix="%"
        trend={3.1}
      />
    </div>
  );
}

window.KpiGrid = KpiGrid;
window.useCountUp = useCountUp;
window.TrendPill = TrendPill;
window.fmtEuro = fmtEuro;
