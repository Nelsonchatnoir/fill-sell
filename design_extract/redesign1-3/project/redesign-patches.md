# Redesign Fill & Sell — JSX patches

> Tu utilises `src/App.redesign.css` en tant qu'**overlay non-destructif**.
> Les surcharges marquées `!important` ciblent uniquement les classes existantes.

## 0. Brancher l'overlay CSS

Dans `src/main.jsx` (ou `src/App.jsx`), ajoute l'import **après** `App.css` :

```jsx
import './App.css';
import './App.redesign.css';   // ← NOUVEAU
```

C'est tout pour les 3 changements purement visuels :
- ✅ **Background** (`#FAFBFB` blanc cassé teal-tinted) — automatique via `:root`
- ✅ **KPI Hero (Profit Net)** — surcharge `.profit-hero` (gradient émeraude + breathing + shimmer)
- ✅ **KPI secondaires + spark cards** — surcharge `.kpi-hero`, `.spark-card`
- ✅ **FAB micro** — surcharge `.fab-vocal` (gradient + 3 halos + taille 64px)

Les 4 changements suivants nécessitent **des mini-patches JSX**.

---

## 1. DonutChart — segments arrondis + centre + animation

**Fichier :** `src/App.jsx` ligne ~613

**Remplace** la fonction `DonutChart` par :

```jsx
function DonutChart({segments, totalLabel, totalValue}){
  const r = 56, cx = 70, cy = 70, circ = 2 * Math.PI * r;
  const GAP = 2; // gap visuel entre segments (en degrés convertis)
  let offset = 0;
  return (
    <div className="donut-svg">
      <svg width={140} height={140} viewBox="0 0 140 140">
        <g transform="rotate(-90 70 70)">
          <circle className="track" cx={cx} cy={cy} r={r} />
          {segments.map((s, i) => {
            const dash = Math.max(0, (s.pct / 100) * circ - GAP);
            const gap = circ - dash;
            const el = (
              <circle
                key={i}
                className="seg"
                cx={cx}
                cy={cy}
                r={r}
                stroke={s.color}
                strokeDasharray={`${dash} ${gap}`}
                strokeDashoffset={-offset}
                style={{ animation: `legendGrow 0.9s cubic-bezier(0.65,0,0.35,1) ${0.1 + i * 0.08}s both` }}
              />
            );
            offset += dash + GAP;
            return el;
          })}
        </g>
      </svg>
      {totalValue !== undefined && (
        <div className="center-stack">
          <div className="lbl">{totalLabel || 'Total'}</div>
          <div className="v">{totalValue}</div>
        </div>
      )}
    </div>
  );
}
```

**Et remplace** le bloc « Donut by category » (ligne ~817) par :

```jsx
{donutSegs.length > 0 && (
  <div className="donut-card">
    <div className="head">{lang==='en'?'Profit by category':'Profit par catégorie'}</div>
    <div className="donut-row">
      <DonutChart
        segments={donutSegs}
        totalLabel={lang==='en'?'Total':'Total'}
        totalValue={fmt2(totalProfit)}
      />
      <div className="donut-legend">
        {donutSegs.map((s, i) => {
          const emoji = {
            'Mode':'👗','Luxe':'💎','High-Tech':'📱','Maison':'🏠',
            'Sport':'⚽','Musique':'🎵','Beauté':'💄','Collection':'🏆',
            'Livres':'📚','Auto-Moto':'🚗','Électroménager':'⚡','Jouets':'🧸',
            'Autre':'📦'
          }[s.label] || '📦';
          return (
            <div key={i} className="donut-legend-row">
              <div className="top">
                <span className="name"><span className="emo">{emoji}</span>{s.label}</span>
                <span className="pct">{Math.round(s.pct)}%</span>
              </div>
              <div className="donut-legend-bar">
                <span style={{ width: `${s.pct}%`, background: s.color }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  </div>
)}
```

---

## 2. Activité 84 jours → courbe sparkline

**Fichier :** `src/App.jsx` lignes 855-861

**Remplace** :

```jsx
{/* Heatmap */}
<div style={{background:'#fff',borderRadius:14,padding:'16px',...}}>
  <div style={{...}}>{lang==='en'?'Activity (84 days)':'Activité (84 jours)'}</div>
  <div className="heatmap-grid">
    {cells.map((lvl,i)=><div key={i} className={`heatmap-cell${lvl?' '+lvl:''}`}/>)}
  </div>
</div>
```

**Par** :

```jsx
{/* Activity curve (84 days) */}
<ActivityCurve sales={sales} lang={lang} />
```

**Et ajoute** ce composant à côté de `DonutChart` (avant `StatsTab`) :

```jsx
function ActivityCurve({sales, lang}){
  const [hover, setHover] = useState(null);
  const W = 320, H = 130, P = 8;

  // Bucket by day, last 84 days
  const days = useMemo(() => {
    const now = new Date();
    return Array.from({length: 84}, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (83 - i));
      const key = d.toISOString().slice(0, 10);
      const dayProfit = sales
        .filter(s => (s.created_at || s.date || '').slice(0,10) === key)
        .reduce((a, s) => a + (s.margin || 0), 0);
      return { date: d, key, profit: dayProfit };
    });
  }, [sales]);

  const max = Math.max(1, ...days.map(d => d.profit));
  const min = Math.min(0, ...days.map(d => d.profit));
  const total = days.reduce((a, d) => a + d.profit, 0);

  // Smooth Catmull-Rom-ish path
  const pts = days.map((d, i) => [
    P + (i / (days.length - 1)) * (W - 2*P),
    H - P - ((d.profit - min) / (max - min || 1)) * (H - 2*P)
  ]);
  const path = pts.reduce((acc, [x,y], i) => {
    if (i === 0) return `M${x},${y}`;
    const [px, py] = pts[i-1];
    const cx = (px + x) / 2;
    return `${acc} Q${px},${py} ${cx},${(py+y)/2} T${x},${y}`;
  }, '');
  const area = `${path} L${pts[pts.length-1][0]},${H-P} L${pts[0][0]},${H-P} Z`;

  const fmtDate = d => d.toLocaleDateString(lang==='en'?'en-US':'fr-FR', {day:'numeric',month:'short'});
  const fmtMoney = n => (Math.round(n*100)/100).toFixed(2).replace('.',',') + ' €';

  const handleMove = e => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const idx = Math.max(0, Math.min(days.length-1,
      Math.round(((x - P) / (W - 2*P)) * (days.length - 1))));
    setHover({idx, ...days[idx], px: pts[idx][0], py: pts[idx][1]});
  };

  return (
    <div className="activity-curve-card">
      <div className="activity-curve-head">
        <div>
          <div className="t">{lang==='en'?'Activity':'Activité'}</div>
          <div className="sub">{lang==='en'?'Last 84 days':'84 derniers jours'}</div>
        </div>
        <div className="total">{fmtMoney(total)}</div>
      </div>
      <div style={{position:'relative'}}>
        <svg
          className="activity-curve-svg"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          onMouseMove={handleMove}
          onMouseLeave={()=>setHover(null)}
        >
          <defs>
            <linearGradient id="acGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1D9E75" stopOpacity="0.30"/>
              <stop offset="100%" stopColor="#1D9E75" stopOpacity="0"/>
            </linearGradient>
          </defs>
          <path className="ac-area" d={area}/>
          <path className="ac-line" d={path}/>
          {hover && (
            <>
              <line className="ac-crosshair" x1={hover.px} y1={P} x2={hover.px} y2={H-P}/>
              <circle className="ac-dot" cx={hover.px} cy={hover.py} r={5}/>
            </>
          )}
        </svg>
        {hover && (
          <div className="ac-tooltip" style={{left: `${(hover.px/W)*100}%`, top: `${(hover.py/H)*100}%`}}>
            <div className="v">{fmtMoney(hover.profit)}</div>
            <div className="d">{fmtDate(hover.date)}</div>
          </div>
        )}
      </div>
    </div>
  );
}
```

**Note :** tu peux supprimer la génération de `cells` (lignes ~849-855) si tu ne l'utilises plus ailleurs.

---

## 3. CTA Premium — gradient animé

Remplace les boutons « Débloquer / Passer Premium » par :

```jsx
<button className="cta-premium" onClick={triggerCheckout}>
  ✨ {lang==='en' ? 'Unlock Premium' : 'Passer Premium'}
</button>
```

Pour les boutons primaires existants qui doivent garder leur style (sauf le CTA Premium), aucun changement.

Si tu veux qu'un `.btn-pill-primary` devienne CTA Premium, ajoute la classe `is-premium` :

```jsx
<button className="btn-pill-primary is-premium" onClick={...}>
  ✨ Passer Premium
</button>
```

---

## 4. Dashboard new user — empty state

**Fichier :** `src/App.jsx` lignes 3047-3080 (la card de bienvenue avec l'emoji 👋)

**Remplace** par :

```jsx
<div className="empty-hero card-enter">
  <div className="empty-hero-art">
    <span className="glyph">📈</span>
  </div>
  <h1>{lang==='en' ? 'Track every euro of profit.' : 'Suis chaque euro de profit.'}</h1>
  <p>
    {lang==='en'
      ? 'Add an item, set your buy & sell price — see your real margin in seconds.'
      : 'Ajoute un article, renseigne achat & vente — vois ta vraie marge en quelques secondes.'}
  </p>

  <div className="empty-hero-stats">
    <span className="empty-hero-stat"><span className="dot"></span>{lang==='en'?'Auto-categorized':'Catégories auto'}</span>
    <span className="empty-hero-stat"><span className="dot"></span>{lang==='en'?'Real-time stats':'Stats temps réel'}</span>
    <span className="empty-hero-stat"><span className="dot"></span>{lang==='en'?'Free up to 20':'Gratuit jusqu\'à 20'}</span>
  </div>

  <div className="empty-hero-cta-stack">
    <button className="cta-premium" onClick={()=>{setTab(1); localStorage.setItem('tab',1);}}>
      ➕ {lang==='en' ? 'Add my first item' : 'Ajouter mon premier article'}
    </button>
    <button className="empty-hero-secondary" onClick={()=>{setTab(2); localStorage.setItem('tab',2);}}>
      🧮 {lang==='en' ? 'Try the calculator' : 'Tester le calculateur'}
    </button>
  </div>
</div>
```

---

## 5. (Optionnel) Count-up sur les KPIs

Crée un mini hook (à côté de tes utils) :

```jsx
function useCountUp(target, duration = 900) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf, start;
    const step = t => {
      if (!start) start = t;
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setV(target * eased);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return v;
}
```

Et dans Dashboard / StatsTab, **enrobe** chaque chiffre KPI :

```jsx
const animatedProfit = useCountUp(totalProfit);
// ...
<div className="amt">{fmt2(animatedProfit)}</div>
```

À mettre **uniquement** sur les valeurs principales (Profit net, Revenue, Avg margin) — pas sur les compteurs (« Sales: 4 »).

---

## 6. (Optionnel) Variantes background

Ajoute une classe sur `<body>` selon la préférence utilisateur :

```jsx
useEffect(() => {
  document.body.classList.toggle('bg-grain', userPref === 'grain');
  document.body.classList.toggle('bg-dots',  userPref === 'dots');
}, [userPref]);
```

- *(rien)* → blanc cassé teal-tinted `#FAFBFB` (par défaut)
- `bg-grain` → blanc + grain SVG très subtil
- `bg-dots` → blanc + micro-pattern de points teal

---

## Récap

| # | Composant | CSS auto | JSX patch |
|---|-----------|----------|-----------|
| 1 | KPI Hero (Profit Net) | ✅ | — |
| 2 | KPIs secondaires | ✅ | — |
| 3 | Background global | ✅ | — |
| 4 | FAB micro | ✅ | — |
| 5 | DonutChart | partiel | §1 |
| 6 | Courbe activité | nouveau | §2 |
| 7 | CTA Premium | nouveau | §3 |
| 8 | Empty state | nouveau | §4 |
| — | Count-up KPI | — | §5 (optionnel) |

Aucun changement sur la logique Supabase / Stripe / IAP / Edge Functions.
