// ═══════════════════════════════════════════════════════════════════════════
// PARCOURS D'ENTRÉE — LES PRIMITIVES (2026-09-20)
// ═══════════════════════════════════════════════════════════════════════════
// La trame, et rien d'autre : une scène (kicker / titre / texte / contenu /
// pied collé en bas), des cartes blanches, un CTA pleine largeur, un lien
// discret. Aucune couleur écrite ici : tout vient de `E` (theme.js).
//
// ⛔ NON NÉGOCIABLE, parce que ça s'est déjà payé ailleurs dans ce dépôt :
//   · safe-area en HAUT et en BAS ;
//   · 44 px de zone tactile minimum sur tout ce qui se touche ;
//   · le corps DÉFILE, il ne comprime pas (flex-shrink:0 sur ses enfants) ;
//   · le texte secondaire est `E.texteSecondaire`, jamais UI.mute.
import { E, DEGRADE, OMBRE_CTA, TACTILE } from './theme';

export function Kicker({ children }) {
  return (
    <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: E.texteSecondaire }}>
      {children}
    </p>
  );
}

export function Titre({ children, centre = false }) {
  return (
    <h1 style={{ margin: '0 0 8px', fontSize: 26, lineHeight: 1.15, fontWeight: 700, letterSpacing: '-0.03em', color: E.ink, textAlign: centre ? 'center' : 'left' }}>
      {children}
    </h1>
  );
}

export function Texte({ children, centre = false, style }) {
  return (
    <p style={{ margin: '0 0 16px', fontSize: 14, lineHeight: 1.55, color: E.texteSecondaire, textAlign: centre ? 'center' : 'left', ...style }}>
      {children}
    </p>
  );
}

// Une scène = un écran. Le contenu pousse, le pied reste en bas.
export function Scene({ cle, children, pied }) {
  return (
    <div key={cle} className="en-scene" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>{children}</div>
      <div style={{ flex: 1, minHeight: 16 }} />
      {pied}
    </div>
  );
}

export function Carte({ children, style }) {
  return (
    <div style={{ background: E.card, border: `1px solid ${E.border}`, borderRadius: 20, overflow: 'hidden', ...style }}>
      {children}
    </div>
  );
}

export function BoutonPrimaire({ children, onClick, disabled = false, style }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="en-cta en-focus"
      style={{
        width: '100%', boxSizing: 'border-box', minHeight: 52, borderRadius: 999, border: 'none',
        fontFamily: 'inherit', fontSize: 15, fontWeight: 600, color: disabled ? '#8FB5AE' : '#FFFFFF',
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: disabled ? '#DCEEEA' : DEGRADE,
        boxShadow: disabled ? 'none' : OMBRE_CTA,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export function LienDiscret({ children, onClick, style }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="en-focus"
      style={{
        display: 'block', width: '100%', minHeight: TACTILE, border: 'none', background: 'none',
        fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: E.texteSecondaire, cursor: 'pointer',
        ...style,
      }}
    >
      {children}
    </button>
  );
}

// Bande d'information (le contrat de lecture, la note d'échec douce).
export function Bande({ children, ton = 'menthe' }) {
  const fonds = { menthe: { fond: E.menthe, bord: E.mentheBord, encre: E.ink }, alerte: { fond: '#FEF3C7', bord: '#FDE68A', encre: '#7A4A0B' } };
  const t = fonds[ton] ?? fonds.menthe;
  return (
    <div style={{ display: 'flex', gap: 11, padding: '14px 16px', borderRadius: 16, background: t.fond, border: `1px solid ${t.bord}` }}>
      <span style={{ fontSize: 13, lineHeight: 1.5, color: t.encre }}>{children}</span>
    </div>
  );
}

// Pastille d'état — même vocabulaire que Réglages : point + mot, jamais un
// mot seul, jamais une couleur seule.
export function Etat({ ok, children }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 4, flexShrink: 0, background: ok ? E.teal : E.mute }} />
      <span style={{ fontSize: 13, fontWeight: 600, color: ok ? E.tealDeep : E.texteSecondaire }}>{children}</span>
    </span>
  );
}

// La progression : un jalon par étape restante, sans chiffre — le parcours
// est court, le compter le rendrait long.
export function Progression({ total, index }) {
  return (
    <div style={{ flex: 1, display: 'flex', gap: 5 }}>
      {Array.from({ length: Math.max(1, total) }, (_, k) => (
        <div key={k} style={{ flex: 1, height: 4, borderRadius: 2, background: E.piste, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 2, background: DEGRADE, transformOrigin: 'left',
            transform: `scaleX(${k < index ? 1 : k === index ? 0.55 : 0})`,
            transition: 'transform .45s cubic-bezier(.22,.61,.36,1)',
          }} />
        </div>
      ))}
    </div>
  );
}
