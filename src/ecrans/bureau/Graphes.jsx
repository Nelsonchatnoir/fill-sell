// Graphes du Tableau et des Statistiques sur ordinateur (28/10). Dessinés à la
// taille MESURÉE de leur boîte (useTaille) : jamais un viewBox étiré, donc des
// libellés d'axe à 11,5 px quelle que soit la largeur (le défaut de l'ancien
// écran : « ept. Oct. » énormes et tronqués). Survol : crosshair + infobulle sur
// les courbes, infobulle par colonne sur les barres ; même détail au clavier.
// (29/10) Téléphone : `bandeau` — on lit au doigt (toucher ou glisser) et la valeur
// s'affiche dans un bandeau AU-DESSUS du graphe, que le pouce ne cache pas ;
// le défilement vertical de la page reste libre (touch-action: pan-y).
// (29/10) Axe horizontal : l'appelant décrit des jeux de libellés (axe.js), le graphe garde
// le premier qui tient à sa largeur mesurée — jamais deux libellés qui se touchent, ni
// sous le libellé « 0 » de l'axe vertical (rien à gauche du tracé).
// (29/10) Graphe vide (rien que des zéros) : aucun curseur, aucun bandeau ni infobulle, le
// message centré sur la zone du tracé, sans rien qui le traverse. Focus : jamais de cadre au
// toucher (bureau.css, utils/modaliteSaisie.js) ; au clavier, la zone des courbes s'entoure d'un
// trait à nos couleurs.
import { useState } from 'react';
import { grapheVide, useMesureTexte, useTaille } from './outils';
import { placerAxe } from './axe';

/** Haut d'axe tel que CHAQUE graduation tombe sur un nombre rond (250, 500… jamais 333 ou 667). */
function maxRond(v, n = 4) {
  if (!(v > 0)) return n;
  const brut = v / n;
  const p = 10 ** Math.floor(Math.log10(brut));
  const pas = ([1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((x) => brut / p <= x) ?? 10) * p;
  return pas * n;
}
const graduations = (max, n) => Array.from({ length: n + 1 }, (_, i) => (max * i) / n);
/** Graduations à libeller : jamais deux fois le même texte (« 1 € » répété sur un petit axe), rien sur un axe vide. */
function libellees(max, n, fy, vide) {
  if (vide) return graduations(max, n).slice(0, 1).map((t) => ({ t, l: fy(t) }));
  const out = [];
  for (const t of graduations(max, n)) { const l = fy(t); if (!out.length || out[out.length - 1].l !== l) out.push({ t, l }); }
  return out;
}

const classeAxe = (k) => (k.annee ? 'fsb-annee' : k.gras ? 'fsb-fort' : undefined);

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

/** Bandeau de lecture (téléphone) : la valeur touchée, au-dessus du graphe. */
function Lecture({ contenu, indication }) {
  return (
    <div className="fsb-lecture" aria-live="polite">
      {contenu ? (
        <>
          {contenu.titre && <span className="fsb-lt">{contenu.titre}</span>}
          <span className="fsb-lsep" />
          {contenu.lignes.map((l, i) => <span key={i} className="fsb-lv">{l.couleur && <i className={l.boite ? 'fsb-box' : ''} style={{ background: l.couleur }} />}<b>{l.valeur}</b></span>)}
          {contenu.note && <span className="fsb-ln">{contenu.note}</span>}
        </>
      ) : <span className="fsb-ln">{indication}</span>}
    </div>
  );
}

/**
 * Courbes (cumuls jour par jour). n points sur l'axe ; séries : { vals (null =
 * pas encore passé), couleur, voile, epaisseur, fin (étiquette du dernier point) }.
 */
export function Courbes({ n, series, fy, axe, bulle, aria, hauteurMin = 290, vide = null, bandeau = false, indication = '', padGauche = 56, padDroite = 86 }) {
  const [ref, { w, h: hBoite }] = useTaille();
  const mesurer = useMesureTexte(ref);
  const [survol, setSurvol] = useState(null);
  const H = Math.max(hauteurMin, hBoite || 0);
  const padL = padGauche, padR = padDroite, padT = 10, padB = 26;
  const iw = Math.max(10, w - padL - padR), ih = H - padT - padB;
  const tous = series.flatMap((s) => s.vals.filter((v) => v != null));
  const estVide = Boolean(vide) || grapheVide(series);
  const max = maxRond(Math.max(...tous, 0) * 1.04, bandeau ? 3 : 4);
  const X = (i) => padL + (n <= 1 ? 0 : (i * iw) / (n - 1));
  const Y = (v) => padT + ih - (v / max) * ih;
  // Le jour lu est celui SOUS le doigt / la souris (29/10 : la marge gauche était retirée deux fois,
  // le curseur tombait ~40 px à gauche du doigt).
  const pointer = (e) => {
    const r = e.currentTarget.ownerSVGElement.getBoundingClientRect();
    const i = Math.max(0, Math.min(n - 1, Math.round((e.clientX - r.left - padL) / (iw / Math.max(1, n - 1)))));
    setSurvol(i);
  };
  // Téléphone : sans toucher, le bandeau montre le dernier jour connu (aujourd'hui).
  const dernier = (() => { const v = series[series.length - 1]?.vals ?? []; for (let i = v.length - 1; i >= 0; i -= 1) if (v[i] != null) return i; return null; })();
  const lu = estVide ? null : survol ?? (bandeau ? dernier : null);
  const clavier = (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); setSurvol((i) => Math.min(n - 1, (i ?? -1) + 1)); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); setSurvol((i) => Math.max(0, (i ?? n) - 1)); }
  };
  const graphe = (
    <div ref={ref} className={`fsb-chart${bandeau ? ' fsb-tactile' : ''}`} style={{ minHeight: hauteurMin }}>
      {w > 0 && (
        <svg width={w} height={H} role="img" aria-label={aria}>
          {libellees(max, bandeau ? 3 : 4, fy, !(Math.max(...tous, 0) > 0)).map(({ t, l }) => (
            <g key={t}><line x1={padL} x2={w - padR + 8} y1={Y(t)} y2={Y(t)} stroke="var(--fsb-line)" /><text x={padL - 10} y={Y(t) + 4} textAnchor="end">{l}</text></g>
          ))}
          {placerAxe(axe, { x: X, gauche: padL - 2, largeur: w, mesurer }).map((k) => <text key={k.i} x={k.x} y={H - 6} textAnchor="middle" className={classeAxe(k)}>{k.l}</text>)}
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
          {lu != null && (
            <g aria-hidden="true">
              <line x1={X(lu)} x2={X(lu)} y1={padT} y2={padT + ih} stroke="var(--fsb-ink)" strokeOpacity=".35" />
              {series.map((s, si) => (s.vals[lu] == null ? null : <circle key={si} cx={X(lu)} cy={Y(s.vals[lu])} r="4.5" fill={s.couleur} stroke="var(--fsb-paper)" strokeWidth="2" />))}
            </g>
          )}
          {estVide ? null : bandeau
            ? <rect className="fsb-zone" x={padL - 4} y={padT - 4} rx="8" width={iw + 8} height={ih + 8} fill="transparent" tabIndex={0} aria-label={aria}
                onPointerDown={pointer} onPointerMove={(e) => { if (e.pointerType === 'mouse' || e.buttons) pointer(e); }} onFocus={() => setSurvol((i) => i ?? dernier)} onKeyDown={clavier} />
            : <rect className="fsb-zone" x={padL - 4} y={padT - 4} rx="8" width={iw + 8} height={ih + 8} fill="transparent" tabIndex={0}
                aria-label={aria} onPointerMove={pointer} onPointerLeave={() => setSurvol(null)} onFocus={() => setSurvol((i) => i ?? dernier ?? n - 1)} onBlur={() => setSurvol(null)} onKeyDown={clavier} />}
        </svg>
      )}
      {vide && w > 0 && <div className="fsb-chart-vide" style={{ left: padL, right: padR, top: padT, bottom: padB }}>{vide}</div>}
      {!bandeau && !estVide && survol != null && w > 0 && <Bulle contenu={bulle(survol)} x={X(survol)} largeurBoite={w} />}
    </div>
  );
  if (!bandeau) return graphe;
  if (estVide) return <div className="fsb-tactile-bloc">{graphe}</div>;
  return <div className="fsb-tactile-bloc"><Lecture contenu={lu != null ? bulle(lu) : null} indication={indication} />{graphe}</div>;
}

/**
 * Colonnes, une ou deux séries côte à côte. couleur : chaîne ou (i) => chaîne.
 * axe : jeux de libellés (axe.js : axeMois, axeJours, axeSimple). fy null = pas d'axe Y.
 */
export function Colonnes({ axe, series, fy = null, vlab = null, bulle, aria, hauteur = 150, hauteurMin = null, epaisseurMax = 24, graduationsY = 3, padL: padLProp = null, bandeau = false, indication = '', vide = null }) {
  const [ref, { w, h: hBoite }] = useTaille();
  const mesurer = useMesureTexte(ref);
  const [survol, setSurvol] = useState(null);
  const H = hauteurMin ? Math.max(hauteurMin, hBoite || 0) : hauteur;
  const padL = padLProp ?? (fy ? 48 : 6), padR = 8, padT = vlab ? 20 : 12, padB = 26;
  const n = series[0]?.vals.length ?? 0, iw = Math.max(10, w - padL - padR), ih = H - padT - padB, bande = iw / Math.max(1, n);
  const tous = series.flatMap((s) => s.vals.filter((v) => v != null));
  const estVide = grapheVide(series);
  const max = maxRond(Math.max(...tous, 0) * 1.02, fy ? graduationsY : 4);
  const Y = (v) => padT + ih - (v / max) * ih;
  const k = series.length;
  const bw = Math.max(2, Math.min(epaisseurMax, (bande * 0.72 - (k - 1) * 2) / k));
  // Téléphone : une seule zone tactile sur tout le tracé (glisser d'une barre à l'autre).
  const toucher = (e) => { const r = e.currentTarget.getBoundingClientRect(); setSurvol(Math.max(0, Math.min(n - 1, Math.floor((e.clientX - r.left) / bande)))); };
  const graphe = (
    <div ref={ref} className={`fsb-chart${bandeau ? ' fsb-tactile' : ''}`} style={{ height: hauteurMin ? undefined : hauteur, minHeight: hauteurMin ?? undefined }}>
      {w > 0 && (
        <svg width={w} height={H} role="img" aria-label={aria}>
          {fy ? libellees(max, graduationsY, fy, !(Math.max(...tous, 0) > 0)).map(({ t, l }) => (
            <g key={t}><line x1={padL} x2={w - padR} y1={Y(t)} y2={Y(t)} stroke="var(--fsb-line)" /><text x={padL - 10} y={Y(t) + 4} textAnchor="end">{l}</text></g>
          )) : <line x1={padL} x2={w - padR} y1={Y(0)} y2={Y(0)} stroke="var(--fsb-line)" />}
          {series[0]?.vals.map((_, i) => {
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
                {!bandeau && !estVide && <rect x={padL + bande * i} y={padT} width={bande} height={ih} fill="transparent"
                  onPointerEnter={() => setSurvol(i)} onPointerLeave={() => setSurvol(null)} />}
              </g>
            );
          })}
          {placerAxe(axe, { x: (i) => padL + bande * i + bande / 2, gauche: fy ? padL - 2 : 0, largeur: w, mesurer }).map((k) => (
            <text key={k.i} x={k.x} y={H - 6} textAnchor="middle" className={classeAxe(k)} opacity={survol != null && survol !== k.i ? 0.55 : 1}>{k.l}</text>
          ))}
          {bandeau && !estVide && <rect x={padL} y={0} width={iw} height={H} fill="transparent" aria-hidden="true"
            onPointerDown={toucher} onPointerMove={(e) => { if (e.pointerType === 'mouse' || e.buttons) toucher(e); }} />}
        </svg>
      )}
      {estVide && vide && w > 0 && <div className="fsb-chart-vide" style={{ left: padL, right: padR, top: padT, bottom: padB }}>{vide}</div>}
      {!bandeau && !estVide && survol != null && w > 0 && <Bulle contenu={bulle(survol)} x={padL + bande * survol + bande / 2} largeurBoite={w} />}
    </div>
  );
  if (!bandeau) return graphe;
  if (estVide) return <div className="fsb-tactile-bloc">{graphe}</div>;
  return <div className="fsb-tactile-bloc"><Lecture contenu={survol != null ? bulle(survol) : null} indication={indication} />{graphe}</div>;
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
