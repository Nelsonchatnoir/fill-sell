// ═══════════════════════════════════════════════════════════════════════════
// ÉCRANS DU 16/10 — LES PIÈCES ANIMÉES PARTAGÉES (CSS : ./animations.js)
// ═══════════════════════════════════════════════════════════════════════════
import { useEffect, useRef, useState } from 'react';

const CHIFFRE = /[0-9]/;

/**
 * Un montant qui « compte » à l'entrée : chaque chiffre roule de 0 jusqu'à sa
 * valeur (CSS seul). Le texte exact reste lu par les lecteurs d'écran
 * (aria-label) ; sous « réduire les animations », il est affiché d'emblée.
 * `texte` est déjà formaté (formatCurrency, « 89 % ») : rien n'est recalculé.
 */
export function Compteur({ texte, delai = 0, style, className = '' }) {
  const t = String(texte ?? '');
  const caracteres = [...t];
  const nbChiffres = caracteres.filter((c) => CHIFFRE.test(c)).length;
  let rang = 0;
  return (
    <span className={`fsx-odo ${className}`} style={style}>
      <span className="fsx-sr">{t}</span>
      {caracteres.map((c, i) => {
        if (!CHIFFRE.test(c)) return <span key={i} className="fsx-odo-s" aria-hidden="true">{c}</span>;
        // Les chiffres de droite finissent un peu après ceux de gauche : le
        // montant se pose de gauche à droite, comme un compteur qui s'arrête.
        const d = Number(c);
        const retard = delai + (rang / Math.max(1, nbChiffres)) * 0.25;
        rang += 1;
        return (
          <span key={i} className="fsx-odo-c" aria-hidden="true">
            <span style={{ '--d': d, animationDelay: `${retard.toFixed(2)}s` }}>
              {'0123456789'.split('').map((k) => <i key={k}>{k}</i>)}
            </span>
          </span>
        );
      })}
    </span>
  );
}

/** Anneau de pourcentage (pct null = anneau vide, sans valeur inventée). */
export function Anneau({ pct, taille = 58, epaisseur = 7, couleur = '#2F9E90', fond = '#EDEAE4', delai = 0.3 }) {
  const r = (taille - epaisseur) / 2 - 1;
  const c = taille / 2;
  const v = pct == null || !Number.isFinite(Number(pct)) ? 0 : Math.max(0, Math.min(100, Number(pct)));
  return (
    <svg width={taille} height={taille} viewBox={`0 0 ${taille} ${taille}`} aria-hidden="true" style={{ flex: 'none', display: 'block' }}>
      <circle cx={c} cy={c} r={r} fill="none" stroke={fond} strokeWidth={epaisseur} />
      {v > 0 && (
        <circle className="fsx-ring" style={{ animationDelay: `${delai}s` }} cx={c} cy={c} r={r} fill="none" stroke={couleur}
          strokeWidth={epaisseur} strokeLinecap="round" pathLength="100" strokeDasharray={`${v} 100`} transform={`rotate(-90 ${c} ${c})`} />
      )}
    </svg>
  );
}

/**
 * Enveloppe d'une scène qui BOUCLE (écrans vides) : hors de l'écran, ses
 * animations sont mises en pause (data-pause) — un téléphone d'entrée de gamme
 * ne fait pas tourner six scènes qu'on ne voit pas.
 */
export function Boucle({ children, style, className = '', ...rest }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver((e) => setVisible(e.some((x) => x.isIntersecting)), { rootMargin: '80px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} data-pause={visible ? '0' : '1'} className={className} style={style} {...rest}>
      {children}
    </div>
  );
}
