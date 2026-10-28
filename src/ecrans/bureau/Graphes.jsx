// Graphes du Tableau et des Statistiques sur ordinateur (28/10). Dessinés à la
// taille MESURÉE de leur boîte (useTaille) : jamais un viewBox étiré, donc des
// libellés d'axe à 11,5 px quelle que soit la largeur (le défaut de l'ancien
// écran : « ept. Oct. » énormes et tronqués). Survol : crosshair + infobulle sur
// les courbes, infobulle par colonne sur les barres ; même détail au clavier.
import { useState } from 'react';
import { useTaille } from './outils';

function maxRond(v) {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  const m = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((x) => n <= x) ?? 10;
  return m * p;
}
const graduations = (max, n) => Array.from({ length: n + 1 }, (_, i) => (max * i) / n);
/** Graduations à libeller : jamais deux fois le même texte (« 1 € » répété sur un petit axe), rien sur un axe vide. */
function libellees(max, n, fy, vide) {
  if (vide) return graduations(max, n).slice(0, 1).map((t) => ({ t, l: fy(t) }));
  const out = [];
  for (const t of graduations(max, n)) { const l = fy(t); if (!out.length || out[out.length - 1].l !== l) out.push({ t, l }); }
  return out;
}

/** Infobulle : { titre, lignes: [{ couleur, libelle, valeur, boite }], note }. */
function Bulle({ contenu, x, largeurBoite }) {
  if (!contenu) return null;
  const gauche = x + 190 > largeurBoite ? Math.max(0, x - 196) : x + 14;
  return (
    <div className="fsb-tip" style={{ left: gauche, top: 6 }} role="status">
      {contenu.titre && <div className="fsb-t">{contenu.titre}</div>}
      {contenu.lignes.map((l, i) => (
        <div className="fsb-r" key={i}><span>{l.couleur && <i className={l.boite ? 'fsb-box' : ''} style={{ background: l.couleur }} />}{l.libelle}</span><b>{l.valeur}</b></div>
      ))}
      {contenu.note && <div className="fsb-x">{contenu.note}</div>}
    </div>
  );
}

/**
 * Courbes (cumuls jour par jour). n points sur l'axe ; séries : { vals (null =
 * pas encore passé), couleur, voile, epaisseur, fin (étiquette du dernier point) }.
 */
export function Courbes({ n, series, fy, xTicks, bulle, aria, hauteurMin = 290, vide = null }) {
  const [ref, { w, h: hBoite }] = useTaille();
  const [survol, setSurvol] = useState(null);
  const H = Math.max(hauteurMin, hBoite || 0);
  const padL = 56, padR = 86, padT = 10, padB = 26;
  const iw = Math.max(10, w - padL - padR), ih = H - padT - padB;
  const tous = series.flatMap((s) => s.vals.filter((v) => v != null));
  const max = maxRond(Math.max(...tous, 0) * 1.04);
  const X = (i) => padL + (n <= 1 ? 0 : (i * iw) / (n - 1));
  const Y = (v) => padT + ih - (v / max) * ih;
  const pointer = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) - (padL - 6)) / (iw / Math.max(1, n - 1)))));
    setSurvol(i);
  };
  const clavier = (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); setSurvol((i) => Math.min(n - 1, (i ?? -1) + 1)); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); setSurvol((i) => Math.max(0, (i ?? n) - 1)); }
  };
  return (
    <div ref={ref} className="fsb-chart" style={{ minHeight: hauteurMin }}>
      {w > 0 && (
        <svg width={w} height={H} role="img" aria-label={aria}>
          {libellees(max, 4, fy, !(Math.max(...tous, 0) > 0)).map(({ t, l }) => (
            <g key={t}><line x1={padL} x2={w - padR + 8} y1={Y(t)} y2={Y(t)} stroke="var(--fsb-line)" /><text x={padL - 10} y={Y(t) + 4} textAnchor="end">{l}</text></g>
          ))}
          {xTicks.map((k) => <text key={k.i} x={X(k.i)} y={H - 6} textAnchor="middle" className={k.fort ? 'fsb-fort' : undefined}>{k.l}</text>)}
          {series.map((s, si) => {
            const pts = s.vals.map((v, i) => (v == null ? null : [X(i), Y(v)])).filter(Boolean);
            if (!pts.length) return null;
            const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
            const der = pts[pts.length - 1];
            return (
              <g key={si}>
                {s.voile && <path className="fsb-wash" d={`${d}L${der[0].toFixed(1)},${Y(0)}L${pts[0][0].toFixed(1)},${Y(0)}Z`} fill={s.couleur} fillOpacity=".10" />}
                <path className="fsb-draw" pathLength="1" d={d} fill="none" stroke={s.couleur} strokeWidth={s.epaisseur ?? 2} strokeLinecap="round" strokeLinejoin="round" style={{ animationDelay: `${0.15 + si * 0.15}s` }} />
                {s.fin && <><circle cx={der[0]} cy={der[1]} r="4.5" fill={s.couleur} stroke="var(--fsb-paper)" strokeWidth="2" /><text x={der[0] + 9} y={der[1] + 4} className="fsb-endlab">{s.fin}</text></>}
              </g>
            );
          })}
          {survol != null && (
            <g aria-hidden="true">
              <line x1={X(survol)} x2={X(survol)} y1={padT} y2={padT + ih} stroke="var(--fsb-ink)" strokeOpacity=".35" />
              {series.map((s, si) => (s.vals[survol] == null ? null : <circle key={si} cx={X(survol)} cy={Y(s.vals[survol])} r="4.5" fill={s.couleur} stroke="var(--fsb-paper)" strokeWidth="2" />))}
            </g>
          )}
          <rect x={padL - 6} y="0" width={iw + 12} height={H} fill="transparent" tabIndex={0}
            aria-label={aria} onPointerMove={pointer} onPointerLeave={() => setSurvol(null)} onFocus={() => setSurvol((i) => i ?? n - 1)} onBlur={() => setSurvol(null)} onKeyDown={clavier} />
        </svg>
      )}
      {vide && <div className="fsb-chart-vide">{vide}</div>}
      {survol != null && w > 0 && <Bulle contenu={bulle(survol)} x={X(survol)} largeurBoite={w} />}
    </div>
  );
}

/**
 * Colonnes, une ou deux séries côte à côte. couleur : chaîne ou (i) => chaîne.
 * labels '' = graduation masquée (la colonne reste). fy null = pas d'axe Y.
 */
export function Colonnes({ labels, series, fy = null, vlab = null, bulle, aria, hauteur = 150, hauteurMin = null, epaisseurMax = 24, fort = null, graduationsY = 3, padL: padLProp = null }) {
  const [ref, { w, h: hBoite }] = useTaille();
  const [survol, setSurvol] = useState(null);
  const H = hauteurMin ? Math.max(hauteurMin, hBoite || 0) : hauteur;
  const padL = padLProp ?? (fy ? 48 : 6), padR = 8, padT = vlab ? 20 : 12, padB = 26;
  const n = labels.length, iw = Math.max(10, w - padL - padR), ih = H - padT - padB, bande = iw / Math.max(1, n);
  const tous = series.flatMap((s) => s.vals.filter((v) => v != null));
  const max = maxRond(Math.max(...tous, 0) * 1.02);
  const Y = (v) => padT + ih - (v / max) * ih;
  const k = series.length;
  const bw = Math.max(2, Math.min(epaisseurMax, (bande * 0.72 - (k - 1) * 2) / k));
  return (
    <div ref={ref} className="fsb-chart" style={{ height: hauteurMin ? undefined : hauteur, minHeight: hauteurMin ?? undefined }}>
      {w > 0 && (
        <svg width={w} height={H} role="img" aria-label={aria}>
          {fy ? libellees(max, graduationsY, fy, !(Math.max(...tous, 0) > 0)).map(({ t, l }) => (
            <g key={t}><line x1={padL} x2={w - padR} y1={Y(t)} y2={Y(t)} stroke="var(--fsb-line)" /><text x={padL - 10} y={Y(t) + 4} textAnchor="end">{l}</text></g>
          )) : <line x1={padL} x2={w - padR} y1={Y(0)} y2={Y(0)} stroke="var(--fsb-line)" />}
          {labels.map((lab, i) => {
            const cx = padL + bande * i + bande / 2;
            return (
              <g key={i} opacity={survol != null && survol !== i ? 0.55 : 1}>
                {series.map((s, si) => {
                  const v = s.vals[i];
                  if (v == null || !(v > 0)) return null;
                  const x = cx - (k * bw + (k - 1) * 2) / 2 + si * (bw + 2);
                  const y = Y(v), hh = Math.max(0, Y(0) - y), r = Math.min(4, bw / 2, hh);
                  const coul = typeof s.couleur === 'function' ? s.couleur(i) : s.couleur;
                  return (
                    <g key={si}>
                      <path className="fsb-grow" style={{ animationDelay: `${(0.1 + i * 0.025).toFixed(3)}s` }} d={`M${x},${Y(0)}V${y + r}Q${x},${y} ${x + r},${y}H${x + bw - r}Q${x + bw},${y} ${x + bw},${y + r}V${Y(0)}Z`} fill={coul} />
                      {vlab && <text x={x + bw / 2} y={y - 6} textAnchor="middle" style={{ fill: 'var(--fsb-ink2)', fontWeight: 600 }}>{vlab(v, i)}</text>}
                    </g>
                  );
                })}
                {lab && <text x={cx} y={H - 6} textAnchor="middle" className={fort && fort(i) ? 'fsb-fort' : undefined}>{lab}</text>}
                <rect x={padL + bande * i} y={padT} width={bande} height={ih} fill="transparent" tabIndex={-1}
                  onPointerEnter={() => setSurvol(i)} onPointerLeave={() => setSurvol(null)} />
              </g>
            );
          })}
        </svg>
      )}
      {survol != null && w > 0 && <Bulle contenu={bulle(survol)} x={padL + bande * survol + bande / 2} largeurBoite={w} />}
    </div>
  );
}

/** Mini-courbe du bloc profit (fond encre) : cumul de la période, et celle d'avant en filigrane. */
export function TraceHeros({ cur, prev, n, colonnes = null }) {
  const [ref, { w, h: hBoite }] = useTaille();
  const H = Math.max(84, hBoite || 0);
  if (colonnes) {
    const max = Math.max(...colonnes.map((c) => c), 1);
    const bw = w ? Math.min(18, (w / colonnes.length) * 0.6) : 0;
    return (
      <span ref={ref} className="fsb-chart" aria-hidden="true">
        {w > 0 && <svg width={w} height={H}>{colonnes.map((v, i) => {
          const cx = ((i + 0.5) * w) / colonnes.length;
          const hh = v > 0 ? Math.max(2, (v / max) * (H - 10)) : 0;
          return <rect key={i} className="fsb-grow" style={{ animationDelay: `${0.1 + i * 0.03}s` }} x={cx - bw / 2} y={H - hh} width={bw} height={hh} rx="3" fill={i === colonnes.length - 1 ? 'var(--fsb-hero-line)' : 'rgba(108,210,193,.45)'} />;
        })}</svg>}
      </span>
    );
  }
  const max = Math.max(...cur, ...prev, 1);
  const X = (i) => 4 + (i * (w - 12)) / Math.max(1, n - 1), Y = (v) => H - 6 - (v / max) * (H - 14);
  const chemin = (a) => a.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
  const li = cur.length - 1;
  return (
    <span ref={ref} className="fsb-chart" aria-hidden="true">
      {w > 0 && cur.length > 0 && (
        <svg width={w} height={H}>
          {prev.length > 0 && <path d={chemin(prev)} fill="none" stroke="rgba(246,245,241,.28)" strokeWidth="2" strokeLinecap="round" />}
          <path className="fsb-wash" d={`${chemin(cur)}L${X(li)},${H - 6}L${X(0)},${H - 6}Z`} fill="var(--fsb-hero-line)" fillOpacity=".14" />
          <path className="fsb-draw" pathLength="1" d={chemin(cur)} fill="none" stroke="var(--fsb-hero-line)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={X(li)} cy={Y(cur[li])} r="4.5" fill="var(--fsb-hero-line)" stroke="var(--fsb-hero)" strokeWidth="2" />
        </svg>
      )}
    </span>
  );
}
