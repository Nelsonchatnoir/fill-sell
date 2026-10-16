// Pièces communes des écrans pleins (Tableau, Ventes, Stats) — 16/10, maquette
// « fillsell-ecrans-pleins.html » validée par Nico. Couleurs et police : celles
// de l'app (UI), jamais celles de la maquette.
import PlatformLogo from '../../components/platform-logos/PlatformLogo';
import { UI } from '../../components/ui';
import { CODES_PLATEFORME_VENTE } from '../../utils/ventesStats';
import { ENCRE2, MENTHE } from './jetons';


/** Carte blanche (radius 24) ; `entree` = délai de l'apparition (s) ou null. */
export function Carte({ children, style, entree = null, className = '', ...rest }) {
  return (
    <div className={`${entree != null ? 'fsx-rise ' : ''}${className}`}
      style={{ background: '#FFFFFF', border: `1px solid ${UI.border}`, borderRadius: 24, ...(entree != null ? { animationDelay: `${entree}s` } : null), ...style }} {...rest}>
      {children}
    </div>
  );
}

export function Libelle({ children, style }) {
  return <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.11em', color: '#6F7774', textTransform: 'uppercase', ...style }}>{children}</span>;
}

export function BoiteIcone({ children, fond = MENTHE, taille = 32, rayon = 10 }) {
  return <span style={{ width: taille, height: taille, borderRadius: rayon, background: fond, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>{children}</span>;
}

/** Sélecteur de période (pilules à parts égales, jamais repliées). */
export function Segments({ options, valeur, onChange, libelle = (o) => o, ariaLabel }) {
  return (
    <div role="tablist" aria-label={ariaLabel} style={{ display: 'flex', padding: 4, borderRadius: 18, background: '#ECE9E2', gap: 2 }}>
      {options.map((o) => {
        const on = o === valeur;
        return (
          <button key={o} type="button" role="tab" aria-selected={on} onClick={() => onChange(o)}
            style={{ flex: 1, minWidth: 0, height: 34, border: 0, borderRadius: 14, background: on ? '#FFFFFF' : 'transparent', boxShadow: on ? '0 2px 6px rgba(16,32,27,.08)' : 'none', fontFamily: 'inherit', fontSize: 13.5, fontWeight: on ? 700 : 600, color: on ? UI.ink : ENCRE2, cursor: 'pointer' }}>
            {libelle(o)}
          </button>
        );
      })}
    </div>
  );
}

/** Logo + nom d'une plateforme de vente ({ code, libelle } de plateformeVente). */
export function NomPlateforme({ p, taille = 14, style }) {
  if (!p) return null;
  const logo = CODES_PLATEFORME_VENTE.includes(p.code);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0, ...style }}>
      {logo && <PlatformLogo platform={p.code} size={taille} />}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.libelle}</span>
    </span>
  );
}

