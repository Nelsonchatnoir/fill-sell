// ═══════════════════════════════════════════════════════════════════════════
// STATS VIDE — maquette « fillsell-ecrans-vides.html » validée par Nico (16/10)
// ═══════════════════════════════════════════════════════════════════════════
// Ce qui disparaît : l'axe à « −1 € » d'une courbe sans donnée, les « -- » des
// cartes, le bouton « Actualiser » d'une analyse IA qui n'a rien à lire. Ce qui
// le remplace : un APERÇU étiqueté comme tel (la courbe se dessine, sans un
// seul chiffre), des cartes en chargement animé, et un seul geste — mettre ses
// articles en vente (onglet Stock).
import { UI } from '../../components/ui';
import { CSS_ECRANS } from '../animations';
import { Boucle } from '../primitives';
import Icone from '../Icone';

const ENCRE2 = '#5C6560';
const CARTE = { background: '#FFFFFF', border: `1px solid ${UI.border}` };
const COURBE = 'M4 132 C40 128 58 112 88 114 C118 116 132 92 162 90 C192 88 206 70 236 64 C262 58 284 40 316 30';
const DEPUIS = {
  '1M': ['il y a 1 mois', '1 month ago'], '3M': ['il y a 3 mois', '3 months ago'], '6M': ['il y a 6 mois', '6 months ago'],
  '1A': ['il y a 1 an', '1 year ago'], '1Y': ['il y a 1 an', '1 year ago'], Tout: ['au début', 'the start'], All: ['au début', 'the start'],
};

function Squelette({ largeur, sombre = false, hauteur = 22 }) {
  return <span className={sombre ? 'fsx-skd' : 'fsx-sk'} style={{ display: 'block', width: largeur, height: hauteur, borderRadius: 8 }} />;
}

export default function StatsVide({ lang, range = '6M', onStock }) {
  const fr = lang !== 'en';
  const depuis = (DEPUIS[range] ?? DEPUIS['6M'])[fr ? 0 : 1];
  const kpis = fr
    ? [['REVENU', '62%'], ['VENTES', '40%'], ['MARGE MOY.', '55%'], ['DÉLAI MOY.', '48%'], ['PANIER MOYEN', '58%']]
    : [['REVENUE', '62%'], ['SALES', '40%'], ['AVG MARGIN', '55%'], ['AVG DAYS', '48%'], ['AVG BASKET', '58%']];
  return (
    <div className="fsx-ecran" style={{ display: 'flex', flexDirection: 'column', fontFamily: "'Space Grotesk',sans-serif", color: UI.ink }}>
      <style>{CSS_ECRANS}</style>

      <Boucle style={{ ...CARTE, marginTop: 14, padding: 18, borderRadius: 28, boxShadow: '0 18px 40px -26px rgba(18,63,56,.3)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{fr ? 'Évolution du profit' : 'Profit over time'}</div>
          <span style={{ height: 24, padding: '0 10px', borderRadius: 12, background: '#E6F1EE', color: UI.tealDeep, fontSize: 11, fontWeight: 700, letterSpacing: '.1em', display: 'inline-flex', alignItems: 'center' }}>{fr ? 'APERÇU' : 'PREVIEW'}</span>
        </div>
        <svg viewBox="0 0 322 160" width="100%" role="img" style={{ display: 'block', overflow: 'visible' }}
          aria-label={fr ? 'Aperçu animé de la courbe de profit, vide tant qu’il n’y a pas de vente' : 'Animated preview of the profit curve, empty until your first sale'}>
          <defs>
            <linearGradient id="fsx-sv-aire" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={UI.teal} stopOpacity=".22" /><stop offset="1" stopColor={UI.teal} stopOpacity="0" /></linearGradient>
            <linearGradient id="fsx-sv-ligne" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#7FCBBD" /><stop offset="1" stopColor={UI.tealDeep} /></linearGradient>
          </defs>
          <g stroke="#EEEBE5" strokeWidth="1"><path d="M0 30H322" /><path d="M0 75H322" /><path d="M0 120H322" /></g>
          <path className="fsx-aire" d={`${COURBE} L316 150 L4 150 Z`} fill="url(#fsx-sv-aire)" />
          <path className="fsx-ligne" d={COURBE} pathLength="1" fill="none" stroke="url(#fsx-sv-ligne)" strokeWidth="3" strokeLinecap="round" />
          <circle className="fsx-pingBoucle" cx="316" cy="30" r="6" fill={UI.teal} />
          <circle className="fsx-point" cx="316" cy="30" r="6" fill="#FFFFFF" stroke={UI.tealDeep} strokeWidth="3" />
          <path d="M0 150H322" stroke="#DCD8D0" strokeWidth="1.5" />
        </svg>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#8A918E', marginTop: -6 }}>
          <span>{depuis}</span><span>{fr ? "aujourd'hui" : 'today'}</span>
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.45, color: ENCRE2, textAlign: 'center' }}>
          {fr ? 'Ta courbe se dessinera dès ta première vente.' : 'Your curve will draw itself from your first sale.'}
        </div>
      </Boucle>

      <Boucle style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
        <div style={{ padding: 16, borderRadius: 22, background: `linear-gradient(150deg,${UI.teal},${UI.tealDeep})`, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.12em', color: '#D5EEE8' }}>{fr ? 'PROFIT TOTAL' : 'TOTAL PROFIT'}</span>
          <Squelette largeur="70%" sombre />
        </div>
        {kpis.map(([l, w]) => (
          <div key={l} style={{ ...CARTE, padding: 16, borderRadius: 22, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.12em', color: '#6F7774' }}>{l}</span>
            <Squelette largeur={w} />
          </div>
        ))}
      </Boucle>

      {/* Analyse IA : AUCUN bouton tant qu'il n'y a rien à analyser. */}
      <Boucle style={{ ...CARTE, marginTop: 12, padding: 20, borderRadius: 26, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 42, height: 42, borderRadius: 13, background: 'linear-gradient(135deg,#E6F1EE,#CFE7E0)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <Icone nom="ia2" taille={22} couleur={UI.tealDeep} className="fsx-scintille" />
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 17, fontWeight: 700 }}>{fr ? 'Analyse IA' : 'AI analysis'}</span>
            <span style={{ fontSize: 12.5, color: '#6A7270' }}>{fr ? 'Se lance après tes premières ventes' : 'Starts after your first sales'}</span>
          </div>
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.5, color: ENCRE2 }}>
          {fr ? "L'IA te montrera ce qui part le mieux, à quel prix et en combien de temps." : 'The AI will show you what sells best, at what price and how fast.'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderRadius: 16, background: '#F4F2EE' }}>
          {[['courbe', '#E6F1EE', UI.tealDeep, fr ? 'Tendances' : 'Trends', '0s'], ['etiquette', '#FBEDE4', '#B4521F', fr ? 'Prix conseillés' : 'Suggested prices', '.5s'], ['horloge', '#E6F1EE', UI.tealDeep, fr ? 'Délai de vente' : 'Time to sell', '1s']].map(([ic, fond, c, t, d]) => (
            <div key={t} className="fsx-rowUp" style={{ animationDelay: d, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 22, height: 22, borderRadius: 7, background: fond, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><Icone nom={ic} taille={12} couleur={c} epaisseur={3} /></span>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: '#2B3533', whiteSpace: 'nowrap' }}>{t}</span>
              <span className="fsx-sk" style={{ flex: 1, height: 8, borderRadius: 4 }} />
            </div>
          ))}
        </div>
      </Boucle>

      <Boucle style={{ ...CARTE, marginTop: 12, padding: 20, borderRadius: 26, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 17, fontWeight: 700 }}>{fr ? 'Délai moyen par catégorie' : 'Average time by category'}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[['78%', '0s', `linear-gradient(90deg,#BFE1D9,${UI.teal})`], ['52%', '.25s', `linear-gradient(90deg,#BFE1D9,${UI.teal})`], ['34%', '.5s', `linear-gradient(90deg,#F5D3BF,${UI.amber})`]].map(([w, d, bg]) => (
            <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="fsx-sk" style={{ width: 64, height: 10, borderRadius: 5, flex: 'none' }} />
              <span style={{ flex: 1, height: 12, borderRadius: 6, background: '#F1EFEB', overflow: 'hidden' }}>
                <span className="fsx-pousse" style={{ animationDelay: d, display: 'block', width: w, height: 12, borderRadius: 6, background: bg }} />
              </span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 13, color: '#6A7270' }}>{fr ? 'Apparaîtra après tes premières ventes.' : 'Will appear after your first sales.'}</div>
      </Boucle>

      <button type="button" onClick={onStock}
        style={{ margin: '20px 0 0', height: 54, border: 0, borderRadius: 27, background: `linear-gradient(135deg,${UI.teal},${UI.tealDeep})`, color: '#FFFFFF', fontFamily: 'inherit', fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: '0 10px 24px -10px rgba(27,110,98,.6)', cursor: 'pointer', width: '100%' }}>
        {fr ? 'Mettre mes articles en vente' : 'Put my items up for sale'}<Icone nom="fleche" taille={18} couleur="#FFFFFF" epaisseur={2.2} />
      </button>
    </div>
  );
}
