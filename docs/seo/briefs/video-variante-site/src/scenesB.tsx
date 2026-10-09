import React from 'react';
import {AbsoluteFill, Sequence, useCurrentFrame} from 'remotion';
import {Bg, C, Captions, Check, FONT, GRAD, Logo, PLAT, PlatLogo, Phone, Photo, Pill, Scene, Sparks, StepBar, lerp, platOf, prog, spr} from './ui';
import {SBrand, SHook, SLens} from './scenesA';
import {SEnd, SMonth, SSync} from './scenesC';
import {REPUB_AUTO, REPUB_ROWS, VEDETTE, euro, listeNoms} from './data';

// =====================================================================
// SCÈNE 4 — PUBLIER SUR LES CINQ (225 images, 7,5 s)
// Libellés réels de l'app : « Étape 1 sur 3 », « Où publier ? », « Plateformes »,
// « Connectée » (EcranOuPublier.jsx), « Publier sur {n} plateformes » (translations.js),
// « Publication lancée », « Publié », « {n} en ligne » (EcranSuivi.jsx), « En file… »,
// « Dépôt en cours… », « En ligne » (barresJobs.js). Ordre des plateformes : celui de l'app
// (capture publication-choix-plateformes.png). Dépôts L'UN APRÈS L'AUTRE (F28).
// =====================================================================
const ORDRE_APP = ['vinted', 'leboncoin', 'beebs', 'ebay', 'depop'];

export const SPublish: React.FC = () => {
  const f = useCurrentFrame();
  const phoneP = spr(f, 0, 14, 0.9, 120);
  const out = prog(f, 64, 82);
  const tapOn = f >= 48 && f <= 60;
  const tapR = prog(f, 48, 64);
  const cardP = spr(f, 72, 14, 0.9, 110);
  const D = 22;
  const start0 = 92;
  const allDone = f >= start0 + 4 * 24 + D;
  const lbl: React.CSSProperties = {fontFamily: FONT, fontWeight: 700, fontSize: 15, letterSpacing: 1.4, color: C.appMute, textTransform: 'uppercase'};
  return (
    <Scene dur={225}>
      <StepBar active={1} />

      {/* le téléphone : « Où publier ? » */}
      <div style={{position: 'absolute', left: 270, top: 225, transform: `translateY(${(1 - phoneP) * 400 - out * 120}px) scale(${1 - out * 0.25})`, opacity: phoneP * (1 - out)}}>
        <Phone w={540} h={1040}>
          <AbsoluteFill style={{background: '#F1EFE7', padding: '64px 26px 0'}}>
            <div style={lbl}>Étape 1 sur 3</div>
            <div style={{fontFamily: FONT, fontWeight: 700, fontSize: 40, color: C.appInk, letterSpacing: -0.8, marginTop: 2}}>Où publier ?</div>
            <div style={{display: 'flex', gap: 14, alignItems: 'center', marginTop: 16, padding: 12, borderRadius: 20, background: '#FFFFFF', boxShadow: '0 4px 14px rgba(16,32,27,0.06)'}}>
              <div style={{width: 76, height: 76, borderRadius: 14, overflow: 'hidden', flexShrink: 0}}>
                <Photo src={VEDETTE.photo} />
              </div>
              <div style={{flex: 1, fontFamily: FONT, fontWeight: 700, fontSize: 19, lineHeight: 1.25, color: C.appInk}}>
                {VEDETTE.titre}
                <div style={{fontWeight: 500, fontSize: 16, color: C.appMute, marginTop: 4}}>{VEDETTE.etat} · 1 photo</div>
              </div>
              <div style={{fontFamily: FONT, fontWeight: 700, fontSize: 28, color: C.appInk}}>{euro(VEDETTE.prix)}</div>
            </div>
            <div style={{...lbl, marginTop: 20, marginBottom: 8}}>Plateformes</div>
            {ORDRE_APP.map((k, i) => {
              const p = platOf(k);
              const on = prog(f, 8 + i * 6, 16 + i * 6);
              return (
                <div
                  key={k}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    height: 90,
                    marginBottom: 12,
                    padding: '0 16px',
                    borderRadius: 20,
                    boxSizing: 'border-box',
                    background: on > 0.5 ? '#EEF2EF' : '#FFFFFF',
                    border: `2px solid ${on > 0.5 ? C.teal : 'rgba(16,32,27,0.10)'}`,
                  }}
                >
                  <div style={{width: 34, height: 34, borderRadius: 10, background: on > 0.5 ? C.teal : '#FFFFFF', border: `2px solid ${on > 0.5 ? C.teal : 'rgba(16,32,27,0.25)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                    {on > 0.5 ? <Check size={24} color="white" draw={Math.min(1, (on - 0.5) * 2)} /> : null}
                  </div>
                  <PlatLogo k={k} size={46} style={{boxShadow: 'none', border: k === 'vinted' || k === 'ebay' ? `1px solid ${C.appLine}` : 'none'}} />
                  <div>
                    <div style={{fontFamily: FONT, fontWeight: 700, fontSize: 23, color: C.appInk}}>{p.n}</div>
                    <div style={{fontFamily: FONT, fontWeight: 500, fontSize: 17, color: C.appMute}}>Connectée</div>
                  </div>
                </div>
              );
            })}
            <div
              style={{
                position: 'absolute',
                left: 26,
                right: 26,
                bottom: 34,
                height: 76,
                borderRadius: 999,
                background: 'linear-gradient(120deg,#2F9E90,#1B6E62)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: FONT,
                fontWeight: 700,
                fontSize: 25,
                color: 'white',
                transform: `scale(${tapOn ? 0.94 : 1})`,
              }}
            >
              Publier sur 5 plateformes
            </div>
            {f >= 48 && f <= 64 ? (
              <div style={{position: 'absolute', left: 244 - 70 * tapR, top: 935 - 70 * tapR, width: 140 * tapR, height: 140 * tapR, borderRadius: '50%', border: '5px solid rgba(47,158,144,0.8)', opacity: 1 - tapR}} />
            ) : null}
          </AbsoluteFill>
        </Phone>
      </div>

      {/* le suivi : une annonce après l'autre */}
      <div style={{position: 'absolute', left: 50, top: 330, width: 980, opacity: Math.min(1, cardP * 1.5), transform: `translateY(${(1 - cardP) * 260}px)`}}>
        <div style={{borderRadius: 34, background: C.card, border: `2px solid ${C.line}`, boxShadow: '0 40px 90px rgba(0,0,0,0.5), 0 0 70px rgba(78,205,196,0.16)', padding: '30px 34px 18px'}}>
          <div style={{display: 'flex', alignItems: 'center', gap: 18, marginBottom: 16}}>
            <Logo size={56} />
            <div style={{fontFamily: FONT, fontWeight: 700, fontSize: 46, color: allDone ? C.mint : C.text}}>{allDone ? 'Publié · 5 en ligne' : 'Publication lancée'}</div>
          </div>
          {ORDRE_APP.map((k, i) => {
            const p = platOf(k);
            const start = start0 + i * 24;
            const pr = prog(f, start, start + D);
            const done = f >= start + D;
            const started = pr > 0.02;
            return (
              <div key={k} style={{position: 'relative', height: 132, display: 'flex', alignItems: 'center', gap: 20, borderTop: `2px solid ${C.line}`}}>
                <div style={{width: 320}}>
                  <Pill p={p} size={38} />
                </div>
                <div style={{width: 240, height: 20, borderRadius: 10, background: 'rgba(246,245,241,0.12)', overflow: 'hidden'}}>
                  <div style={{width: `${pr * 100}%`, height: '100%', borderRadius: 10, background: done ? C.mint : GRAD}} />
                </div>
                <div style={{display: 'flex', alignItems: 'center', gap: 8, fontFamily: FONT, fontWeight: 700, fontSize: 33, color: done ? C.mint : C.mute, whiteSpace: 'nowrap'}}>
                  {done ? (
                    <>
                      <Check size={42} draw={prog(f, start + D, start + D + 12)} />
                      En ligne
                    </>
                  ) : started ? (
                    'Dépôt en cours…'
                  ) : (
                    'En file…'
                  )}
                </div>
                <Sparks start={start + D} x={780} y={66} n={10} spread={140} />
              </div>
            );
          })}
        </div>
      </div>

      <Captions
        y={1340}
        items={[
          {from: 4, to: 66, text: 'Coche *tes plateformes*', sub: 'Vinted · Leboncoin · eBay · Beebs · Depop'},
          {from: 70, to: 225, text: 'En ligne sur *les cinq*', sub: 'une annonce après l’autre,\nsans un copier-coller'},
        ]}
      />
    </Scene>
  );
};

// =====================================================================
// SCÈNE 5 — REPUBLICATION AUTOMATIQUE (180 images, 6 s)
// La ligne de l'app (Haut.jsx : « Republication automatique » / « Active sur … », interrupteur)
// et des annonces de Camille. Plateformes = REPUB_AUTO (data.ts, UN SEUL GESTE pour Depop) ;
// jamais eBay, jamais un palier. « De retour en tête sur … » : barresJobs.js.
// Fiche de vérité F39 (jours et créneau choisis, ordinateur allumé), F40.
// =====================================================================
export const SRepub: React.FC = () => {
  const f = useCurrentFrame();
  const move = prog(f, 64, 100);
  const hot = prog(f, 44, 62) * (1 - prog(f, 150, 175));
  const lineP = spr(f, 2, 13, 0.8, 130);
  const toggle = prog(f, 12, 22);
  const last = REPUB_ROWS.length - 1;
  return (
    <Scene dur={180}>
      <StepBar active={2} />

      {/* la ligne « Republication automatique » de l'app */}
      <div style={{position: 'absolute', left: 60, right: 60, top: 228, opacity: lineP, transform: `translateY(${(1 - lineP) * -40}px)`}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 22, padding: '22px 26px', borderRadius: 30, background: '#FFFFFF', boxShadow: '0 20px 50px rgba(0,0,0,0.35)'}}>
          <div style={{width: 76, height: 76, borderRadius: 20, background: '#EEF2EF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0}}>
            <svg width={42} height={42} viewBox="0 0 24 24" fill="none" stroke={C.appTeal} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5" />
              <path d="M16 2v4M8 2v4M3 10h5" />
              <circle cx="16" cy="16" r="6" />
              <path d="M16 14v2.2l1.4 1" />
            </svg>
          </div>
          <div style={{flex: 1, minWidth: 0}}>
            <div style={{fontFamily: FONT, fontWeight: 700, fontSize: 34, color: C.appInk}}>Republication automatique</div>
            <div style={{fontFamily: FONT, fontWeight: 500, fontSize: 25, color: '#5C6560', marginTop: 4}}>Active sur {listeNoms(REPUB_AUTO)}</div>
          </div>
          <div style={{width: 96, height: 56, borderRadius: 999, background: toggle > 0.5 ? C.teal : '#D9DCD8', position: 'relative', flexShrink: 0}}>
            <div style={{position: 'absolute', top: 6, left: 6 + toggle * 40, width: 44, height: 44, borderRadius: '50%', background: '#FFFFFF', boxShadow: '0 2px 6px rgba(0,0,0,0.25)'}} />
          </div>
        </div>
      </div>
      <div style={{position: 'absolute', left: 0, right: 0, top: 400, display: 'flex', justifyContent: 'center', gap: 14}}>
        {REPUB_AUTO.map((k, i) => {
          const s = spr(f, 16 + i * 3, 12, 0.6, 160);
          return (
            <div key={k} style={{transform: `scale(${s})`, opacity: Math.min(1, s * 2)}}>
              <Pill p={platOf(k)} size={30} />
            </div>
          );
        })}
      </div>

      {REPUB_ROWS.map((r, idx) => {
        const isT = idx === last;
        const finalIdx = isT ? 0 : idx + 1;
        const y = 490 + lerp(idx, finalIdx, move) * 162;
        const enter = spr(f, 2 + idx * 4, 14, 0.8, 130);
        const back = isT && f > 92;
        const logos = r.pf.filter((k) => REPUB_AUTO.includes(k));
        return (
          <div
            key={idx}
            style={{
              position: 'absolute',
              left: 60,
              top: y,
              width: 960,
              height: 144,
              boxSizing: 'border-box',
              borderRadius: 26,
              background: isT ? `linear-gradient(rgba(78,205,196,${0.06 + hot * 0.12}), rgba(78,205,196,${0.06 + hot * 0.12})), ${C.card}` : C.card,
              border: `3px solid ${isT ? `rgba(78,205,196,${0.15 + hot * 0.85})` : C.line}`,
              boxShadow: isT ? `0 0 ${60 * hot}px rgba(78,205,196,0.6)` : '0 12px 30px rgba(0,0,0,0.3)',
              display: 'flex',
              alignItems: 'center',
              gap: 22,
              padding: '0 28px 0 16px',
              opacity: enter,
              transform: `translateX(${(1 - enter) * -200}px) scale(${isT ? 1 + hot * 0.03 : 1})`,
              zIndex: isT ? 5 : 1,
            }}
          >
            <div style={{width: 112, height: 112, borderRadius: 18, overflow: 'hidden', flexShrink: 0, background: '#E9E6DF'}}>
              <Photo src={r.photo} />
            </div>
            <div style={{flex: 1, minWidth: 0}}>
              <div style={{fontFamily: FONT, fontWeight: 700, fontSize: 29, lineHeight: 1.2, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{r.titre}</div>
              <div style={{marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, fontFamily: FONT, fontWeight: 600, fontSize: 26, color: back ? C.mint : C.mute, whiteSpace: 'nowrap'}}>
                {logos.map((k) => (
                  <PlatLogo key={k} k={k} size={36} style={{boxShadow: 'none'}} />
                ))}
                <span style={{marginLeft: 6}}>{back ? 'De retour en tête ✓' : `en ligne depuis ${r.jours} j`}</span>
              </div>
            </div>
            <div style={{fontFamily: FONT, fontWeight: 700, fontSize: 42, color: C.text, whiteSpace: 'nowrap'}}>{euro(r.prix)}</div>
          </div>
        );
      })}
      <Sparks start={98} x={540} y={556} n={16} spread={300} />

      <Captions
        y={1340}
        items={[
          {from: 4, to: 60, text: 'Une annonce *prend de l’âge*…', sub: 'elle descend dans la liste'},
          {from: 62, to: 180, text: 'Elle *remonte toute seule*', sub: 'les jours et au créneau que tu choisis,\nordinateur allumé'},
        ]}
      />
    </Scene>
  );
};

// =====================================================================
// SCÈNE 6 — VENDU ICI, RETIRÉ LÀ-BAS (240 images, 8 s)
// L'article de l'histoire, en ligne sur les cinq ; la vente a lieu sur VINTED (F43 : la vente
// Vinted s'enregistre seule) ; FillSell retire les quatre autres annonces (F44 : copies déposées
// par FillSell = prouvées) ; au moindre doute, la question de l'app « Déjà vendu ? » (F44).
// Libellé « Retirée » : BarreJobCarte.jsx / StockTab.jsx.
// =====================================================================
const CW = 450;
const CH = 304;
const CARDS = [
  {x: 60, y: 224, k: 'vinted'},
  {x: 570, y: 224, k: 'leboncoin'},
  {x: 60, y: 548, k: 'ebay'},
  {x: 570, y: 548, k: 'beebs'},
  {x: 315, y: 872, k: 'depop'},
];

export const SSold: React.FC = () => {
  const f = useCurrentFrame();
  const stamp = spr(f, 24, 8, 0.7, 180);
  const src = {x: CARDS[0].x + CW / 2, y: CARDS[0].y + CH / 2};
  const gain = prog(f, 34, 46) * (1 - prog(f, 140, 152));
  const marge = VEDETTE.prix - VEDETTE.prixAchat;
  const chip = spr(f, 158, 11, 0.7, 150);
  return (
    <Scene dur={240}>
      <StepBar active={3} />

      <svg width={1080} height={1920} style={{position: 'absolute', left: 0, top: 0}}>
        {CARDS.slice(1).map((c, k) => {
          const dst = {x: c.x + CW / 2, y: c.y + CH / 2};
          const a = prog(f, 54 + k * 8, 76 + k * 8);
          return (
            <g key={c.k} opacity={f > 52 && f < 150 ? 1 : 0}>
              <line x1={src.x} y1={src.y} x2={dst.x} y2={dst.y} stroke="rgba(78,205,196,0.35)" strokeWidth={4} strokeDasharray="10 14" />
              <circle cx={lerp(src.x, dst.x, a)} cy={lerp(src.y, dst.y, a)} r={14} fill={C.aqua} />
              <circle cx={lerp(src.x, dst.x, a)} cy={lerp(src.y, dst.y, a)} r={30} fill="rgba(78,205,196,0.25)" />
            </g>
          );
        })}
      </svg>

      {CARDS.map((c, i) => {
        const enter = spr(f, i * 3, 14, 0.8, 130);
        const sold = i === 0;
        const removedAt = 74 + (i - 1) * 8;
        const rem = sold ? 0 : prog(f, removedAt, removedAt + 12);
        return (
          <div
            key={c.k}
            style={{
              position: 'absolute',
              left: c.x,
              top: c.y,
              width: CW,
              height: CH,
              borderRadius: 30,
              background: C.card,
              border: `3px solid ${sold && f > 24 ? C.aqua : C.line}`,
              boxShadow: sold && f > 24 ? '0 0 60px rgba(78,205,196,0.45)' : '0 14px 36px rgba(0,0,0,0.35)',
              opacity: enter,
              transform: `scale(${0.85 + 0.15 * enter})`,
              overflow: 'hidden',
            }}
          >
            <div style={{height: 200, background: '#E9E6DF'}}>
              <Photo src={VEDETTE.photo} position="center 45%" />
            </div>
            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 22px', height: 104}}>
              <Pill p={platOf(c.k)} size={30} />
              <div style={{fontFamily: FONT, fontWeight: 700, fontSize: 42, color: C.text}}>{euro(VEDETTE.prix)}</div>
            </div>
            <div style={{position: 'absolute', inset: 0, background: 'rgba(11,35,31,0.82)', opacity: rem, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
              <div style={{transform: `rotate(-8deg) scale(${0.6 + 0.4 * rem})`, display: 'flex', alignItems: 'center', gap: 12, fontFamily: FONT, fontWeight: 700, fontSize: 52, color: 'white', padding: '8px 28px', borderRadius: 18, background: C.orange, whiteSpace: 'nowrap'}}>
                RETIRÉE <Check size={46} color="white" />
              </div>
            </div>
            {sold && f > 24 ? (
              <div style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingBottom: 60}}>
                <div style={{transform: `rotate(-12deg) scale(${stamp})`, fontFamily: FONT, fontWeight: 700, fontSize: 62, whiteSpace: 'nowrap', color: C.mint, border: `8px solid ${C.mint}`, borderRadius: 22, padding: '0 24px', background: 'rgba(11,35,31,0.78)', textShadow: '0 0 30px rgba(111,223,211,0.8)'}}>
                  VENDU !
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
      <Sparks start={28} x={src.x} y={src.y} n={18} spread={260} />

      {/* le gain de la vente : prix − prix d'achat (11 €) */}
      <div style={{position: 'absolute', left: CARDS[0].x + CW - 200, top: CARDS[0].y + 14 - gain * 18, opacity: gain, transform: `scale(${0.7 + 0.3 * gain})`, zIndex: 6}}>
        <div style={{fontFamily: FONT, fontWeight: 700, fontSize: 40, color: C.bg, background: C.mint, borderRadius: 999, padding: '8px 22px', boxShadow: '0 0 40px rgba(111,223,211,0.7)', whiteSpace: 'nowrap'}}>+{marge},00 €</div>
      </div>

      {/* la vraie question de l'app pour une annonce non prouvée */}
      <div style={{position: 'absolute', left: 0, right: 0, top: 1200, display: 'flex', justifyContent: 'center', opacity: Math.min(1, chip * 2), transform: `scale(${0.8 + 0.2 * chip})`}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 20, padding: '16px 24px 16px 32px', borderRadius: 30, background: 'rgba(78,205,196,0.14)', border: `3px solid ${C.aqua}`}}>
          <span style={{fontFamily: FONT, fontWeight: 700, fontSize: 42, color: C.text, whiteSpace: 'nowrap'}}>Déjà vendu ?</span>
          <span style={{fontFamily: FONT, fontWeight: 700, fontSize: 28, color: C.bg, background: C.aqua, borderRadius: 999, padding: '10px 22px', whiteSpace: 'nowrap'}}>Oui, la retirer</span>
          <span style={{fontFamily: FONT, fontWeight: 700, fontSize: 28, color: C.text, border: '2px solid rgba(246,245,241,0.3)', borderRadius: 999, padding: '8px 22px', whiteSpace: 'nowrap'}}>Non</span>
        </div>
      </div>

      <Captions
        y={1340}
        items={[
          {from: 4, to: 52, text: '*Vendu* sur Vinted !', sub: 'la vente s’enregistre toute seule'},
          {from: 54, to: 152, text: 'Vendu ici, *retiré là-bas*', sub: 'Leboncoin, eBay, Beebs, Depop : FillSell\nretire les copies dès la vente enregistrée'},
          {from: 154, to: 240, text: 'Un doute ? Il *te demande*', sub: 'avant de toucher à une annonce'},
        ]}
      />
    </Scene>
  );
};

// =====================================================================
// MONTAGE — 53,5 s (1 605 images à 30 i/s), sans son (vidéo muette, texte incrusté).
// =====================================================================
const SCENES: {S: React.FC; d: number}[] = [
  {S: SHook, d: 90},
  {S: SBrand, d: 75},
  {S: SLens, d: 210},
  {S: SPublish, d: 225},
  {S: SRepub, d: 180},
  {S: SSold, d: 240},
  {S: SMonth, d: 270},
  {S: SSync, d: 135},
  {S: SEnd, d: 180},
];
export const TOTAL = SCENES.reduce((a, s) => a + s.d, 0);
export const DEBUTS = SCENES.reduce<number[]>((acc, s, i) => [...acc, i ? acc[i - 1] + SCENES[i - 1].d : 0], []);

export const FillSellVideo: React.FC = () => {
  let t = 0;
  return (
    <AbsoluteFill style={{background: C.bg}}>
      <Bg />
      {SCENES.map(({S, d}, i) => {
        const from = t;
        t += d;
        return (
          <Sequence key={i} from={from} durationInFrames={d}>
            <S />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

