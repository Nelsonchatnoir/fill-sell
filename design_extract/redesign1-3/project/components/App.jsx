// Fill & Sell — App shell

const { useState: useStateApp, useEffect: useEffectApp } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "background": "tinted",
  "screen": "dashboard",
  "haloPulse": true,
  "shimmerOn": true
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [tab, setTab] = useStateApp(t.screen || 'dashboard');
  const [toast, setToast] = useStateApp(null);

  // Sync screen tweak with internal tab state
  useEffectApp(() => { if (t.screen && t.screen !== tab) setTab(t.screen); }, [t.screen]);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  }

  // Halo pulse on/off
  useEffectApp(() => {
    document.querySelectorAll('.fab-halo').forEach(w => {
      w.style.animationPlayState = t.haloPulse ? 'running' : 'paused';
    });
  }, [t.haloPulse, tab]);

  // CTA shimmer + hero shimmer toggle
  useEffectApp(() => {
    const state = t.shimmerOn ? 'running' : 'paused';
    document.querySelectorAll('.cta-premium, .kpi.hero').forEach(el => {
      el.style.animationPlayState = state;
    });
  }, [t.shimmerOn, tab]);

  function pickTab(k) { setTab(k); setTweak('screen', k); }

  return (
    <>
      <div className="app-canvas" data-bg={t.background}>
        <div className="topbar">
          <div className="tb-brand">
            <img src="assets/logo.png" alt=""/>
            <span className="tb-name">Fill &amp; Sell</span>
          </div>
          <div className="tb-pill">⭐ Premium</div>
        </div>

        <div className="tab-seg">
          <button className={tab === 'dashboard' ? 'on' : ''} onClick={() => pickTab('dashboard')}>📊 Dashboard</button>
          <button className={tab === 'stats' ? 'on' : ''} onClick={() => pickTab('stats')}>📈 Stats</button>
          <button className={tab === 'empty' ? 'on' : ''} onClick={() => pickTab('empty')}>👋 Welcome</button>
        </div>

        <div className="page">
          {tab === 'dashboard' && <DashboardScreen onPremium={() => showToast('Premium activé ✨')}/>}
          {tab === 'stats'     && <StatsScreen     onPremium={() => showToast('Premium activé ✨')}/>}
          {tab === 'empty'     && <EmptyScreen     onPremium={() => showToast('Voir le Premium ✨')} onStart={() => showToast('On commence !')}/>}
        </div>

        <FabMic onClick={() => showToast('🎙️  En écoute…')}/>

        <div className="bottom-nav">
          <button className="on"><span className="icon">📊</span><span className="lbl">Dashboard</span></button>
          <button><span className="icon">📦</span><span className="lbl">Stock</span></button>
          <button><span className="icon">🧮</span><span className="lbl">Calculer</span></button>
          <button><span className="icon">📋</span><span className="lbl">Historique</span></button>
        </div>

        {toast && (
          <div style={{
            position: 'absolute', bottom: 100, left: '50%', transform: 'translateX(-50%)',
            background: '#0F6E56', color: '#fff', padding: '10px 16px', borderRadius: 12,
            fontSize: 13, fontWeight: 800, boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
            zIndex: 60, whiteSpace: 'nowrap'
          }}>{toast}</div>
        )}
      </div>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Écran" />
        <TweakRadio
          label="Aperçu"
          value={t.screen}
          options={[
            { value: 'dashboard', label: 'Dashboard' },
            { value: 'stats',     label: 'Stats' },
            { value: 'empty',     label: 'Welcome' },
          ]}
          onChange={(v) => { setTweak('screen', v); setTab(v); }}
        />
        <TweakSection label="Fond" />
        <TweakRadio
          label="Texture"
          value={t.background}
          options={[
            { value: 'tinted', label: 'Tinted' },
            { value: 'pure',   label: 'Pure' },
            { value: 'grain',  label: 'Grain' },
            { value: 'dots',   label: 'Dots' },
          ]}
          onChange={(v) => setTweak('background', v)}
        />
        <TweakSection label="Animations" />
        <TweakToggle label="Shimmer KPI + CTA" value={t.shimmerOn} onChange={(v) => setTweak('shimmerOn', v)} />
        <TweakToggle label="Pulse halo FAB"    value={t.haloPulse} onChange={(v) => setTweak('haloPulse', v)} />
      </TweaksPanel>
    </>
  );
}

function DashboardScreen({ onPremium }) {
  return (
    <>
      <div className="page-title">Ton mois en un coup d'œil</div>
      <KpiGrid/>

      <div className="section-head">
        <h2>Évolution du profit</h2>
        <span className="sub">6 derniers mois</span>
      </div>
      <ProfitCurve/>

      <div className="section-head">
        <h2>Dernières ventes</h2>
        <span className="sub" style={{color:'#1D9E75', fontWeight:800}}>Voir tout →</span>
      </div>
      <SalesList/>

      <div style={{marginTop: 18}}>
        <PremiumCTA onClick={onPremium}/>
      </div>
    </>
  );
}

function StatsScreen({ onPremium }) {
  return (
    <>
      <div className="page-title">Stats avancées</div>

      <div className="section-head" style={{marginTop:0}}>
        <h2>Activité 84 jours</h2>
        <span className="sub">+247 € · 6M</span>
      </div>
      <ProfitCurve/>

      <div className="section-head">
        <h2>Profit par catégorie</h2>
        <span className="sub">Avril 2026</span>
      </div>
      <CategoryDonut/>

      <div style={{marginTop: 18}}>
        <PremiumCTA label="Passer en Premium" price="4,99€/mois" onClick={onPremium}/>
      </div>
    </>
  );
}

function EmptyScreen({ onStart, onPremium }) {
  return (
    <>
      <div className="page-title" style={{marginBottom:8}}>Bienvenue 👋</div>
      <p style={{margin:'0 4px 16px', color:'#6B7280', fontSize:13, lineHeight:1.55}}>
        Ton tableau de bord se remplira au fur et à mesure de tes ventes.
      </p>
      <WelcomeCard onStart={onStart} onPremium={onPremium}/>
    </>
  );
}

function FrameHost() {
  return (
    <IOSDevice width={402} height={874}>
      <App/>
    </IOSDevice>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<FrameHost/>);
