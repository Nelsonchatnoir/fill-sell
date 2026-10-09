// Module d'aperçu (captures du site), jamais livré.
// ═══════════════════════════════════════════════════════════════════════════
// APERÇU SITE — LA COQUILLE D'App.jsx (en-tête + barre d'onglets), 09/10/2026
// ═══════════════════════════════════════════════════════════════════════════
// App.jsx ne se monte pas sans session (et une session fillsell.app en
// automatisation est interdite). Comme stock-refonte.jsx, on RECOPIE la
// coquille : même balisage, mêmes classes (topbar, bnav, wrap page-pad), mêmes
// composants réels (BrandMark, PlanBadge, icônes Lucide), mêmes styles en
// ligne que src/App.jsx (en-tête l. 8097-8150, zone qui défile l. 8253, barre
// d'onglets l. 10000-10045). Le compteur d'annonces de l'en-tête n'est PAS
// affiché (quotas = null) : aucun chiffre de quota sur les captures du site.
// (09/10, décision de Nico) La pastille de palier (Pro, Premium, Business) de
// l'en-tête n'est PAS affichée non plus (badgePalier = false par défaut) :
// aucun palier ne s'affiche à côté de la republication automatique, qui
// existe à tous les paliers. Ce sont les deux seuls écarts avec App.jsx.
import { BarChart3, Bot, Aperture, ClipboardList, LineChart, Settings } from 'lucide-react';
import BrandMark from '../../src/components/BrandMark.jsx';
import PlanBadge from '../../src/components/PlanBadge.jsx';
import { formatCurrency } from '../../src/utils/shared.js';
import { UI } from '../../src/components/ui.jsx';

const TABS = [
  { Icon: BarChart3, label: 'Tableau', idx: 0 }, { Icon: Bot, label: 'Stock IA', idx: 1 },
  { Icon: Aperture, label: 'Lens', idx: 2 }, { Icon: ClipboardList, label: 'Ventes', idx: 3 }, { Icon: LineChart, label: 'Stats', idx: 4 },
];

export function EnTete({ tm = { profit: 0, count: 0 }, isPro = true, badgePalier = false }) {
  return (
    <div className="topbar">
      <BrandMark onClick={() => {}} />
      <div className="header-centre" style={{ flex: 1, textAlign: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: UI.ink, letterSpacing: '-0.02em', lineHeight: 1 }}>
          {formatCurrency(tm.profit, 'EUR')}<span style={{ opacity: 0.55, fontSize: 11, fontWeight: 700 }}> profit</span>
        </div>
        <div style={{ fontSize: 10, fontWeight: 700, color: UI.mute, marginTop: 2, whiteSpace: 'nowrap' }}>{tm.count} ventes ce mois</div>
      </div>
      <div className="tb-right">
        {badgePalier && <PlanBadge isPremium isPro={isPro} isBusiness={false} onClick={() => {}} />}
        <button type="button" title="Réglages" aria-label="Réglages" className="tb-icon-btn-light"><Settings size={20} strokeWidth={1.8} aria-hidden="true" /></button>
      </div>
    </div>
  );
}

export function BarreOnglets({ actif = 0 }) {
  return (
    <div className="bnav" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, justifyContent: 'center', zIndex: 50, paddingBottom: 'calc(env(safe-area-inset-bottom,0px) + 14px)' }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 4, padding: '10px 10px 10px', borderRadius: 26, background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(18px) saturate(1.6)', WebkitBackdropFilter: 'blur(18px) saturate(1.6)', border: '1px solid #E7E3D8', boxShadow: '0 12px 32px rgba(16,32,27,0.10), 0 2px 8px rgba(16,32,27,0.05)' }}>
        {TABS.map((onglet) => {
          const { Icon, label, idx } = onglet;
          const isActive = idx === actif;
          if (idx === 2) return (
            <button key={idx} type="button" style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', width: 60, background: 'none', border: 'none', padding: 0, fontFamily: 'inherit' }}>
              <span style={{ position: 'absolute', top: -26, width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(155deg,#2F9E90,#1B6E62)', boxShadow: isActive ? '0 8px 22px rgba(47,158,144,0.45), 0 0 0 5px #F6F5F1' : '0 6px 16px rgba(47,158,144,0.32), 0 0 0 5px #F6F5F1', display: 'flex', alignItems: 'center', justifyContent: 'center', transform: isActive ? 'scale(1.04)' : 'scale(1)' }}>
                <Icon size={22} color="#FFFFFF" strokeWidth={1.9} />
              </span>
              <span style={{ height: 30 }} />
              <span style={{ fontSize: 10, fontWeight: 600, color: isActive ? '#2F9E90' : '#8A8578' }}>{label}</span>
            </button>
          );
          return (
            <button key={idx} type="button" style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '4px 0', width: 60, background: 'none', border: 'none', fontFamily: 'inherit' }}>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 30 }}>
                {isActive && <span style={{ position: 'absolute', inset: 0, borderRadius: 12, background: 'rgba(47,158,144,0.10)' }} />}
                <Icon size={17} color={isActive ? '#2F9E90' : '#A6A192'} strokeWidth={isActive ? 2.1 : 1.7} />
              </div>
              <span style={{ fontSize: 10, fontWeight: 500, color: isActive ? '#2F9E90' : '#8A8578' }}>{label}</span>
              {isActive && <span style={{ position: 'absolute', bottom: -3, width: 3, height: 3, borderRadius: '50%', background: '#2F9E90' }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** La coquille entière : en-tête, zone qui défile, barre d'onglets. */
export function Coquille({ onglet = 0, tm, isPro = true, badgePalier = false, scrollRef = null, children }) {
  return (
    <div className="app-root" style={{ height: '100dvh', overflowY: 'hidden', display: 'flex', flexDirection: 'column', overflowX: 'hidden', maxWidth: '100vw', position: 'relative' }}>
      <EnTete tm={tm} isPro={isPro} badgePalier={badgePalier} />
      <div className="desktop-nav" style={{ background: '#fff', borderBottom: '1px solid rgba(0,0,0,0.06)' }} />
      <div ref={scrollRef} id="zone-defilement" className="wrap page-pad" style={{ padding: '18px 14px 16px', background: 'var(--bg)', flex: '1', overflowY: 'auto', WebkitOverflowScrolling: 'touch', minHeight: 0 }}>
        {children}
      </div>
      <BarreOnglets actif={onglet} />
    </div>
  );
}
