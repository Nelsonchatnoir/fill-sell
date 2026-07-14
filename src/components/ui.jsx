// ── Design system partagé — palette "2026" (Lens / ListingPreviewScreen) ──
// Source de vérité visuelle : LensTab.jsx (LensScanHome) + ListingPreviewScreen.jsx (objet T).
// Toute nouvelle surface (Dashboard, Stats, Login, loaders) doit consommer ces
// primitives plutôt que redéfinir ses propres couleurs/radius/ombres.

export const UI = {
  canvas:   '#EDEAE0',
  paper:    '#F6F5F1',
  ink:      '#10201B',
  teal:     '#2F9E90',
  tealDeep: '#1B6E62',
  amber:    '#E8956D',
  mute:     '#8A8578',
  mute2:    '#6B7A75',
  border:   '#E7E3D8',
  card:     '#FFFFFF',
  chip:     '#F2F0E9',
  negative: '#B0645A',
};

export function Eyebrow({ children, style }) {
  return (
    <p style={{ margin:'0 0 6px', fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.14em', color:UI.mute, ...style }}>
      {children}
    </p>
  );
}

export function Card({ children, style, ...rest }) {
  return (
    <div
      style={{ background:UI.card, borderRadius:16, border:`1px solid ${UI.border}`, boxShadow:'0 1px 4px rgba(16,32,27,0.05)', ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}

export function PrimaryButton({ children, disabled, onClick, icon:Icon, style, type='button' }) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      style={{
        width:'100%', boxSizing:'border-box', borderRadius:999, padding:'16px 0',
        display:'flex', alignItems:'center', justifyContent:'center', gap:8,
        fontSize:15, fontWeight:600, border:'none', fontFamily:'inherit',
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: disabled ? '#DCEEEA' : `linear-gradient(120deg,${UI.teal},${UI.tealDeep})`,
        color: disabled ? '#8FB5AE' : '#FFFFFF',
        boxShadow: disabled ? 'none' : '0 10px 24px rgba(47,158,144,0.28)',
        transition:'background 0.2s, box-shadow 0.2s',
        ...style,
      }}
    >
      {Icon && <Icon size={16} strokeWidth={2.2} />}
      {children}
    </button>
  );
}

export function SecondaryButton({ children, disabled, onClick, icon:Icon, style, type='button' }) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      style={{
        width:'100%', boxSizing:'border-box', borderRadius:999, padding:'14px 0',
        display:'flex', alignItems:'center', justifyContent:'center', gap:8,
        fontSize:14, fontWeight:600, fontFamily:'inherit',
        border:`1px solid ${disabled ? UI.border : UI.teal}`, background:'none',
        color: disabled ? UI.mute : UI.teal,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition:'background 0.15s, color 0.15s',
        ...style,
      }}
    >
      {Icon && <Icon size={15} strokeWidth={2.2} />}
      {children}
    </button>
  );
}

// Signature "upgrade" (Premium/Pro) — dégradé teal→amber animé, volontairement
// distinct du PrimaryButton neutre pour rester repérable comme un CTA d'upsell.
export function PremiumButton({ children, disabled, onClick, icon:Icon, style, type='button' }) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      style={{
        width:'100%', boxSizing:'border-box', borderRadius:999, padding:'15px 0',
        display:'flex', alignItems:'center', justifyContent:'center', gap:8,
        fontSize:15, fontWeight:600, border:'none', fontFamily:'inherit',
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: disabled ? '#DCEEEA' : `linear-gradient(110deg, ${UI.teal} 0%, ${UI.amber} 50%, ${UI.teal} 100%)`,
        backgroundSize:'200% 100%',
        color: disabled ? '#8FB5AE' : '#FFFFFF',
        boxShadow: disabled ? 'none' : '0 10px 24px -8px rgba(232,149,109,0.45)',
        animation: disabled ? 'none' : 'ui-premium-shimmer 5s ease-in-out infinite',
        ...style,
      }}
    >
      <style>{`@keyframes ui-premium-shimmer{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}`}</style>
      {Icon && <Icon size={16} strokeWidth={2.2} />}
      {children}
    </button>
  );
}

export function IconButton({ onClick, icon:Icon, disabled, size=36, bg=UI.chip, iconColor=UI.ink, style, ...rest }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width:size, height:size, borderRadius:'50%', background:bg, border:'none',
        display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
        ...style,
      }}
      {...rest}
    >
      <Icon size={Math.round(size*0.5)} color={iconColor} strokeWidth={1.8} />
    </button>
  );
}

// Spinner de marque — double anneau teal (remplace tout spinner générique gris/blanc).
export function Loader({ size=36, thickness=3, icon:Icon=null, iconSize=14, style }) {
  return (
    <div style={{ position:'relative', width:size, height:size, display:'flex', alignItems:'center', justifyContent:'center', ...style }}>
      <style>{`@keyframes ui-spin{to{transform:rotate(360deg)}}`}</style>
      <span style={{ position:'absolute', inset:0, borderRadius:'50%', border:`${thickness}px solid ${UI.teal}2E` }} />
      <span style={{ position:'absolute', inset:0, borderRadius:'50%', border:`${thickness}px solid transparent`, borderTopColor:UI.teal, animation:'ui-spin 0.85s linear infinite' }} />
      {Icon && <Icon size={iconSize} color={UI.teal} />}
    </div>
  );
}

// Pleine-page — écran de chargement de marque (remplace les texte-seul "Chargement...").
export function LoaderScreen({ label, background=UI.canvas }) {
  return (
    <div style={{ position:'fixed', inset:0, zIndex:9000, background, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16 }}>
      <Loader size={40} thickness={3} />
      {label && <div style={{ fontSize:13.5, fontWeight:500, color:UI.mute2 }}>{label}</div>}
    </div>
  );
}

// Sélecteur segmenté (périodes, filtres courts) — pilules teintées, active = encre pleine.
export function SegmentedPills({ options, value, onChange, labelFn }) {
  return (
    <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
      {options.map(opt => {
        const active = opt === value;
        return (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            style={{
              padding:'6px 14px', borderRadius:999, border:'none', fontSize:12, fontWeight:600,
              fontFamily:'inherit', cursor:'pointer', transition:'background 0.15s, color 0.15s',
              background: active ? UI.ink : UI.chip,
              color: active ? '#FFFFFF' : UI.mute2,
            }}
          >
            {labelFn ? labelFn(opt) : opt}
          </button>
        );
      })}
    </div>
  );
}

// Toggle on/off — piste pilule, teal quand actif (généralisé depuis StockToggle).
export function Toggle({ checked, onChange, size=44 }) {
  const h = Math.round(size*0.59);
  const knob = h - 6;
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        flexShrink:0, width:size, height:h, borderRadius:999, border:'none', padding:3,
        background: checked ? UI.teal : '#D8D2C4',
        cursor:'pointer', position:'relative', transition:'background 0.2s',
      }}
    >
      <span style={{
        display:'block', width:knob, height:knob, borderRadius:'50%', background:'#FFFFFF',
        transform: checked ? `translateX(${size - knob - 6}px)` : 'translateX(0)',
        transition:'transform 0.2s', boxShadow:'0 1px 3px rgba(0,0,0,0.25)',
      }} />
    </button>
  );
}

// Tuile colorée + icône (emoji) — même vocabulaire que .cat-tile de StockTab/VentesTab,
// pour les cartes stat (KPI) qui ne sont pas liées à une catégorie d'article.
export function IconTile({ icon, color, size=38 }) {
  return (
    <div style={{
      width:size, height:size, borderRadius:Math.round(size*0.29), background:color,
      display:'flex', alignItems:'center', justifyContent:'center', fontSize:Math.round(size*0.45),
      flexShrink:0,
    }}>
      {icon}
    </div>
  );
}

// Tuile KPI — gabarit du design « Dashboard » (Claude Design, 2026-07-14) :
// fond paper, tuile d'icône 36 px, libellé en eyebrow serré, valeur 24 px.
// `icon` accepte un emoji ou un nœud SVG (le Dashboard passe des SVG).
export function StatTile({ icon, tileColor, label, value, sub, subColor }) {
  return (
    <div style={{
      background:UI.paper, borderRadius:20, padding:'15px 15px 14px', border:`1px solid ${UI.border}`,
      boxShadow:'0 1px 3px rgba(16,32,27,0.04)',
    }}>
      <IconTile icon={icon} color={tileColor} size={36} />
      <div style={{ marginTop:12 }}>
        <div style={{ fontSize:9.5, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:UI.mute, marginBottom:3 }}>{label}</div>
        <div style={{ fontSize:24, fontWeight:700, color:UI.ink, letterSpacing:'-0.03em', lineHeight:1 }}>{value}</div>
        {sub && <div style={{ fontSize:11.5, fontWeight:500, color: subColor || UI.mute, marginTop:5 }}>{sub}</div>}
      </div>
    </div>
  );
}
