// ── Kit de composants du drawer vocal (design validé le 2026-07-14) ──────────
// UNE carte de base + six corps, partagés par le drawer d'App.jsx ET la zone
// vocale inline de StockTab (avant : deux rendus concurrents pour les mêmes
// intentions). Aucun token nouveau : tout vient du design system existant
// (cf. src/components/ui.jsx). Poids 700 max, Space Grotesk uniquement.
//
// Règle du système : le STATUT d'une carte se lit dans son point + eyebrow,
// jamais dans un fond coloré. Toutes les cartes sont blanches sur le paper du
// sheet. Quatre tons, pas un de plus :
//   done    → l'écriture en base a eu lieu            (teal-deep)
//   confirm → l'action attend un geste utilisateur    (amber)
//   danger  → destructif ou erreur bloquante          (negative)
//   info    → réponse de l'IA, aucune conséquence     (mute)

import { V } from './tokens';

const TONES = {
  done:    { fg: V.tealDeep, dot: V.teal },
  confirm: { fg: V.amberInk, dot: V.amber },
  danger:  { fg: V.negative, dot: V.negative },
  info:    { fg: V.mute,     dot: V.mute },
};

// ── Sheet : poignée + phrase entendue + fermer. Variante inline pour StockTab.
export function VoiceSheet({ transcript, onClose, lang = 'fr', children, sheetRef, swipeHandlers = {}, inline = false }) {
  const fr = lang !== 'en';
  const body = (
    <>
      {!inline && <div style={{ width:36, height:4, borderRadius:99, background:V.border, margin:'0 auto 12px' }} />}
      {(transcript || onClose) && (
        <div style={{ display:'flex', alignItems:'flex-start', gap:10, marginBottom:12 }}>
          <div style={{ flex:1, minWidth:0 }}>
            {transcript && (
              <>
                <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:10, fontWeight:700, letterSpacing:'0.12em', textTransform:'uppercase', color:V.mute }}>
                  <MicGlyph size={12} stroke="currentColor" />
                  {fr ? "J'ai entendu" : 'I heard'}
                </div>
                <div style={{ fontSize:13.5, fontWeight:500, fontStyle:'italic', color:V.mute2, lineHeight:1.4, marginTop:3,
                  display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>
                  «&nbsp;{transcript}&nbsp;»
                </div>
              </>
            )}
          </div>
          {onClose && (
            <button onClick={onClose} aria-label={fr ? 'Fermer' : 'Close'} className="vk-tap"
              style={{ flexShrink:0, width:30, height:30, borderRadius:99, background:V.chip, border:`1px solid ${V.border}`,
                display:'flex', alignItems:'center', justifyContent:'center', color:V.mute2, cursor:'pointer', padding:0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          )}
        </div>
      )}
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>{children}</div>
    </>
  );

  if (inline) return <>{body}</>;

  return (
    <div
      ref={sheetRef}
      {...swipeHandlers}
      style={{
        position:'fixed', bottom:0, left:0, right:0, zIndex:1001,
        maxHeight:'min(78vh,760px)', overflowY:'auto',
        background:V.paper, borderTop:`1px solid ${V.border}`,
        borderRadius:'26px 26px 0 0',
        padding:'12px 14px calc(env(safe-area-inset-bottom,0px) + 18px)',
        boxShadow:'0 -8px 40px rgba(16,32,27,0.12)',
        animation:'vk-slidein 0.3s cubic-bezier(0.22,1,0.36,1)',
        fontFamily:"'Space Grotesk', sans-serif", color:V.ink,
      }}
    >
      {body}
    </div>
  );
}

function MicGlyph({ size = 30, stroke = '#fff' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0 }}>
      <rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/>
    </svg>
  );
}

// ── État « je réfléchis » : le micro reste le héros pendant le temps mort.
export function VoiceThinking({ lang = 'fr', compact = false }) {
  const fr = lang !== 'en';
  const size = compact ? 64 : 72;
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center', gap:14, padding: compact ? '10px 0 2px' : '18px 8px 10px' }}>
      <div style={{ position:'relative', width:size, height:size, flexShrink:0 }}>
        <span className="vk-ring" style={{ position:'absolute', inset:0, borderRadius:22, background:'rgba(47,158,144,0.26)', animation:'vk-pulse 2.6s ease-out infinite' }} />
        <span className="vk-ring" style={{ position:'absolute', inset:0, borderRadius:22, background:'rgba(47,158,144,0.26)', animation:'vk-pulse 2.6s ease-out infinite', animationDelay:'1.3s' }} />
        <div style={{ position:'relative', width:size, height:size, borderRadius:22,
          background:`linear-gradient(150deg,${V.teal},${V.tealDeep})`, display:'flex', alignItems:'center', justifyContent:'center',
          boxShadow:'0 10px 24px rgba(27,110,98,0.35)' }}>
          <MicGlyph size={compact ? 26 : 30} />
        </div>
      </div>
      <div className="vk-wave" style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:4, height:26 }}>
        {[8,18,26,14,22,9,16].map((h,i)=>(
          <i key={i} style={{ display:'block', width:3, height:h, borderRadius:99, background:V.teal,
            animation:'vk-wave 1s ease-in-out infinite', animationDelay:`${i*0.12}s` }} />
        ))}
      </div>
      <div>
        <div style={{ fontSize:19, fontWeight:700, letterSpacing:'-0.02em', color:V.ink }}>
          {fr ? 'Je réfléchis…' : 'Thinking…'}
        </div>
        <div style={{ fontSize:13, color:V.mute, maxWidth:'26ch', margin:'2px auto 0' }}>
          {fr ? "Je transcris ta phrase, puis je cherche l'article dans ton stock." : 'Transcribing, then looking for the item in your stock.'}
        </div>
      </div>
      <div className="vk-skel" style={{ width:'100%', display:'flex', flexDirection:'column', gap:8, marginTop:4 }}>
        {['100%','72%','86%'].map((w,i)=>(
          <i key={i} style={{ display:'block', width:w, height:11, borderRadius:99,
            background:`linear-gradient(90deg,${V.chip},${V.border},${V.chip})`, backgroundSize:'200% 100%',
            animation:'vk-shimmer 1.4s linear infinite' }} />
        ))}
      </div>
    </div>
  );
}

// ── Carte de base : les 18 cartes en dérivent.
export function VoiceCard({ tone = 'info', eyebrow, title, sub, children, style }) {
  const t = TONES[tone] || TONES.info;
  return (
    <div className="vk-card" style={{
      background:V.card, border:`1px solid ${V.border}`, borderRadius:20, padding:'14px 15px',
      boxShadow:'0 1px 3px rgba(16,32,27,0.04)', display:'flex', flexDirection:'column', gap:10, ...style,
    }}>
      {eyebrow && (
        <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:10.5, fontWeight:700,
          letterSpacing:'0.1em', textTransform:'uppercase', color:t.fg }}>
          <span style={{ width:6, height:6, borderRadius:99, background:t.dot, flexShrink:0 }} />
          <span style={{ minWidth:0 }}>{eyebrow}</span>
        </div>
      )}
      {title && <div style={{ fontSize:16, fontWeight:700, letterSpacing:'-0.015em', color:V.ink, lineHeight:1.25 }}>{title}</div>}
      {sub && <div style={{ fontSize:12.5, color:V.mute, lineHeight:1.45 }}>{sub}</div>}
      {children}
    </div>
  );
}

// ── Pastilles d'entité — un seul jeu de styles (fini les violets/verts Tailwind).
export function Pill({ kind = 'cat', children, style }) {
  const K = {
    brand: { background:V.tealSoft, color:V.tealDeep, fontWeight:600 },
    cat:   { background:V.chip,     color:V.mute2,    fontWeight:600 },
    plat:  { background:V.chip,     color:V.mute2,    fontWeight:600 },
    qty:   { background:V.tealDeep, color:'#fff',     fontWeight:700 },
    warn:  { background:V.amberSoft,color:V.amberInk, fontWeight:700 },
  }[kind] || {};
  return (
    <span style={{ fontSize:11, borderRadius:99, padding:'3px 9px', whiteSpace:'nowrap',
      display:'inline-flex', alignItems:'center', gap:4, ...K, ...style }}>
      {children}
    </span>
  );
}

export function EntityPills({ brand, cat, catEmoji, place, location, platform, qty, extra, children }) {
  const any = brand || cat || place || location || platform || (qty > 1) || extra || children;
  if (!any) return null;
  return (
    <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
      {qty > 1 && <Pill kind="qty">×{qty}</Pill>}
      {brand && <Pill kind="brand">{brand}</Pill>}
      {cat && <Pill kind="cat">{catEmoji ? `${catEmoji} ` : ''}{cat}</Pill>}
      {location && <Pill kind="cat">📦 {location}</Pill>}
      {place && <Pill kind="cat">📍 {place}</Pill>}
      {platform && <Pill kind="plat">🏪 {platform}</Pill>}
      {extra}
      {children}
    </div>
  );
}

// ── Champs éditables (nom, prix…), répétables.
export function TextField({ value, onChange, placeholder, autoFocus, style }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, background:V.paper, border:`1px solid ${V.border}`,
      borderRadius:12, padding:'9px 12px', ...style }}>
      <input className="vk-input" value={value} onChange={onChange} placeholder={placeholder} autoFocus={autoFocus} />
    </div>
  );
}

export function PriceField({ value, onChange, placeholder, suffix = '€', autoFocus, style }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, background:V.paper, border:`1px solid ${V.border}`,
      borderRadius:12, padding:'9px 12px', ...style }}>
      <input className="vk-input" type="number" inputMode="decimal" value={value} onChange={onChange}
        placeholder={placeholder} autoFocus={autoFocus} />
      <span style={{ fontSize:14, fontWeight:600, color:V.mute, flexShrink:0 }}>{suffix}</span>
    </div>
  );
}

export function SelectField({ value, onChange, children, style }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, background:V.paper, border:`1px solid ${V.border}`,
      borderRadius:12, padding:'9px 12px', ...style }}>
      <select className="vk-select" value={value} onChange={onChange}>{children}</select>
    </div>
  );
}

// ── Deux chiffres opposés (achat/vente, avant/après, profit/marge).
export function StatDuo({ left, right, style }) {
  const val = (s) => (
    <>
      <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:V.mute, marginBottom:3 }}>{s.label}</div>
      <div style={{ fontSize:21, fontWeight:700, letterSpacing:'-0.02em', fontVariantNumeric:'tabular-nums',
        color: s.tone === 'pos' ? V.tealDeep : s.tone === 'neg' ? V.negative : s.tone === 'mute' ? V.mute : V.ink }}>
        {s.value}
      </div>
      {s.hint && <div style={{ fontSize:11.5, fontWeight:600, color: s.tone === 'neg' ? V.negative : V.tealDeep, opacity:0.75, fontVariantNumeric:'tabular-nums' }}>{s.hint}</div>}
    </>
  );
  return (
    <div style={{ display:'flex', alignItems:'stretch', gap:14, background:V.paper, border:`1px solid ${V.border}`,
      borderRadius:14, padding:'12px 14px', ...style }}>
      <div style={{ flex:1, minWidth:0 }}>{val(left)}</div>
      {right && <><div style={{ width:1, background:V.border, flexShrink:0 }} /><div style={{ flex:1, minWidth:0, textAlign:'right' }}>{val(right)}</div></>}
    </div>
  );
}

// ── Un chiffre seul, en gros (profit du mois, marge moyenne…).
export function StatBig({ label, value, tone = 'pos', hint, comment }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
      <div style={{ fontSize:10.5, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:V.mute }}>{label}</div>
      <div style={{ fontSize:32, fontWeight:700, letterSpacing:'-0.03em', fontVariantNumeric:'tabular-nums',
        color: tone === 'neg' ? V.negative : tone === 'amber' ? V.amberInk : V.tealDeep }}>{value}</div>
      {hint && <div style={{ fontSize:11.5, color:V.mute, fontWeight:500 }}>{hint}</div>}
      {comment && <div style={{ fontSize:14, fontWeight:700, color:V.ink, marginTop:6 }}>{comment}</div>}
    </div>
  );
}

// ── Lignes de liste : tuile + titre + méta + valeur.
export function ListRows({ children, style }) {
  return <div style={{ display:'flex', flexDirection:'column', ...style }}>{children}</div>;
}

export function ListRow({ icon, title, meta, pills, value, valueTone, valueHint, right, onClick, first, dim, selected, selectable, description }) {
  const clickable = typeof onClick === 'function';
  return (
    <div
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      className={clickable ? 'vk-tap' : undefined}
      style={{
        display:'flex', alignItems:'center', gap:10, padding:'10px 0',
        borderTop: first ? 'none' : `1px solid ${V.border}`,
        opacity: dim ? 0.5 : 1, cursor: clickable ? 'pointer' : 'default', textAlign:'left',
      }}
    >
      {selectable && (
        <div style={{ width:20, height:20, borderRadius:6, flexShrink:0,
          border:`2px solid ${selected ? V.tealDeep : V.border}`, background: selected ? V.tealDeep : '#fff',
          display:'flex', alignItems:'center', justifyContent:'center' }}>
          {selected && <svg width="11" height="9" viewBox="0 0 11 9" fill="none"><path d="M1 4.5L4 7.5L10 1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        </div>
      )}
      {icon != null && (
        <div style={{ width:32, height:32, borderRadius:10, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center',
          background:V.tealSoft, color:V.tealDeep, fontSize:14 }}>{icon}</div>
      )}
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:13.5, fontWeight:600, color:V.ink, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{title}</div>
        {pills}
        {description && <div style={{ fontSize:11.5, color:V.mute, fontStyle:'italic', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{description}</div>}
        {meta && <div style={{ fontSize:11.5, color:V.mute, marginTop:1 }}>{meta}</div>}
      </div>
      {value != null && (
        <div style={{ flexShrink:0, textAlign:'right' }}>
          <div style={{ fontSize:14, fontWeight:700, fontVariantNumeric:'tabular-nums',
            color: valueTone === 'pos' ? V.tealDeep : valueTone === 'neg' ? V.negative : valueTone === 'amber' ? V.amberInk : V.ink }}>{value}</div>
          {valueHint && <div style={{ fontSize:10.5, color:V.mute, fontWeight:600 }}>{valueHint}</div>}
        </div>
      )}
      {right}
    </div>
  );
}

// ── Prose de l'IA (markdown-lite : ## titres, • puces, **gras**).
export function ProseBlock({ text }) {
  const raw = String(text || '');
  const renderInline = (line, key) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((p, i) =>
      p.startsWith('**') && p.endsWith('**')
        ? <strong key={`${key}-${i}`} style={{ color:V.ink, fontWeight:700 }}>{p.slice(2, -2)}</strong>
        : <span key={`${key}-${i}`}>{p}</span>
    );
  };
  const lines = raw.split('\n');
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:4, fontSize:13.5, lineHeight:1.65, color:V.mute2, fontWeight:500 }}>
      {lines.map((line, li) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={li} style={{ height:6 }} />;
        if (trimmed.startsWith('##')) {
          return (
            <div key={li} style={{ fontSize:10.5, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase',
              color:V.tealDeep, marginTop: li === 0 ? 0 : 8, marginBottom:2 }}>
              {trimmed.replace(/^##\s*/, '')}
            </div>
          );
        }
        if (trimmed.startsWith('•') || trimmed.startsWith('-')) {
          return (
            <div key={li} style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
              <span style={{ color:V.teal, fontWeight:700, flexShrink:0 }}>·</span>
              <span>{renderInline(trimmed.replace(/^[•-]\s*/, ''), li)}</span>
            </div>
          );
        }
        return <div key={li}>{renderInline(trimmed, li)}</div>;
      })}
    </div>
  );
}

// ── Note sur 10 + jauge (deal_score).
export function ScoreGauge({ score, label, lang = 'fr' }) {
  const s = Number(score) || 0;
  const tone = s >= 6.5 ? V.tealDeep : s >= 5 ? V.amberInk : V.negative;
  const fill = Math.max(0, Math.min(100, s * 10));
  return (
    <div style={{ display:'flex', alignItems:'center', gap:14 }}>
      <div style={{ fontSize:40, fontWeight:700, letterSpacing:'-0.04em', lineHeight:1, color:tone, fontVariantNumeric:'tabular-nums' }}>{s}</div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:15, fontWeight:700, color:V.ink, letterSpacing:'-0.01em' }}>{label}</div>
        <div style={{ height:6, borderRadius:99, background:V.chip, overflow:'hidden', marginTop:8 }}>
          <span style={{ display:'block', height:'100%', width:`${fill}%`, borderRadius:99,
            background:`linear-gradient(90deg,${V.teal},${V.tealDeep})` }} />
        </div>
        <div style={{ fontSize:10.5, color:V.mute, fontWeight:600, marginTop:4 }}>{lang === 'en' ? 'out of 10' : 'sur 10'}</div>
      </div>
    </div>
  );
}

// ── Boutons : le libellé dit l'action, jamais « OK ».
export function Btn({ kind = 'ghost', onClick, children, style, disabled, align }) {
  const K = {
    primary: { flex:1, background:`linear-gradient(135deg,${V.teal},${V.tealDeep})`, color:'#fff', border:'none',
               boxShadow:'0 6px 16px rgba(27,110,98,0.28)', fontWeight:700 },
    danger:  { flex:1, background:V.negative, color:'#fff', border:'none',
               boxShadow:'0 6px 16px rgba(176,100,90,0.24)', fontWeight:700 },
    ghost:   { background:'transparent', border:`1px solid ${V.border}`, color:V.mute2, fontWeight:600 },
    soft:    { flex:1, background:V.paper, border:`1px solid ${V.border}`, color:V.ink, fontWeight:700 },
  }[kind] || {};
  return (
    <button onClick={onClick} disabled={disabled} className="vk-tap"
      style={{ borderRadius:14, padding:'13px 16px', fontFamily:'inherit', fontSize:14.5, cursor: disabled ? 'not-allowed' : 'pointer',
        display:'inline-flex', alignItems:'center', justifyContent: align === 'left' ? 'flex-start' : 'center', gap:7,
        opacity: disabled ? 0.5 : 1, ...K, ...style }}>
      {children}
    </button>
  );
}

export function LinkBtn({ onClick, children, style }) {
  return (
    <button onClick={onClick} style={{ background:'none', border:'none', color:V.mute, fontSize:12.5, fontWeight:600,
      padding:6, cursor:'pointer', fontFamily:'inherit', ...style }}>{children}</button>
  );
}

export function ConfirmBar({ children, style }) {
  return <div style={{ display:'flex', gap:8, marginTop:2, ...style }}>{children}</div>;
}

// ── Note discrète : file d'attente, hors sujet, pas compris.
export function QuietNote({ children, dim, style }) {
  return (
    <div className="vk-card" style={{ background:V.chip, border:`1px solid ${V.border}`, borderRadius:16, padding:'12px 14px',
      fontSize:13, fontWeight:500, color:V.mute2, lineHeight:1.5, display:'flex', alignItems:'center', gap:9,
      opacity: dim ? 0.55 : 1, ...style }}>
      {children}
    </div>
  );
}

// ── Bulles flottantes : toast, erreur, quota (au-dessus du FAB).
export function FloatingBubble({ tone = 'ink', visible = true, bottom = 130, children }) {
  const T = {
    ink:      { background:V.ink, color:'#fff', shadow:'0 10px 28px rgba(16,32,27,0.28)' },
    danger:   { background:V.negative, color:'#fff', shadow:'0 10px 28px rgba(176,100,90,0.3)' },
    amber:    { background:V.amberSoft, color:V.amberInk, shadow:'none', border:`1px solid rgba(232,149,109,0.35)` },
    negative: { background:'rgba(176,100,90,0.12)', color:V.negative, shadow:'none', border:`1px solid rgba(176,100,90,0.3)` },
  }[tone] || {};
  return (
    <div style={{
      position:'fixed', left:'50%', transform:'translateX(-50%)',
      bottom:`calc(env(safe-area-inset-bottom,0px) + ${bottom}px)`,
      zIndex:999, borderRadius:99, padding:'10px 18px',
      fontFamily:"'Space Grotesk', sans-serif", fontSize:13, fontWeight:600, whiteSpace:'nowrap',
      display:'flex', alignItems:'center', gap:7, pointerEvents:'none',
      opacity: visible ? 1 : 0, transition:'opacity 0.3s ease',
      background:T.background, color:T.color, boxShadow:T.shadow, border:T.border,
      animation:'vk-fadein 0.2s ease',
    }}>
      {children}
    </div>
  );
}
