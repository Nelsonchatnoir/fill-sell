/* eslint-disable react-refresh/only-export-components --
   Point d'entrée d'aperçu, jamais livré. */
// ═══════════════════════════════════════════════════════════════════════════
// APERÇU — EN-TÊTE DE L'APP + LOGO TEXTE (11/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// App.jsx ne se monte pas sans session (et une session fillsell.app en
// automatisation est interdite) : comme site-coquille.jsx, on RECOPIE
// l'en-tête (src/App.jsx, « topbar » : groupes tb-left / header-centre /
// tb-right) et la barre d'onglets de grande largeur (desktop-nav), avec les
// VRAIES feuilles (base.css, App.css, App.redesign.css) et les VRAIS composants
// (BrandMark, PlanBadge). Aucune donnée, aucune requête.
//
//   entete-marque.html?compteur=31|aucun&palier=pro|premium|business|aucun
//   entete-marque.html?vue=blog        (logo texte du blog, src/pages/blog.css)
//   node scripts/apercu/capture-entete-marque.mjs
import { createRoot } from 'react-dom/client';
import { Settings } from 'lucide-react';
import '../../src/base.css';
import '../../src/App.css';
import '../../src/App.redesign.css';
import '../../src/pages/blog.css';
import BrandMark from '../../src/components/BrandMark.jsx';
import PlanBadge from '../../src/components/PlanBadge.jsx';
import { formatCurrency } from '../../src/utils/shared.js';
import { UI } from '../../src/components/ui.jsx';

const q = new URLSearchParams(location.search);
// compteur=aucun : pas de compteur (quotas non chargés) ; absent : 31.
const brut = q.get('compteur');
const compteur = brut === null ? 31 : brut === 'aucun' ? null : Number(brut);
const palier = q.get('palier') || 'pro';
const ventes = Number(q.get('ventes') ?? 2);
const lang = q.get('lang') === 'en' ? 'en' : 'fr';

function EnTete() {
  return (
    <div className={compteur != null ? 'topbar topbar--solde' : 'topbar'}>
      <div className="tb-left">
        <BrandMark onClick={() => {}} />
        {compteur != null && (
          <button className="tb-quota" style={{ background: 'transparent', border: 'none', padding: 0, minHeight: 44, display: 'inline-flex', alignItems: 'center', cursor: 'pointer', fontFamily: 'inherit', color: 'inherit', opacity: 1 }}>
            <span className="tb-quota-chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 999, background: 'rgba(0,0,0,0.05)', color: UI.ink, fontSize: 12.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
              {compteur}
              <span className="tb-quota-libelle" style={{ fontWeight: 600, opacity: 0.65 }}>
                {lang === 'en'
                  ? <><span className="tb-quota-mot">{`listing${compteur > 1 ? 's' : ''} `}</span>left</>
                  : <><span className="tb-quota-mot">{`annonce${compteur > 1 ? 's' : ''} `}</span>{`restante${compteur > 1 ? 's' : ''}`}</>}
              </span>
            </span>
          </button>
        )}
      </div>
      <div className="header-centre" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: UI.ink, letterSpacing: '-0.02em', lineHeight: 1 }}>
          {formatCurrency(0, 'EUR')}<span style={{ opacity: 0.55, fontSize: 11, fontWeight: 700 }}> profit</span>
        </div>
        <div style={{ fontSize: 10, fontWeight: 700, color: UI.mute, marginTop: 2, whiteSpace: 'nowrap' }}>{ventes} ventes ce mois</div>
      </div>
      <div className="tb-right">
        {palier !== 'aucun' && (
          <PlanBadge isPremium isPro={palier === 'pro' || palier === 'business'} isBusiness={palier === 'business'} onClick={() => {}} />
        )}
        <button title="Réglages" aria-label="Réglages" className="tb-icon-btn-light"><Settings size={20} strokeWidth={1.8} aria-hidden="true" /></button>
      </div>
    </div>
  );
}

const ONGLETS = ['Tableau', 'Stock IA', 'Lens', 'Ventes', 'Stats'];
function Onglets({ actif = 1 }) {
  return (
    <div className="desktop-nav" style={{ background: '#fff', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
      <div className="wrap">
        <div style={{ display: 'flex', padding: '0 14px', gap: 0, overflowX: 'auto' }}>
          {ONGLETS.map((libelle, i) => (
            <button key={i} data-onglet={libelle}
              style={{ flex: 1, textAlign: 'center', padding: '10px 8px', background: 'transparent', border: 'none', borderBottom: `2px solid ${actif === i ? UI.teal : 'transparent'}`, color: actif === i ? UI.tealDeep : UI.mute, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', cursor: 'pointer' }}>
              {libelle}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Blog() {
  return (
    <div style={{ padding: 24, background: '#fff' }}>
      <a className="blog-brand" href="#"><span className="blog-brand-name">FillSell</span></a>
    </div>
  );
}

function Page() {
  if (q.get('vue') === 'blog') return <Blog />;
  return (
    <div className="app-root" style={{ height: '100dvh', overflowY: 'hidden', display: 'flex', flexDirection: 'column', overflowX: 'hidden', maxWidth: '100vw', position: 'relative' }}>
      <EnTete />
      <Onglets />
      <div className="wrap page-pad" style={{ padding: '18px 14px 16px', background: 'var(--bg)', flex: '1' }} />
    </div>
  );
}

createRoot(document.getElementById('apercu')).render(<Page />);
