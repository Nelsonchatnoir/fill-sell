import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {C, Captions, Check, FONT, H, Logo, PLAT, PlatLogo, Phone, Photo, Pill, Scene, Sparks, StepBar, Wordmark, ease, lerp, lin, prog, spr} from './ui';
import {VEDETTE, milliers} from './data';

// =====================================================================
// VARIANTE SITE (09/10/2026) — compte de démonstration « Camille », cinq plateformes.
// Aucune donnée réelle, aucun Opla, aucun Cloud, aucun palier, aucun quota.
// =====================================================================

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

// =====================================================================
// SCÈNE 1 — L'ACCROCHE (90 images, 3 s), lisible dès l'image 0.
// « Une photo. » → les cinq logos jaillissent de la photo → « Cinq plateformes. »
// → Ctrl+C / Ctrl+V barrés → « Sans un copier-coller. »
// =====================================================================
export const SHook: React.FC = () => {
  const f = useCurrentFrame();
  const cx = 540;
  const cy = 940;
  const photoS = interpolate(f, [0, 16], [1.08, 1], {...clamp, easing: ease});
    const keys = prog(f, 40, 50);
  const strike = prog(f, 50, 60);
  return (
    <Scene dur={90} entree={false}>
      {/* lignes de titre (la première est là dès l'image 0) */}
      <div style={{position: 'absolute', top: 230, left: 0, right: 0, textAlign: 'center', fontFamily: FONT, fontWeight: 700, fontSize: 104, lineHeight: 1.05, letterSpacing: -2.5, color: C.text}}>
        Une photo.
      </div>
      <div
        style={{
          position: 'absolute',
          top: 348,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontFamily: FONT,
          fontWeight: 700,
          fontSize: 104,
          lineHeight: 1.05,
          letterSpacing: -2.5,
          color: C.aqua,
          opacity: prog(f, 14, 22),
          transform: `translateY(${(1 - prog(f, 14, 24)) * 40}px)`,
        }}
      >
        Cinq plateformes.
      </div>

      {/* la photo de l'article */}
      <div
        style={{
          position: 'absolute',
          left: cx - 210,
          top: cy - 210,
          width: 420,
          height: 420,
          borderRadius: 40,
          overflow: 'hidden',
          border: `6px solid ${C.text}`,
          boxShadow: '0 30px 80px rgba(0,0,0,0.5), 0 0 80px rgba(78,205,196,0.35)',
          transform: `scale(${photoS}) rotate(-3deg)`,
        }}
      >
        <Photo src={VEDETTE.photo} />
      </div>

      {/* les cinq logos, tels que l'app les dessine, jaillissent de la photo */}
      {PLAT.map((p, i) => {
        const a = ((-90 + i * 72) * Math.PI) / 180;
        const t = spr(f, 10 + i * 3, 12, 0.6, 170);
        const r = 365;
        const x = cx + Math.cos(a) * r * t;
        const y = cy + Math.sin(a) * r * t;
        return (
          <div key={p.k} style={{position: 'absolute', left: x - 66, top: y - 66, transform: `scale(${0.3 + 0.7 * Math.min(1, t)})`, opacity: Math.min(1, t * 2), zIndex: 3}}>
            <PlatLogo k={p.k} size={132} style={{boxShadow: '0 14px 40px rgba(0,0,0,0.45)'}} />
          </div>
        );
      })}
      {PLAT.map((p, i) => {
        const a = ((-90 + i * 72) * Math.PI) / 180;
        return <Sparks key={p.k} start={18 + i * 3} x={cx + Math.cos(a) * 365} y={cy + Math.sin(a) * 365} n={8} spread={110} />;
      })}

      {/* Ctrl + C / Ctrl + V, barrés */}
      <div style={{position: 'absolute', top: 1420, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 34, opacity: keys, transform: `scale(${0.8 + 0.2 * keys})`}}>
        {['Ctrl + C', 'Ctrl + V'].map((k) => (
          <div key={k} style={{position: 'relative', fontFamily: FONT, fontWeight: 700, fontSize: 50, padding: '12px 30px', borderRadius: 18, color: C.mute, background: C.card2, border: `3px solid ${C.line}`, boxShadow: '0 8px 0 rgba(0,0,0,0.4)', whiteSpace: 'nowrap'}}>
            {k}
            <div style={{position: 'absolute', left: -12, top: '50%', height: 8, width: `${strike * 112}%`, borderRadius: 4, background: C.orange, transform: 'rotate(-8deg)', boxShadow: '0 0 20px rgba(232,132,90,0.8)'}} />
          </div>
        ))}
      </div>
      <div
        style={{
          position: 'absolute',
          top: 1565,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontFamily: FONT,
          fontWeight: 700,
          fontSize: 84,
          letterSpacing: -2,
          color: C.text,
          opacity: prog(f, 52, 60),
          transform: `translateY(${(1 - prog(f, 52, 62)) * 40}px)`,
        }}
      >
        Sans un <span style={{color: C.peach}}>copier-coller</span>.
      </div>
    </Scene>
  );
};

// =====================================================================
// SCÈNE 2 — LA MARQUE (75 images). Formule de la matrice concurrents (§ 6.2) :
// « Vinted, Leboncoin, eBay, Beebs et Depop. Une seule app. »
// =====================================================================
export const SBrand: React.FC = () => {
  const f = useCurrentFrame();
  const logoP = spr(f, 2, 10, 0.8, 150);
  const converge = prog(f, 4, 26);
  const cx = 540;
  const cy = 640;
  const pulse = 1 + (f > 24 && f < 40 ? Math.sin(((f - 24) / 16) * Math.PI) * 0.1 : 0);
  return (
    <Scene dur={75}>
      {[0, 1].map((k) => {
        const t = lin(f, 24 + k * 6, 56 + k * 6);
        if (t <= 0 || t >= 1) return null;
        const r = 110 + t * 480;
        return <div key={k} style={{position: 'absolute', left: cx - r, top: cy - r, width: r * 2, height: r * 2, borderRadius: '50%', border: `4px solid rgba(78,205,196,${0.55 * (1 - t)})`}} />;
      })}
      {PLAT.map((p, i) => {
        const a = ((-90 + i * 72) * Math.PI) / 180 + f / 30;
        const rad = lerp(330, 0, converge);
        return (
          <div key={p.k} style={{position: 'absolute', left: cx + Math.cos(a) * rad - 50, top: cy + Math.sin(a) * rad - 50, transform: `scale(${1 - 0.7 * converge})`, opacity: 1 - converge}}>
            <PlatLogo k={p.k} size={100} />
          </div>
        );
      })}
      <div style={{position: 'absolute', left: cx - 125, top: cy - 125, transform: `scale(${logoP * pulse})`}}>
        <Logo size={250} />
      </div>
      <div style={{position: 'absolute', top: 840, left: 0, right: 0}}>
        <Wordmark size={170} delay={10} />
      </div>
      <div style={{position: 'absolute', top: 1090, left: 0, right: 0, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 18, padding: '0 60px'}}>
        {PLAT.map((p, i) => {
          const s = spr(f, 18 + i * 3, 12, 0.6, 160);
          return (
            <div key={p.k} style={{transform: `scale(${s})`, opacity: Math.min(1, s * 2)}}>
              <Pill p={p} size={38} />
            </div>
          );
        })}
      </div>
      <div style={{position: 'absolute', top: 1340, left: 0, right: 0}}>
        <H size={96} delay={30} color={C.aqua}>
          Une seule app.
        </H>
      </div>
    </Scene>
  );
};

// =====================================================================
// SCÈNE 3 — LENS : UNE PHOTO → L'ANNONCE (210 images, 7 s)
// Écran reconstruit d'après le VRAI écran Lens de l'app, thème clair (capture du site
// lens-analyse-photo.png : « Résultat du scan », titre, marque en vert, description,
// pastilles, « Lu sur l'objet », prix conseillé, « Excellent marge », « basé sur N
// annonces ») ; le slogan « Scanne. On gère le reste. » est celui de l'écran Lens.
// Fiche de vérité F15, F16 (marque LUE), F18 (état PROPOSÉ), F19 (prix et nombre d'annonces).
// =====================================================================
export const SLens: React.FC = () => {
  const f = useCurrentFrame();
  const phoneP = spr(f, 0, 14, 0.9, 120);
  const scanY = f < 30 ? lin(f, 6, 30) : 1 - lin(f, 30, 52);
  const camOp = interpolate(f, [54, 64], [1, 0], clamp);
  const flash = interpolate(f, [50, 55, 64], [0, 0.9, 0], clamp);
  const brackets = prog(f, 4, 16);
  const title = VEDETTE.titre;
  const typed = title.slice(0, Math.floor(interpolate(f, [66, 94], [0, title.length], clamp)));
  const desc = VEDETTE.description;
  const descTyped = desc.slice(0, Math.floor(interpolate(f, [96, 122], [0, desc.length], clamp)));
  const price = Math.round(interpolate(f, [130, 150], [0, VEDETTE.prix], {...clamp, easing: ease}));
  const marge = VEDETTE.prix - VEDETTE.prixAchat;
  const margePct = Math.round((marge / VEDETTE.prix) * 100);
  const chips = [
    {t: VEDETTE.etat, c: '#7C3AED', b: 'rgba(124,58,237,0.30)', bg: '#F5F0FF', at: 100},
    {t: VEDETTE.couleur, c: '#374151', b: 'rgba(55,65,81,0.22)', bg: '#F7F7F5', at: 104},
    {t: VEDETTE.matiere, c: '#C2410C', b: 'rgba(194,65,12,0.30)', bg: '#FFF7ED', at: 108},
    {t: VEDETTE.categorie, c: '#9D174D', b: 'rgba(157,23,77,0.30)', bg: '#FDF2F8', at: 112},
  ];
  const lbl: React.CSSProperties = {fontFamily: FONT, fontWeight: 700, fontSize: 17, letterSpacing: 1.6, color: C.appMute, textTransform: 'uppercase'};
  return (
    <Scene dur={210}>
      <StepBar active={0} />
      <div style={{position: 'absolute', left: 230, top: 222, transform: `translateY(${(1 - phoneP) * 400}px)`, opacity: phoneP}}>
        <Phone w={620} h={1080}>
          {/* VUE CAMÉRA : la photo de l'article */}
          <AbsoluteFill style={{opacity: camOp, background: '#0A1714'}}>
            <div style={{position: 'absolute', left: 24, right: 24, top: 250, height: 568, borderRadius: 18, overflow: 'hidden', opacity: spr(f, 2, 12)}}>
              <Photo src={VEDETTE.photo} />
            </div>
            {[
              {l: 42, t: 234, r: 0},
              {l: 526, t: 234, r: 90},
              {l: 526, t: 782, r: 180},
              {l: 42, t: 782, r: 270},
            ].map((c, i) => (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: c.l + (1 - brackets) * (c.l < 200 ? 36 : -36),
                  top: c.t + (1 - brackets) * (c.t < 400 ? 36 : -36),
                  width: 52,
                  height: 52,
                  borderLeft: `7px solid ${C.aqua}`,
                  borderTop: `7px solid ${C.aqua}`,
                  borderRadius: 8,
                  transform: `rotate(${c.r}deg)`,
                  opacity: brackets,
                }}
              />
            ))}
            <div
              style={{
                position: 'absolute',
                left: 40,
                right: 40,
                top: 256 + scanY * 552,
                height: 8,
                borderRadius: 6,
                background: `linear-gradient(90deg, transparent, ${C.aqua}, transparent)`,
                boxShadow: `0 0 40px ${C.aqua}`,
                opacity: f > 5 && f < 54 ? 1 : 0,
              }}
            />
            <div style={{position: 'absolute', left: 0, right: 0, top: 100, textAlign: 'center', fontFamily: FONT, fontWeight: 700, fontSize: 46, lineHeight: 1.1, color: 'white', letterSpacing: -0.8}}>
              Scanne.
              <br />
              On gère le reste.
            </div>
            <div style={{position: 'absolute', left: 0, right: 0, bottom: 120, display: 'flex', justifyContent: 'center'}}>
              <div style={{width: 112, height: 112, borderRadius: '50%', background: 'linear-gradient(160deg,#2F9E90,#1B6E62)', border: '6px solid rgba(255,255,255,0.85)', transform: `scale(${f >= 46 && f <= 54 ? 0.9 : 1})`, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                <svg width={46} height={46} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                  <circle cx="12" cy="13" r="3" />
                </svg>
              </div>
            </div>
          </AbsoluteFill>
          <AbsoluteFill style={{background: '#fff', opacity: flash, zIndex: 9}} />

          {/* VUE RÉSULTAT (thème clair de l'app) */}
          <AbsoluteFill style={{opacity: interpolate(f, [58, 70], [0, 1], clamp), background: C.appBg, padding: '64px 24px 0'}}>
            <div style={{display: 'flex', alignItems: 'center', gap: 10, ...lbl}}>
              <span style={{width: 12, height: 12, borderRadius: '50%', background: C.teal, boxShadow: '0 0 0 5px rgba(47,158,144,0.18)'}} />
              Résultat du scan
            </div>
            <div style={{marginTop: 12, padding: 18, borderRadius: 22, background: '#FFFFFF', border: `1.5px solid ${C.appLine}`}}>
              <div style={{display: 'flex', gap: 14}}>
                <div style={{width: 104, height: 104, borderRadius: 18, overflow: 'hidden', flexShrink: 0, boxShadow: '0 6px 16px rgba(16,32,27,0.16)'}}>
                  <Photo src={VEDETTE.photo} />
                </div>
                <div style={{flex: 1, minWidth: 0}}>
                  <div style={{fontFamily: FONT, fontWeight: 700, fontSize: 27, lineHeight: 1.2, color: C.appInk, minHeight: 66}}>
                    {typed}
                    <span style={{opacity: f % 14 < 7 && f > 62 && f < 96 ? 1 : 0, color: C.teal}}>|</span>
                  </div>
                  <div style={{fontFamily: FONT, fontWeight: 700, fontSize: 24, color: C.appTeal, marginTop: 4, opacity: prog(f, 78, 88)}}>{VEDETTE.marque}</div>
                </div>
              </div>
              <div style={{marginTop: 12, height: 150, fontFamily: FONT, fontWeight: 500, fontSize: 21, lineHeight: 1.42, color: '#374151'}}>{descTyped}</div>
              <div style={{display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8}}>
                {chips.map((c) => {
                  const s = spr(f, c.at, 11, 0.6, 170);
                  return (
                    <div key={c.t} style={{transform: `scale(${s})`, opacity: Math.min(1, s * 2), padding: '6px 16px', borderRadius: 999, background: c.bg, border: `1.5px solid ${c.b}`, fontFamily: FONT, fontWeight: 700, fontSize: 20, color: c.c}}>
                      {c.t}
                    </div>
                  );
                })}
              </div>
              <div style={{...lbl, marginTop: 14, fontSize: 15, opacity: prog(f, 112, 122)}}>Lu sur l’objet</div>
              <div style={{fontFamily: FONT, fontWeight: 500, fontSize: 20, lineHeight: 1.5, color: C.appMute, opacity: prog(f, 114, 124)}}>
                Marque : <b style={{color: C.appInk}}>{VEDETTE.marque} (logo imprimé)</b>
                <br />
                Taille : <b style={{color: C.appInk}}>{VEDETTE.taille}</b>
              </div>
            </div>
            <div style={{marginTop: 14, padding: '16px 18px', borderRadius: 22, background: '#FFFFFF', border: `1.5px solid ${C.appLine}`, opacity: prog(f, 126, 134)}}>
              <div style={{fontFamily: FONT, fontWeight: 700, fontSize: 78, lineHeight: 1, color: C.appTeal, letterSpacing: -2}}>
                {price},00 €
              </div>
              <div style={{fontFamily: FONT, fontWeight: 500, fontSize: 20, color: C.appMute, marginTop: 4}}>prix de vente conseillé</div>
              <div
                style={{
                  marginTop: 10,
                  padding: '8px 14px',
                  borderRadius: 14,
                  background: '#ECFDF7',
                  border: '1.5px solid rgba(47,158,144,0.35)',
                  fontFamily: FONT,
                  fontWeight: 700,
                  fontSize: 21,
                  color: C.appTeal,
                  transform: `scale(${spr(f, 150, 11, 0.6, 170)})`,
                  transformOrigin: 'left center',
                }}
              >
                <span style={{letterSpacing: 1.4}}>EXCELLENT</span>&nbsp;&nbsp;marge +{milliers(marge)},00 € (+{margePct} %)
              </div>
              <div style={{marginTop: 8, fontFamily: FONT, fontWeight: 500, fontSize: 19, color: C.appMute, opacity: prog(f, 154, 162)}}>
                • basé sur {VEDETTE.comparables.n} annonces ({VEDETTE.comparables.min},00 € – {VEDETTE.comparables.max},00 €)
              </div>
            </div>
            <div
              style={{
                position: 'absolute',
                left: 24,
                right: 24,
                bottom: 30,
                height: 82,
                borderRadius: 999,
                background: 'linear-gradient(135deg,#1A5F52 0%,#0E3A32 55%,#10201B 100%)',
                border: '2px solid rgba(240,196,106,0.55)',
                boxShadow: '0 14px 30px -8px rgba(16,32,27,0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                fontFamily: FONT,
                fontWeight: 700,
                fontSize: 31,
                color: 'white',
                transform: `scale(${spr(f, 168, 12, 0.6, 150) * (f >= 186 && f <= 194 ? 0.95 : 1)})`,
              }}
            >
              Créer l’annonce <Check size={32} color="white" draw={prog(f, 188, 200)} />
            </div>
          </AbsoluteFill>
        </Phone>
      </div>
      <Captions
        y={1350}
        items={[
          {from: 4, to: 58, text: 'Prends *une photo*.', sub: 'Lens regarde l’article'},
          {from: 60, to: 126, text: 'Lens *écrit l’annonce*', sub: 'titre, description, marque lue\nsur l’article, état proposé'},
          {from: 128, to: 210, text: 'Et propose *le prix*', sub: 'Tu relis, tu publies.'},
        ]}
      />
    </Scene>
  );
};
