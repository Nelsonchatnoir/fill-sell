// ═══════════════════════════════════════════════════════════════════════════
// MAQUETTES — la carte FillSell Cloud de la feuille des offres (09/11/2026, point 2 de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Outil de RELECTURE, jamais livré. ⛔ RIEN n'est intégré avant le choix de Nico : ce fichier ne touche à aucun
// composant de l'app ; il redessine la carte avec les VRAIS jetons (src/cloud/theme.js), la vraie police, les vrais
// logos (public/email) et les vrais textes de prix, dans le haut de la vraie feuille (compte Free).
//   ?variante=a|b|c  (a : turquoise pleine · b : menthe à liseré + relais · c : le relais, prix et essai d'égal poids)
// Constat de Nico (25 comptes ont ouvert la feuille depuis l'ouverture, 0 clic Cloud) : essai invisible, prix lu
// d'abord, interrupteur gris au lieu d'un bouton, carte aussi discrète que l'encadré du dessus, texte long.
// Ce que chaque maquette garde : « Essai gratuit 7 jours » en gros, l'accroche « Plus besoin d'ordinateur », un vrai
// bouton « Essayer 7 jours », le prix ENSUITE mais lisible (Apple : le montant facturé clairement affiché),
// « 5 places restantes ». Clair uniquement.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Cloud, Laptop, Moon, Check } from 'lucide-react';
import { C, MENTHE, BLANC, DEGRADE_TEAL, POLICE } from '../../src/cloud/theme';
import '../../src/base.css';
import '../../src/App.redesign.css';

const p = new URLSearchParams(location.search);
const variante = ['a', 'b', 'c'].includes(p.get('variante')) ? p.get('variante') : 'a';
// Insécable : « 24,99 € » d'un bloc, et « €/mois » collé par un gluon (comme dans l'app, src/cloud/textes.js).
const PRIX = `24,99${String.fromCharCode(0xa0)}€`;
const MOIS = `/${String.fromCharCode(0x2060)}mois`;
const PLATEFORMES = ['vinted', 'leboncoin', 'beebs', 'depop'];
const NOMS = { vinted: 'Vinted', leboncoin: 'Leboncoin', beebs: 'Beebs', depop: 'Depop' };

function Places({ clair = false }) {
  return (
    <span data-places style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, lineHeight: 1.3, borderRadius: 999,
      padding: '5px 10px', background: clair ? 'rgba(255,255,255,0.16)' : BLANC, color: clair ? BLANC : C.tealDeep,
      border: clair ? '1px solid rgba(255,255,255,0.28)' : `1px solid ${C.border}`,
    }}>
      <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 4, background: clair ? '#9BE8DC' : C.teal }} />
      5 places restantes
    </span>
  );
}
function Logos({ taille = 22 }) {
  return (
    <span style={{ display: 'inline-flex', gap: 5 }} aria-label="Vinted, Leboncoin, Beebs et Depop" role="img">
      {PLATEFORMES.map((k) => (
        <img key={k} src={`/email/logo-${k}.png`} alt="" width={taille} height={taille}
          style={{ borderRadius: taille * 0.26, boxShadow: '0 0 0 1px rgba(16,32,27,0.12)', background: BLANC }} />
      ))}
    </span>
  );
}
// Le relais : ordinateur endormi → FillSell Cloud → tes plateformes (statique, lisible sans animation).
function Relais({ sombre = false }) {
  const encre = sombre ? BLANC : C.tealDeep;
  const trait = sombre ? 'rgba(255,255,255,0.45)' : 'rgba(27,110,98,0.35)';
  const fleche = <span aria-hidden="true" style={{ flex: '1 1 0', height: 2, minWidth: 14, borderRadius: 2, background: trait }} />;
  return (
    <div aria-hidden="true" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ position: 'relative', display: 'inline-flex', opacity: 0.55, color: encre }}>
        <Laptop size={26} strokeWidth={1.8} />
        <Moon size={11} strokeWidth={2.4} style={{ position: 'absolute', top: -4, right: -6 }} />
      </span>
      {fleche}
      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: 19,
        background: sombre ? 'rgba(255,255,255,0.16)' : BLANC, color: encre, boxShadow: sombre ? 'none' : '0 4px 14px -6px rgba(27,110,98,0.45)' }}>
        <Cloud size={21} strokeWidth={2} />
      </span>
      {fleche}
      <Logos taille={20} />
    </div>
  );
}
const bouton = (fond, encre, ombre) => ({
  width: '100%', minHeight: 52, border: 'none', borderRadius: 14, cursor: 'pointer', fontFamily: POLICE,
  fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em', background: fond, color: encre, boxShadow: ombre,
});

// A — TURQUOISE PLEINE : la carte la plus visible de la feuille ; texte blanc sur le dégradé profond (6,1:1 au pire).
function VarianteA() {
  return (
    <section data-carte-cloud="a" style={{ background: DEGRADE_TEAL, color: BLANC, borderRadius: 22, padding: '18px 18px 16px',
      boxShadow: '0 18px 36px -18px rgba(18,76,67,0.65)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700 }}>
          <span style={{ display: 'inline-flex', width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.16)' }}>
            <Cloud size={17} strokeWidth={2.1} aria-hidden="true" />
          </span>
          FillSell Cloud
        </span>
        <Places clair />
      </div>
      <div>
        <h3 style={{ margin: 0, fontSize: 30, lineHeight: 1.05, fontWeight: 700, letterSpacing: '-0.03em' }}>Essai gratuit 7&nbsp;jours</h3>
        <p style={{ margin: '6px 0 0', fontSize: 18, fontWeight: 700, lineHeight: 1.25 }}>Plus besoin d&rsquo;ordinateur</p>
        <p style={{ margin: '6px 0 0', fontSize: 14, lineHeight: 1.45, color: 'rgba(255,255,255,0.92)' }}>
          Tes annonces Vinted, Leboncoin, Beebs et Depop partent de nos serveurs, 24&nbsp;h/24.
        </p>
      </div>
      <button type="button" style={bouton(BLANC, C.tealDeep, '0 10px 22px -10px rgba(0,0,0,0.35)')}>Essayer 7&nbsp;jours</button>
      <p style={{ margin: 0, textAlign: 'center', fontSize: 15, fontWeight: 700, lineHeight: 1.35 }}>
        Puis {PRIX}{MOIS} · sans engagement
        <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'rgba(255,255,255,0.88)', marginTop: 2 }}>On te prévient la veille. Tu l&rsquo;arrêtes en un geste.</span>
      </p>
    </section>
  );
}

// B — MENTHE À LISERÉ + RELAIS : claire et chaleureuse, le relais montre ce que fait le Cloud sans phrase longue.
function VarianteB() {
  return (
    <section data-carte-cloud="b" style={{ background: MENTHE, border: `2px solid ${C.teal}`, borderRadius: 22, padding: '16px 16px 14px',
      display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 14px 30px -20px rgba(27,110,98,0.55)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', color: C.tealDeep, textTransform: 'uppercase' }}>FillSell Cloud</span>
        <Places />
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 30, lineHeight: 1.05, fontWeight: 700, letterSpacing: '-0.03em', color: C.tealDeep }}>Essai gratuit 7&nbsp;jours</span>
      </div>
      <p style={{ margin: '-4px 0 0', fontSize: 18, fontWeight: 700, color: C.ink, lineHeight: 1.25 }}>Plus besoin d&rsquo;ordinateur</p>
      <div style={{ background: BLANC, borderRadius: 16, padding: '12px 12px 10px', border: `1px solid ${C.border}` }}>
        <Relais />
        <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.45, color: C.mute2, fontWeight: 600 }}>
          Publiées, republiées et retirées depuis nos serveurs, 24&nbsp;h/24.
        </p>
      </div>
      <button type="button" style={bouton(DEGRADE_TEAL, BLANC, '0 10px 22px -8px rgba(47,158,144,0.55)')}>Essayer 7&nbsp;jours</button>
      <p style={{ margin: 0, textAlign: 'center', fontSize: 15, fontWeight: 700, color: C.ink, lineHeight: 1.35 }}>
        Puis {PRIX}{MOIS} · sans engagement
        <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: C.mute2, marginTop: 2 }}>On te prévient la veille. Tu l&rsquo;arrêtes en un geste.</span>
      </p>
    </section>
  );
}

// C — LE RELAIS (ADN du bandeau du Tableau) : une bande de couleur avec la scène, puis UN titre où l'essai et le prix
// pèsent pareil (« 7 jours gratuits, puis 24,99 €/mois ») — la plus sûre face à la règle d'Apple sur le montant facturé.
function VarianteC() {
  return (
    <section data-carte-cloud="c" style={{ background: BLANC, borderRadius: 22, overflow: 'hidden', border: `1px solid ${C.border}`,
      boxShadow: '0 18px 36px -20px rgba(16,32,27,0.45)' }}>
      <div style={{ background: DEGRADE_TEAL, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', color: BLANC, textTransform: 'uppercase' }}>Nouveau · FillSell Cloud</span>
          <Places clair />
        </div>
        <Relais sombre />
      </div>
      <div style={{ padding: '14px 16px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 26, lineHeight: 1.12, fontWeight: 700, letterSpacing: '-0.03em', color: C.ink }}>
          <span style={{ color: C.tealDeep }}>7&nbsp;jours gratuits</span>, puis {PRIX}{MOIS}
        </h3>
        <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: C.ink, lineHeight: 1.3 }}>Plus besoin d&rsquo;ordinateur</p>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13.5, lineHeight: 1.4, color: C.ink }}>
          {['Vinted, Leboncoin, Beebs et Depop depuis nos serveurs, 24 h/24', 'Sans engagement : tu l’arrêtes en un geste'].map((t) => (
            <li key={t} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <Check size={15} strokeWidth={2.6} color={C.tealDeep} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />{t}
            </li>
          ))}
        </ul>
        <button type="button" style={bouton(DEGRADE_TEAL, BLANC, '0 10px 22px -8px rgba(47,158,144,0.55)')}>Essayer 7&nbsp;jours</button>
        <p style={{ margin: 0, textAlign: 'center', fontSize: 12.5, fontWeight: 600, color: C.mute2 }}>On te prévient la veille de la fin de l&rsquo;essai.</p>
      </div>
    </section>
  );
}

// Le haut de la vraie feuille (compte Free), pour juger la carte DANS son contexte : la poignée, « Tu es en Free »,
// le titre, l'encadré « Dans tous les forfaits » (celui qu'on voit aujourd'hui juste au-dessus), puis le début de Free.
function Feuille() {
  const Carte = { a: VarianteA, b: VarianteB, c: VarianteC }[variante];
  return (
    <div style={{ minHeight: '100vh', background: 'rgba(16,32,27,0.55)', paddingTop: 34, fontFamily: POLICE }}>
      <div style={{ background: '#EFECE3', borderRadius: '26px 26px 0 0', padding: '10px 16px 30px', minHeight: 'calc(100vh - 34px)', boxSizing: 'border-box' }}>
        <div aria-hidden="true" style={{ width: 40, height: 4, borderRadius: 2, background: '#D8D3C6', margin: '0 auto 14px' }} />
        <span style={{ display: 'inline-block', fontSize: 13, color: C.mute2, border: `1px solid ${C.border}`, background: '#F6F5F1', borderRadius: 999, padding: '6px 12px' }}>Tu es en Free</span>
        <h2 style={{ margin: '12px 0 14px', fontSize: 26, fontWeight: 500, letterSpacing: '-0.02em', color: C.ink, lineHeight: 1.15 }}>Vends plus, en faisant moins.</h2>
        <div style={{ background: '#F6F5F1', border: `1px solid ${C.border}`, borderRadius: 16, padding: '12px 14px', marginBottom: 14 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.12em', color: C.mute2, marginBottom: 6 }}>DANS TOUS LES FORFAITS</div>
          {['Import de tes annonces depuis toutes tes plateformes', 'Publication sur Vinted, Leboncoin, eBay, Beebs & Depop', 'Retrait automatique partout après une vente'].map((t) => (
            <div key={t} style={{ fontSize: 13, color: C.mute2, lineHeight: 1.45, display: 'flex', gap: 8 }}><Check size={13} color={C.tealDeep} style={{ marginTop: 3, flexShrink: 0 }} aria-hidden="true" />{t}</div>
          ))}
        </div>
        <Carte />
        <div style={{ marginTop: 14, background: BLANC, border: `1px solid ${C.border}`, borderRadius: 20, padding: '16px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>Free <span style={{ fontWeight: 500, color: C.mute2, fontSize: 13 }}>ton forfait actuel</span></span>
          <span style={{ fontSize: 22, fontWeight: 700, color: C.ink }}>0 €<span style={{ fontSize: 12, fontWeight: 500, color: C.mute2 }}> /mois</span></span>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('apercu')).render(<Feuille />);
