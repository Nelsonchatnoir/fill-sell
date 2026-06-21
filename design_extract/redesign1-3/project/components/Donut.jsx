// Fill & Sell — Donut: profit by category with rounded segments + animated entry

const { useEffect: useEffectDonut, useState: useStateDonut, useRef: useRefDonut } = React;

const CATEGORIES = [
  { key: 'mode',    emoji: '👗', name: 'Mode',       value: 482, color: '#EC4899' },
  { key: 'tech',    emoji: '📱', name: 'High-Tech',  value: 318, color: '#3B82F6' },
  { key: 'luxe',    emoji: '💎', name: 'Luxe',       value: 247, color: '#F59E0B' },
  { key: 'maison',  emoji: '🏠', name: 'Maison',     value: 124, color: '#10B981' },
  { key: 'autres',  emoji: '📦', name: 'Autres',     value: 76,  color: '#94A3B8' },
];

function CategoryDonut() {
  const total = CATEGORIES.reduce((a, c) => a + c.value, 0);
  const animatedTotal = useCountUp(total, 1100, 0);

  const R = 56;     // donut radius
  const SW = 18;    // stroke (thick)
  const C = 2 * Math.PI * R;
  const CX = 70, CY = 70;

  // Animate dasharray on mount: each segment grows from 0 to its share
  const [progress, setProgress] = useStateDonut(0);
  const rafRef = useRefDonut();
  useEffectDonut(() => {
    let start = null;
    const dur = 1300;
    const ease = t => 1 - Math.pow(1 - t, 4);
    const tick = (ts) => {
      if (start == null) start = ts;
      const t = Math.min(1, (ts - start) / dur);
      setProgress(ease(t));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // Build segments — each rendered as its own circle, rotated, with rounded caps
  let cumulative = 0;
  const segments = CATEGORIES.map((cat, i) => {
    const pct = cat.value / total;
    const dash = pct * C * progress;
    const offset = -cumulative * C - 0.6; // tiny gap effect via butt-rounded
    cumulative += pct;
    return { ...cat, dash, offset, pct };
  });

  return (
    <div className="donut-card">
      <div className="donut-row">
        <div className="donut-svg">
          <svg viewBox="0 0 140 140">
            <circle cx={CX} cy={CY} r={R} fill="none" stroke="rgba(15,23,42,0.05)" strokeWidth={SW}/>
            {segments.map((s, i) => (
              <circle
                key={s.key}
                cx={CX} cy={CY} r={R}
                fill="none"
                stroke={s.color}
                strokeWidth={SW}
                strokeLinecap="round"
                strokeDasharray={`${s.dash} ${C}`}
                strokeDashoffset={s.offset * C}
                style={{ transition: 'stroke 0.2s' }}
              />
            ))}
          </svg>
          <div className="donut-center">
            <div className="l">Total</div>
            <div className="v">{animatedTotal.toLocaleString('fr-FR')} €</div>
            <div className="s">5 catégories</div>
          </div>
        </div>

        <div className="donut-legend">
          {CATEGORIES.map((c, i) => {
            const pct = (c.value / total) * 100;
            return (
              <div className="legend-item" key={c.key}>
                <div className="top">
                  <span className="name">
                    <span className="emoji">{c.emoji}</span>
                    {c.name}
                  </span>
                  <span className="pct">{Math.round(pct)}%</span>
                </div>
                <div className="legend-bar">
                  <div className="legend-bar-fill"
                       style={{
                         width: `${pct * progress}%`,
                         background: c.color,
                         transitionDelay: `${i * 0.05}s`,
                       }}/>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

window.CategoryDonut = CategoryDonut;
