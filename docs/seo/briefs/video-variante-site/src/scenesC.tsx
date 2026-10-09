import React from 'react';
import {Img, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {C, Captions, Check, FONT, H, Logo, PLAT, PlatLogo, Pill, Scene, Sparks, StepBar, Wordmark, ease, prog, spr} from './ui';
import {MOIS, SYNCHRO, milliers, NOMS} from './data';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

// Découpe d'un VRAI écran de l'app (captures « Camille » du site, harnais scripts/apercu :
// vrais composants, données de démonstration), posée sur le fond sombre.
const Ecran: React.FC<{src: string; w: number; ratio: number; style?: React.CSSProperties}> = ({src, w, ratio, style}) => (
  <div style={{width: w, height: Math.round(w * ratio), borderRadius: 34, overflow: 'hidden', background: '#FAFBFB', boxShadow: '0 40px 90px rgba(0,0,0,0.5), 0 0 60px rgba(78,205,196,0.18)', ...style}}>
    <Img src={staticFile(src)} style={{width: w, display: 'block'}} />
  </div>
);
// Dimensions des découpes (preparer.mjs) : 1110 de large.
const R_TUILES = 430 / 1110;
const R_PF = 875 / 1110;
const R_BEST = 1010 / 1110;

// =====================================================================
// SCÈNE 7 — LE MOIS DE CAMILLE (270 images, 9 s)
// Chiffres lus sur les captures du site (captures.json, chiffres_du_compte) : 1 268 € de profit
// ce mois, 62 ventes ; ventes par plateforme (Vinted 31, eBay 6, Depop 8, Leboncoin 10, Beebs 7 ;
// « Meilleure marge : Depop ») ; meilleurs vendeurs restés 2, 1 et 3 jours en stock.
// ⛔ Compte de démonstration, chiffres fictifs — dit à l'écran pendant toute la scène.
// =====================================================================
export const SMonth: React.FC = () => {
  const f = useCurrentFrame();
  const titre = spr(f, 0, 13, 0.8, 130);
  const p1 = 1 - prog(f, 84, 96);
  const p2 = prog(f, 92, 106) * (1 - prog(f, 174, 186));
  const p3 = prog(f, 182, 196);
  const profit = interpolate(f, [4, 40], [0, MOIS.profit], {...clamp, easing: ease});
  const ventes = interpolate(f, [12, 44], [0, MOIS.ventes], {...clamp, easing: ease});
  const tuiles = spr(f, 34, 14, 0.9, 110);
  const halo = (a: number) => 0.35 + 0.65 * Math.abs(Math.sin((f - a) / 9));
  return (
    <Scene dur={270}>
      <StepBar active={4} />
      <div style={{position: 'absolute', top: 196, left: 0, right: 0, textAlign: 'center', opacity: titre, transform: `translateY(${(1 - titre) * 30}px)`, fontFamily: FONT, fontWeight: 700, fontSize: 76, letterSpacing: -2, color: C.text}}>
        Le mois de <span style={{color: C.aqua}}>Camille</span>
      </div>
      <div style={{position: 'absolute', top: 300, left: 0, right: 0, display: 'flex', justifyContent: 'center', opacity: titre}}>
        <div style={{fontFamily: FONT, fontWeight: 600, fontSize: 25, letterSpacing: 0.5, color: C.mute, padding: '6px 20px', borderRadius: 999, border: `2px solid ${C.line}`, background: 'rgba(11,35,31,0.5)'}}>
          Compte de démonstration · chiffres fictifs
        </div>
      </div>

      {/* 1 — le profit du mois et le nombre de ventes, puis les vraies tuiles de l'accueil */}
      <div style={{position: 'absolute', top: 372, left: 0, right: 0, textAlign: 'center', opacity: p1}}>
        <div style={{fontFamily: FONT, fontWeight: 700, fontSize: 168, lineHeight: 1, letterSpacing: -5, color: C.mint, textShadow: '0 0 60px rgba(111,223,211,0.45)'}}>+{milliers(profit)} €</div>
        <div style={{fontFamily: FONT, fontWeight: 600, fontSize: 46, color: C.text, marginTop: 10}}>
          de profit ce mois · <span style={{color: C.aqua}}>{Math.round(ventes)} ventes</span>
        </div>
      </div>
      <div style={{position: 'absolute', left: 90, top: 690, opacity: p1 * Math.min(1, tuiles * 1.5), transform: `translateY(${(1 - tuiles) * 200}px)`}}>
        <Ecran src="ecrans/accueil-tuiles.png" w={900} ratio={R_TUILES} />
      </div>
      <Sparks start={40} x={540} y={450} n={18} spread={340} color={C.mint} />

      {/* 2 — ventes par plateforme, Depop comprise */}
      <div style={{position: 'absolute', left: 90, top: 380, opacity: p2, transform: `translateY(${(1 - prog(f, 92, 108)) * 160}px)`}}>
        <Ecran src="ecrans/ventes-par-plateforme.png" w={900} ratio={R_PF} />
        {/* la ligne Depop, soulignée */}
        <div style={{position: 'absolute', left: 104, top: 304, width: 766, height: 74, borderRadius: 18, border: `4px solid ${C.aqua}`, boxShadow: `0 0 ${30 * halo(120)}px rgba(78,205,196,0.9)`, opacity: prog(f, 118, 128)}} />
      </div>

      {/* 3 — les meilleures ventes, parties en 1 à 3 jours */}
      <div style={{position: 'absolute', left: 90, top: 380, opacity: p3, transform: `translateY(${(1 - prog(f, 182, 198)) * 160}px)`}}>
        <Ecran src="ecrans/meilleurs-vendeurs.png" w={900} ratio={R_BEST} />
        {[
          {x: 466, y: 205, w: 156, at: 204},
          {x: 386, y: 432, w: 152, at: 212},
          {x: 442, y: 658, w: 156, at: 220},
        ].map((h, i) => (
          <div key={i} style={{position: 'absolute', left: h.x, top: h.y, width: h.w, height: 44, borderRadius: 12, border: `4px solid ${C.aqua}`, boxShadow: `0 0 ${24 * halo(h.at)}px rgba(78,205,196,0.9)`, opacity: prog(f, h.at, h.at + 8)}} />
        ))}
      </div>

      <Captions
        y={1300}
        items={[
          {from: 6, to: 90, text: 'Sa marge, *calculée toute seule*', sub: 'ventes, profit, stock : l’app fait les comptes'},
          {from: 94, to: 182, text: 'Vendu sur *cinq plateformes*', sub: 'Depop compris'},
          {from: 186, to: 270, text: 'Ses meilleures pièces :\n*parties en 1 à 3 jours*', sub: 'sur Vinted, Depop et eBay'},
        ]}
      />
    </Scene>
  );
};

// =====================================================================
// SCÈNE 8 — SYNCHRONISER (135 images, 4,5 s)
// Un appui sur « Synchroniser » relève toutes les plateformes (F33) ; chiffres du compte
// « Camille » (captures : « Synchronisé · 90 annonces »). Bouton au style du vrai (BlocSynchro).
// =====================================================================
const Rafraichir: React.FC<{size: number; rot: number; color?: string}> = ({size, rot, color = 'white'}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" style={{transform: `rotate(${rot}deg)`}}>
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
    <path d="M8 16H3v5" />
  </svg>
);

export const SSync: React.FC = () => {
  const f = useCurrentFrame();
  const btn = spr(f, 0, 12, 0.7, 150);
  const tap = f >= 16 && f <= 26;
  const tapR = prog(f, 16, 34);
  const spin = f > 18 && f < 112 ? (f - 18) * 12 : 0;
  const total = SYNCHRO.reduce((a, s) => a + s.n, 0);
  const fin = spr(f, 108, 12, 0.7, 150);
  return (
    <Scene dur={135}>
      <div style={{position: 'absolute', left: 0, right: 0, top: 200, display: 'flex', justifyContent: 'center', transform: `scale(${btn * (tap ? 0.94 : 1)})`, opacity: Math.min(1, btn * 2), zIndex: 3}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 22, height: 124, padding: '0 66px', borderRadius: 999, background: 'linear-gradient(120deg,#2F9E90,#1B6E62)', boxShadow: '0 20px 60px rgba(47,158,144,0.5)', fontFamily: FONT, fontWeight: 700, fontSize: 56, color: 'white'}}>
          <Rafraichir size={56} rot={spin} />
          Synchroniser
        </div>
      </div>
      {f >= 16 && f <= 34 ? (
        <div style={{position: 'absolute', left: 540 - 260 * tapR, top: 262 - 260 * tapR, width: 520 * tapR, height: 520 * tapR, borderRadius: '50%', border: `6px solid rgba(78,205,196,${0.8 * (1 - tapR)})`}} />
      ) : null}

      {SYNCHRO.map((s, i) => {
        const y = 410 + i * 142;
        const enter = spr(f, 10 + i * 3, 12, 0.7, 150);
        const debut = 26 + i * 14;
        const p = prog(f, debut, debut + 26);
        const ok = f > debut + 26;
        const n = Math.round(s.n * p);
        return (
          <div key={s.k} style={{position: 'absolute', left: 90, top: y, width: 900, height: 116, boxSizing: 'border-box', borderRadius: 28, background: C.card, border: `3px solid ${ok ? C.aqua : C.line}`, boxShadow: ok ? '0 0 34px rgba(78,205,196,0.3)' : '0 12px 30px rgba(0,0,0,0.3)', padding: '0 26px', display: 'flex', alignItems: 'center', gap: 22, opacity: enter, transform: `translateX(${(1 - enter) * 160}px)`}}>
            <PlatLogo k={s.k} size={72} />
            <div style={{flex: 1}}>
              <div style={{fontFamily: FONT, fontWeight: 700, fontSize: 36, color: C.text}}>{NOMS[s.k]}</div>
              <div style={{marginTop: 8, height: 10, borderRadius: 6, background: 'rgba(246,245,241,0.12)', overflow: 'hidden', width: 420}}>
                <div style={{width: `${p * 100}%`, height: '100%', borderRadius: 6, background: ok ? C.mint : `linear-gradient(90deg, ${C.teal}, ${C.aqua})`}} />
              </div>
            </div>
            <div style={{fontFamily: FONT, fontWeight: 700, fontSize: 34, color: ok ? C.mint : C.mute, whiteSpace: 'nowrap'}}>{p > 0 ? `${n} annonce${n > 1 ? 's' : ''}` : 'en attente'}</div>
            <div style={{width: 50, height: 50, borderRadius: '50%', background: ok ? C.aqua : 'rgba(246,245,241,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0}}>
              {ok ? <Check size={34} color={C.bg} draw={prog(f, debut + 26, debut + 36)} /> : null}
            </div>
          </div>
        );
      })}

      <div style={{position: 'absolute', left: 0, right: 0, top: 1150, display: 'flex', justifyContent: 'center', opacity: Math.min(1, fin * 2), transform: `scale(${0.8 + 0.2 * fin})`}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 18, padding: '16px 40px', borderRadius: 999, background: 'rgba(78,205,196,0.14)', border: `3px solid ${C.aqua}`, fontFamily: FONT, fontWeight: 700, fontSize: 44, color: C.text}}>
          <Check size={44} color={C.aqua} />
          Synchronisé · <span style={{color: C.aqua}}>{total} annonces</span>
        </div>
      </div>

      <Captions
        y={1320}
        items={[
          {from: 2, to: 52, text: 'Déjà des annonces *en ligne* ?', sub: 'Un appui sur « Synchroniser »'},
          {from: 54, to: 135, text: 'Tout ton stock *arrive, rangé*', sub: 'Gratuit et sans limite.'},
        ]}
      />
    </Scene>
  );
};

// =====================================================================
// SCÈNE 9 — FIN (180 images, 6 s). CTA réel de la landing : « Commencer gratuitement » (F58).
// Mentions : données de démonstration + non-affiliation (fiche de vérité § 16.1 et § 16.2).
// =====================================================================
export const SEnd: React.FC = () => {
  const f = useCurrentFrame();
  const logoP = spr(f, 2, 11, 0.8, 140);
  const btn = spr(f, 52, 10, 0.7, 140);
  const pulse = 1 + Math.sin(f / 7) * 0.025;
  const underline = prog(f, 70, 96);
  return (
    <Scene dur={180} sortie={false}>
      <div style={{position: 'absolute', left: 540 - 100, top: 150, transform: `scale(${logoP})`}}>
        <Logo size={200} />
      </div>
      <div style={{position: 'absolute', top: 378, left: 0, right: 0}}>
        <Wordmark size={150} delay={6} />
        <div style={{height: 14}} />
        <H size={78} delay={14}>
          Une annonce.
        </H>
        <H size={78} delay={20} color={C.aqua}>
          Cinq plateformes.
        </H>
      </div>

      <div style={{position: 'absolute', top: 820, left: 0, right: 0, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 18, padding: '0 70px'}}>
        {PLAT.map((p, i) => {
          const s = spr(f, 26 + i * 4, 12, 0.6, 150);
          return (
            <div key={p.k} style={{transform: `scale(${s})`, opacity: Math.min(1, s * 2)}}>
              <Pill p={p} size={38} />
            </div>
          );
        })}
      </div>

      <div style={{position: 'absolute', top: 1040, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 18}}>
        {['iPhone', 'Android', 'Chrome'].map((d, i) => {
          const o = prog(f, 40 + i * 5, 52 + i * 5);
          return (
            <div key={d} style={{opacity: o, transform: `translateY(${(1 - o) * 20}px)`, fontFamily: FONT, fontWeight: 600, fontSize: 36, color: C.text, padding: '10px 28px', borderRadius: 18, background: C.card2, border: `2px solid ${C.line}`}}>
              {d}
            </div>
          );
        })}
      </div>

      <div style={{position: 'absolute', top: 1160, left: 0, right: 0, display: 'flex', justifyContent: 'center', transform: `scale(${btn * pulse})`, opacity: Math.min(1, btn * 2)}}>
        <div style={{fontFamily: FONT, fontWeight: 700, fontSize: 56, color: C.bg, padding: '28px 62px', borderRadius: 999, background: C.aqua, boxShadow: '0 0 80px rgba(78,205,196,0.6)', whiteSpace: 'nowrap'}}>
          Commencer gratuitement
        </div>
      </div>

      <div style={{position: 'absolute', top: 1325, left: 0, right: 0, textAlign: 'center', opacity: prog(f, 64, 78)}}>
        <div style={{display: 'inline-block', fontFamily: FONT, fontWeight: 700, fontSize: 58, color: C.text}}>
          fillsell.app
          <div style={{height: 6, borderRadius: 3, background: C.aqua, width: `${underline * 100}%`, marginTop: 6}} />
        </div>
      </div>

      {/* mentions, discrètes */}
      <div style={{position: 'absolute', top: 1530, left: 80, right: 80, textAlign: 'center', opacity: prog(f, 40, 54), fontFamily: FONT, fontWeight: 500, color: C.mute}}>
        <div style={{fontSize: 28, fontWeight: 600}}>Données de démonstration.</div>
        <div style={{fontSize: 24, lineHeight: 1.45, marginTop: 10}}>
          Vinted, Leboncoin, eBay, Beebs et Depop sont des marques de leurs propriétaires respectifs.
          FillSell n’est affilié à aucune de ces plateformes, ni approuvé ni sponsorisé par elles.
        </div>
      </div>
    </Scene>
  );
};
