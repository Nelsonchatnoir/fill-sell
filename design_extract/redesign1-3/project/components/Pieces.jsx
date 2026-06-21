// Fill & Sell — FAB mic with concentric halos + welcome empty state + sales

const { useState: useStateFab } = React;

function FabMic({ onClick }) {
  const [pressed, setPressed] = useStateFab(false);
  return (
    <div className="fab-wrap">
      <div className="fab-halo h1"></div>
      <div className="fab-halo h2"></div>
      <div className="fab-halo h3"></div>
      <button
        className="fab"
        onMouseDown={() => setPressed(true)}
        onMouseUp={() => setPressed(false)}
        onMouseLeave={() => setPressed(false)}
        onClick={onClick}
        aria-label="Saisie vocale"
      >
        <svg viewBox="0 0 24 24" fill="none">
          <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/>
          <path d="M5 11 V12 a7 7 0 0 0 14 0 V11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"/>
          <path d="M12 19 V22 M9 22 H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </button>
    </div>
  );
}

/* ─────────────────────────────────────── */
/* Premium CTA                              */
/* ─────────────────────────────────────── */
function PremiumCTA({ label = 'Débloquer Premium', price = '4,99€/mois', onClick }) {
  return (
    <button className="cta-premium" onClick={onClick}>
      <span className="cta-premium-inner">
        <span style={{fontSize:16}}>✨</span>
        <span>{label}</span>
        <span className="price">{price}</span>
      </span>
    </button>
  );
}

/* ─────────────────────────────────────── */
/* Welcome empty state — abstract gradient */
/* ─────────────────────────────────────── */
function WelcomeCard({ onStart, onPremium }) {
  return (
    <div className="welcome">
      <div className="welcome-art">
        <div className="blob b1"></div>
        <div className="blob b2"></div>
        <div className="blob b3"></div>

        <div className="stat-pill p2"><span className="dot"></span>+247 €</div>
        <div className="stat-pill p1">📦 12 articles</div>

        <div className="icon-stack">
          <div className="icon-card">
            <svg viewBox="0 0 32 32" fill="none">
              <defs>
                <linearGradient id="bagGrad" x1="0" x2="1" y1="0" y2="1">
                  <stop offset="0" stopColor="#1D9E75"/>
                  <stop offset="1" stopColor="#E8956D"/>
                </linearGradient>
              </defs>
              <path d="M7 11 H25 L23.5 26 a2 2 0 0 1 -2 1.8 H10.5 a2 2 0 0 1 -2 -1.8 Z"
                    fill="url(#bagGrad)"/>
              <path d="M11 11 V8 a5 5 0 0 1 10 0 V11"
                    stroke="url(#bagGrad)" strokeWidth="2" strokeLinecap="round" fill="none"/>
              <path d="M12 18 L15 21 L21 14"
                    stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
          </div>
        </div>
      </div>

      <h2>Suis tes profits, sans prise de tête</h2>
      <p>Calcule tes marges, gère ton stock et regarde tes ventes Vinted, Leboncoin & eBay grimper en temps réel.</p>

      <div className="checks">
        <div className="check"><span className="ok">✓</span> Calcul de marge instantané</div>
        <div className="check"><span className="ok">✓</span> Stock + catégories auto</div>
        <div className="check"><span className="ok">✓</span> Stats avancées · gratuit jusqu'à 20 articles</div>
      </div>

      <PremiumCTA label="Ajoute ton premier article" price="Gratuit" onClick={onStart}/>
      <button className="btn-secondary" onClick={onPremium}>Voir l'offre Premium ✨</button>
    </div>
  );
}

/* ─────────────────────────────────────── */
/* Sales list                               */
/* ─────────────────────────────────────── */
const SAMPLE_SALES = [
  { name: 'Nike Air Max 90', date: "Aujourd'hui", margin: 30, pct: 40, icon: '👟' },
  { name: "Veste Levi's vintage", date: 'Hier', margin: 24, pct: 57.1, icon: '🧥' },
  { name: 'Jordan 1 Retro High', date: '12 avr.', margin: 64, pct: 34.8, icon: '👟' },
  { name: 'iPhone 13 Pro', date: '8 avr.', margin: 130, pct: 27.1, icon: '📱' },
];
function SalesList() {
  return (
    <div className="sales-card">
      {SAMPLE_SALES.map((s, i) => (
        <div className="sale-row" key={i}>
          <div className="lhs">
            <div className="ico">{s.icon}</div>
            <div>
              <div className="t">{s.name}</div>
              <div className="d">{s.date}</div>
            </div>
          </div>
          <div>
            <div className="amt">+{s.margin.toFixed(2)} €</div>
            <div className="pct">+{s.pct.toFixed(1)}%</div>
          </div>
        </div>
      ))}
    </div>
  );
}

window.FabMic = FabMic;
window.PremiumCTA = PremiumCTA;
window.WelcomeCard = WelcomeCard;
window.SalesList = SalesList;
