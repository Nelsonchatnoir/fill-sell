// ── Badges d'abonnement — design « Badges Premium & Pro » (Claude Design,
// projet e47b36df, intégré le 2026-07-14).
//
// Deux paliers, une même silhouette de pill :
//   Premium → dégradé teal → teal-deep, étoile or, reflet qui balaie.
//   Pro     → fond vert profond/noir, couronne dorée, texte en dégradé or,
//             bordure + halo dorés. Se lit immédiatement comme le palier au-dessus.
//
// Le Pro est un composant À PART (fond sombre vs clair), pas une variante du
// Premium. Les ors et le vert profond sont les seules couleurs hors charte de
// l'app : c'est volontaire et cantonné à ce fichier.
//
// Statut : on ne réinvente rien. isPremium / isPro viennent d'App.jsx
// (profiles.is_premium|is_pro|is_founder|IAP pour premium, is_pro pour pro —
// cf. CLAUDE.md). PlanBadge se contente de choisir le bon palier.

const SHINE_CSS = `
@keyframes fs-badge-shine{
  0%{transform:translateX(-60px) skewX(-18deg)}
  45%{transform:translateX(360px) skewX(-18deg)}
  100%{transform:translateX(360px) skewX(-18deg)}
}
@media (prefers-reduced-motion:reduce){ .fs-badge-shine{animation:none !important;opacity:0} }
`;

// Deux tailles : 'sm' pour le header et les lignes de statut, 'md' pour les
// contextes de mise en avant (cartes de plan).
const SIZES = {
  sm: { padding:'7px 12px', gap:5, icon:13, text:12.5 },
  md: { padding:'14px 24px', gap:8, icon:20, text:19 },
};

export function PremiumBadge({ size = 'sm', onClick, style }) {
  const s = SIZES[size] || SIZES.sm;
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag
      onClick={onClick}
      style={{
        position:'relative', overflow:'hidden', display:'inline-flex', alignItems:'center', gap:s.gap,
        padding:s.padding, borderRadius:999, border:'none', flexShrink:0,
        background:'linear-gradient(135deg,#37AC9C 0%,#1B6E62 100%)',
        boxShadow: size === 'md'
          ? '0 10px 26px -8px rgba(27,110,98,0.6)'
          : '0 4px 12px -3px rgba(27,110,98,0.55)',
        fontFamily:"'Space Grotesk', sans-serif",
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
    >
      <style>{SHINE_CSS}</style>
      <span className="fs-badge-shine" style={{
        position:'absolute', top:0, bottom:0, left:0, width:36, pointerEvents:'none',
        background:'linear-gradient(90deg,transparent,rgba(255,255,255,0.55),transparent)',
        animation:'fs-badge-shine 3.6s linear infinite',
      }}/>
      <svg width={s.icon} height={s.icon} viewBox="0 0 24 24" style={{ position:'relative', flexShrink:0 }}>
        <defs>
          <linearGradient id="fs-gold-premium" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FCEBAE"/>
            <stop offset="1" stopColor="#E3AE43"/>
          </linearGradient>
        </defs>
        <path d="M12 2l2.9 6.1 6.6.9-4.8 4.6 1.2 6.6L12 17.8 6.1 20.9l1.2-6.6L2.5 9.9l6.6-.9z"
          fill="url(#fs-gold-premium)" stroke="rgba(255,255,255,0.5)" strokeWidth="0.5"/>
      </svg>
      <span style={{ position:'relative', fontSize:s.text, fontWeight:700, letterSpacing:'0.01em', color:'#fff', whiteSpace:'nowrap' }}>
        Premium
      </span>
    </Tag>
  );
}

export function ProBadge({ size = 'sm', onClick, style }) {
  const s = SIZES[size] || SIZES.sm;
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag
      onClick={onClick}
      style={{
        position:'relative', overflow:'hidden', display:'inline-flex', alignItems:'center', gap:s.gap,
        padding:s.padding, borderRadius:999, flexShrink:0,
        background:'linear-gradient(135deg,#1C4038 0%,#0D1F1A 100%)',
        border:'1px solid rgba(214,178,96,0.55)',
        boxShadow: size === 'md'
          ? '0 10px 28px -6px rgba(13,31,26,0.7), 0 0 22px -6px rgba(214,178,96,0.35), inset 0 1px 0 rgba(255,255,255,0.14)'
          : '0 4px 14px -3px rgba(13,31,26,0.65), 0 0 16px -6px rgba(214,178,96,0.4), inset 0 1px 0 rgba(255,255,255,0.12)',
        fontFamily:"'Space Grotesk', sans-serif",
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
    >
      <style>{SHINE_CSS}</style>
      <span className="fs-badge-shine" style={{
        position:'absolute', top:0, bottom:0, left:0, width:40, pointerEvents:'none',
        background:'linear-gradient(90deg,transparent,rgba(240,205,120,0.5),transparent)',
        animation:'fs-badge-shine 3.6s linear infinite 0.6s',
      }}/>
      <svg width={s.icon} height={s.icon} viewBox="0 0 24 24" style={{ position:'relative', flexShrink:0 }}>
        <defs>
          <linearGradient id="fs-gold-pro" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FBE9A6"/>
            <stop offset="0.5" stopColor="#E7B84C"/>
            <stop offset="1" stopColor="#C79433"/>
          </linearGradient>
        </defs>
        <path d="M3 8l4.5 3L12 4l4.5 7L21 8l-1.8 10.5H4.8L3 8z"
          fill="url(#fs-gold-pro)" stroke="rgba(255,255,255,0.35)" strokeWidth="0.4" strokeLinejoin="round"/>
        <circle cx="12" cy="4" r="1.1" fill="url(#fs-gold-pro)"/>
        <circle cx="3" cy="8" r="1.1" fill="url(#fs-gold-pro)"/>
        <circle cx="21" cy="8" r="1.1" fill="url(#fs-gold-pro)"/>
      </svg>
      <span style={{
        position:'relative', fontSize:s.text, fontWeight:700, letterSpacing:'0.02em', whiteSpace:'nowrap',
        background:'linear-gradient(135deg,#FBE9A6,#E7B84C)',
        WebkitBackgroundClip:'text', backgroundClip:'text', color:'transparent',
      }}>
        Pro
      </span>
    </Tag>
  );
}

// Choisit le palier à afficher. Rien si l'utilisateur n'est ni Pro ni Premium.
export default function PlanBadge({ isPremium, isPro, size = 'sm', onClick, style }) {
  if (isPro) return <ProBadge size={size} onClick={onClick} style={style} />;
  if (isPremium) return <PremiumBadge size={size} onClick={onClick} style={style} />;
  return null;
}
