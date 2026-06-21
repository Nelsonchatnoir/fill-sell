// Fill & Sell — Curve chart (sparkline-style with gradient fill + tooltip)

const { useState: useStateCurve, useRef: useRefCurve, useMemo: useMemoCurve } = React;

function buildSmoothPath(points) {
  if (points.length < 2) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

const RANGES = {
  '7j': [12, 18, 14, 22, 19, 28, 24],
  '1M': [22, 18, 35, 28, 32, 26, 38, 30, 34, 42, 38, 44, 40, 48],
  '6M': [120, 145, 132, 178, 210, 247],
  '1A': [80, 92, 110, 134, 142, 168, 180, 175, 198, 215, 232, 247],
  'YTD': [120, 138, 165, 182, 210, 247],
};
const RANGE_LABELS = {
  '7j': ['L', 'M', 'M', 'J', 'V', 'S', 'D'],
  '1M': ['1', '', '', '', '', '', '', '15', '', '', '', '', '', '30'],
  '6M': ['Déc', 'Jan', 'Fév', 'Mar', 'Avr', 'Mai'],
  '1A': ['Jun','','Aou','','Oct','','Déc','','Fév','','Avr',''],
  'YTD': ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun'],
};

function ProfitCurve() {
  const [range, setRange] = useStateCurve('6M');
  const [hover, setHover] = useStateCurve(null);
  const wrapRef = useRefCurve(null);

  const data = RANGES[range];
  const labels = RANGE_LABELS[range];

  const W = 320, H = 150, PAD_X = 8, PAD_TOP = 14, PAD_BOT = 6;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range_y = max - min || 1;

  const points = data.map((v, i) => ({
    x: PAD_X + (i * (W - PAD_X * 2)) / (data.length - 1),
    y: PAD_TOP + (1 - (v - min) / range_y) * (H - PAD_TOP - PAD_BOT),
    v, i,
  }));
  const path = buildSmoothPath(points);
  const area = path + ` L ${points[points.length-1].x} ${H} L ${points[0].x} ${H} Z`;

  const total = data[data.length - 1];
  const delta = total - data[0];
  const deltaPct = ((delta / data[0]) * 100).toFixed(1);

  function onMove(e) {
    if (!wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    const x = ((e.clientX || (e.touches && e.touches[0].clientX) || 0) - r.left) / r.width * W;
    let nearest = 0, dist = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(p.x - x);
      if (d < dist) { dist = d; nearest = i; }
    });
    setHover(nearest);
  }

  const hoverPt = hover != null ? points[hover] : null;
  const hoverDate = hover != null ? labels[hover] : '';

  return (
    <div className="curve-card">
      <div className="curve-head">
        <div className="lhs">
          <div className="label">Profit · {range}</div>
          <div className="total">+{total.toLocaleString('fr-FR')} €</div>
          <div className="delta">
            <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
              <path d="M2 7 L5 3 L8 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            +{deltaPct}% vs début
          </div>
        </div>
        <div className="range-pills">
          {Object.keys(RANGES).map(r => (
            <button key={r} className={range === r ? 'on' : ''} onClick={() => { setRange(r); setHover(null); }}>{r}</button>
          ))}
        </div>
      </div>

      <div className="curve-svg-wrap" ref={wrapRef}
           onMouseMove={onMove} onMouseLeave={() => setHover(null)}
           onTouchMove={onMove} onTouchEnd={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          <defs>
            <linearGradient id="curveFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%"  stopColor="#1D9E75" stopOpacity="0.32"/>
              <stop offset="60%" stopColor="#4ECDC4" stopOpacity="0.10"/>
              <stop offset="100%" stopColor="#4ECDC4" stopOpacity="0"/>
            </linearGradient>
            <linearGradient id="curveStroke" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%"  stopColor="#0F8B6A"/>
              <stop offset="100%" stopColor="#10B981"/>
            </linearGradient>
          </defs>
          <path d={area} fill="url(#curveFill)"/>
          <path d={path} fill="none" stroke="url(#curveStroke)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>

          {hoverPt && (
            <g>
              <line x1={hoverPt.x} x2={hoverPt.x} y1={PAD_TOP} y2={H - PAD_BOT}
                    stroke="rgba(15,23,42,0.18)" strokeWidth="1" strokeDasharray="3 3"/>
              <circle cx={hoverPt.x} cy={hoverPt.y} r="6" fill="#fff"/>
              <circle cx={hoverPt.x} cy={hoverPt.y} r="4" fill="#10B981"/>
            </g>
          )}
        </svg>

        {hoverPt && (
          <div className="curve-tooltip on" style={{ left: `${(hoverPt.x / W) * 100}%`, top: `${(hoverPt.y / H) * 100}%` }}>
            <span className="v">+{hoverPt.v.toLocaleString('fr-FR')} €</span>
            <span style={{opacity:0.7}}>{hoverDate || `${range} · ${hoverPt.i + 1}`}</span>
          </div>
        )}
      </div>

      <div className="curve-x">
        {labels.map((l, i) => <span key={i}>{l}</span>)}
      </div>
    </div>
  );
}

window.ProfitCurve = ProfitCurve;
