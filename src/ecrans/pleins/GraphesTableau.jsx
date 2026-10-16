// ═══════════════════════════════════════════════════════════════════════════
// TABLEAU — « Bénéfices » et « Marge par mois » (16/10, maquette validée par Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Les SÉRIES viennent de DashboardTab.buildChartData (inchangée pour le
// profit : la mini-courbe de la carte « PROFIT NET » en dépend). Ces graphes
// ne font que dessiner, l'entrée se joue une fois à l'ouverture de l'onglet.
//
// « Marge par mois » — règles posées par Nico :
//   · courbe SANS dépassement : interpolation monotone (utils/ventesStats
//     .cheminMonotone), jamais sous 0 % entre deux mois positifs ;
//   · un mois SANS VENTE n'a pas de point (un « — » sur l'axe) ;
//   · un mois avec des ventes mais sans prix d'achat (> 0 €) est HACHURÉ
//     « prix d'achat manquants » — jamais un faux 0 % ;
//   · la courbe s'interrompt aux trous : on ne relie pas deux mois par-dessus
//     un mois dont on ne sait rien.
import { useState } from 'react';
import { UI } from '../../components/ui';
import { cheminMonotone } from '../../utils/ventesStats';
import { ENCRE2, DISCRET, LIGNE2, libellePct } from './jetons';

export function BarresBenefices({ data, fmtShort, fmtValue, lang }) {
  const [actif, setActif] = useState(null);
  const valeurs = data.map((d) => Math.max(0, Number(d.profit) || 0));
  const max = Math.max(...valeurs, 0);
  const haut = max > 0 ? max * 1.15 : 1;
  const iMax = max > 0 ? valeurs.indexOf(max) : -1;
  const graduations = [3, 2, 1, 0].map((k) => (max > 0 ? fmtShort((haut * k) / 3) : (k === 0 ? '0' : '')));
  const montre = actif ?? iMax;
  const dernier = data.length - 1;
  return (
    <div style={{ position: 'relative', height: 178, marginTop: 16 }}>
      <div style={{ position: 'absolute', inset: '0 0 22px 40px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }} aria-hidden="true">
        {[0, 1, 2].map((k) => <i key={k} style={{ height: 1, background: LIGNE2 }} />)}
        <i style={{ height: 1, background: '#DCD8D0' }} />
      </div>
      <div style={{ position: 'absolute', left: 0, top: -7, bottom: 15, width: 34, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', fontSize: 10.5, color: DISCRET, textAlign: 'right' }} aria-hidden="true">
        {graduations.map((g, k) => <span key={k}>{g}</span>)}
      </div>
      <div style={{ position: 'absolute', left: 44, right: 4, top: 0, bottom: 22, display: 'grid', gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))`, gap: data.length > 8 ? 4 : 10, alignItems: 'end' }}>
        {data.map((d, i) => {
          const v = valeurs[i];
          const h = max > 0 ? (v / haut) * 100 : 0;
          const vide = v <= 0;
          const principal = i === iMax;
          return (
            <button key={i} type="button" onClick={() => setActif((a) => (a === i ? null : i))}
              aria-label={`${d.name} : ${fmtValue(d.profit || 0)}`}
              style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'flex-end', height: '100%', padding: 0, border: 0, background: 'transparent', cursor: 'pointer' }}>
              {montre === i && v > 0 && (
                <span className="fsx-fade" style={{ animationDelay: actif == null ? '1.3s' : '0s', position: 'absolute', bottom: `calc(${h}% + 6px)`, fontSize: 11.5, fontWeight: 700, color: UI.tealDeep, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtValue(d.profit)}
                </span>
              )}
              <i className="fsx-gy" style={{
                animationDelay: `${(0.55 + i * 0.05).toFixed(2)}s`, display: 'block',
                width: principal ? Math.min(30, 300 / data.length) : Math.min(22, 220 / data.length),
                height: vide ? 3 : `max(5px, ${h}%)`, borderRadius: vide ? 2 : principal ? 9 : 4,
                background: vide ? '#CFE3DE' : principal ? `linear-gradient(180deg,#45B4A1,${UI.tealDeep})` : '#7CC3B5',
                opacity: actif == null || actif === i ? 1 : 0.5,
              }} />
            </button>
          );
        })}
      </div>
      <div style={{ position: 'absolute', left: 44, right: 4, bottom: 0, display: 'grid', gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))`, gap: data.length > 8 ? 4 : 10, fontSize: data.length > 8 ? 9.5 : 11.5, color: ENCRE2, textAlign: 'center' }} aria-hidden="true">
        {data.map((d, i) => <span key={i} style={i === dernier ? { color: UI.ink, fontWeight: 700 } : undefined}>{d.name}</span>)}
      </div>
      <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{lang === 'en' ? 'Profit per period' : 'Bénéfice par période'}</span>
    </div>
  );
}

// G : la marge de gauche réservée aux graduations (« 100 % », « 50 % ») — les
// colonnes (hachures comprises) ne passent jamais dessous.
const W = 320, BAS = 130, HAUT = 10, G = 38;

export function MargeParMois({ data, lang }) {
  const fr = lang !== 'en';
  const n = data.length || 1;
  const pas = (W - G) / n;
  const cx = (i) => G + pas * (i + 0.5);
  const pcts = data.filter((d) => d.marge?.etat === 'ok').map((d) => d.marge.pct);
  const min = Math.min(0, ...pcts);
  const plancher = min < 0 ? Math.floor(min / 50) * 50 : 0;
  const y = (pct) => BAS - ((Math.min(100, pct) - plancher) / (100 - plancher)) * (BAS - HAUT);
  // Segments de mois CONSÉCUTIFS avec une marge : la courbe s'arrête aux trous.
  const segments = [];
  let courant = [];
  data.forEach((d, i) => {
    if (d.marge?.etat === 'ok') courant.push({ x: cx(i), y: y(d.marge.pct), i, pct: d.marge.pct });
    else if (courant.length) { segments.push(courant); courant = []; }
  });
  if (courant.length) segments.push(courant);
  const manquants = data.filter((d) => d.marge?.etat === 'sans_achat').map((d) => d.name);
  const y0 = y(0);
  const resume = data.map((d) => `${d.name} : ${d.marge?.etat === 'ok' ? libellePct(d.marge.pct) : d.marge?.etat === 'sans_achat' ? (fr ? "prix d'achat manquants" : 'purchase prices missing') : (fr ? 'aucune vente' : 'no sale')}`).join(', ');
  let k = 0;
  return (
    <>
      <svg width="100%" viewBox={`0 0 ${W} 160`} style={{ marginTop: 12, display: 'block', overflow: 'visible' }} role="img" aria-label={resume}>
        <defs>
          <linearGradient id="fsx-mg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={UI.amber} stopOpacity=".28" /><stop offset="1" stopColor={UI.amber} stopOpacity="0" /></linearGradient>
          <pattern id="fsx-hachures" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="#FBF4EE" /><line x1="0" y1="0" x2="0" y2="6" stroke="#F1D9C8" strokeWidth="2" />
          </pattern>
        </defs>
        <g stroke={LIGNE2}><line x1={G} y1={y(100)} x2={W} y2={y(100)} /><line x1={G} y1={y(50)} x2={W} y2={y(50)} /></g>
        <line x1={G} y1={y0} x2={W} y2={y0} stroke="#DCD8D0" strokeWidth="1.5" />
        {plancher < 0 && <line x1={G} y1={BAS} x2={W} y2={BAS} stroke={LIGNE2} />}
        <g fontSize="10.5" fill={DISCRET} fontFamily="'Space Grotesk', sans-serif" textAnchor="end">
          <text x={G - 6} y={y(100) + 4}>100 %</text><text x={G - 6} y={y(50) + 4}>50 %</text>
          {plancher < 0 ? <text x={G - 6} y={BAS + 4}>{plancher} %</text> : <text x={G - 6} y={y0 + 4}>0 %</text>}
        </g>
        {data.map((d, i) => d.marge?.etat === 'sans_achat' && (
          <rect key={`h-${i}`} className="fsx-fade" style={{ animationDelay: '1.2s' }} x={cx(i) - Math.min(22, pas / 2 - 3)} y={HAUT} width={Math.min(44, pas - 6)} height={y0 - HAUT} rx="10" fill="url(#fsx-hachures)" />
        ))}
        {segments.map((seg, s) => {
          const d = cheminMonotone(seg);
          const aire = seg.length > 1 ? `${d} L${seg[seg.length - 1].x.toFixed(1)},${y0} L${seg[0].x.toFixed(1)},${y0} Z` : null;
          return (
            <g key={`s-${s}`}>
              {aire && <path className="fsx-fade" style={{ animationDelay: '1s' }} d={aire} fill="url(#fsx-mg)" />}
              {seg.length > 1 && <path className="fsx-draw" style={{ animationDelay: '.6s' }} pathLength="1" d={d} fill="none" stroke={UI.amber} strokeWidth="3" strokeLinecap="round" />}
            </g>
          );
        })}
        {segments.flat().map((p) => {
          const delai = 0.7 + (k++) * 0.25;
          const dessus = p.y > HAUT + 34;
          return (
            <g key={`p-${p.i}`}>
              <circle className="fsx-popin" style={{ animationDelay: `${delai.toFixed(2)}s` }} cx={p.x} cy={p.y} r="5" fill="#FFFFFF" stroke={UI.amber} strokeWidth="2.5" />
              <text className="fsx-fade" style={{ animationDelay: `${(delai + 0.2).toFixed(2)}s` }} x={p.x} y={dessus ? p.y - 11 : p.y + 24} textAnchor="middle"
                fontSize="11" fontWeight="700" fill="#B4521F" fontFamily="'Space Grotesk', sans-serif">{libellePct(p.pct)}</text>
            </g>
          );
        })}
        {data.map((d, i) => d.marge?.etat === 'vide' && (
          <text key={`v-${i}`} x={cx(i)} y={y0 - 4} textAnchor="middle" fontSize="11" fill={DISCRET} fontFamily="'Space Grotesk', sans-serif">—</text>
        ))}
        <g fontSize={n > 8 ? 9.5 : 11.5} fill={ENCRE2} fontFamily="'Space Grotesk', sans-serif" textAnchor="middle">
          {data.map((d, i) => <text key={`n-${i}`} x={cx(i)} y="152">{d.name}</text>)}
        </g>
      </svg>
      {manquants.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 12.5, color: ENCRE2 }}>
          <span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: 4, flex: 'none', background: 'repeating-linear-gradient(45deg,#FBF4EE 0 3px,#F1D9C8 3px 5px)' }} />
          <span>{manquants.join(', ')}{fr ? " : prix d'achat manquants, pas de marge affichée" : ': purchase prices missing, no margin shown'}</span>
        </div>
      )}
    </>
  );
}
