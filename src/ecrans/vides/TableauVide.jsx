// ═══════════════════════════════════════════════════════════════════════════
// TABLEAU VIDE — maquette « fillsell-ecrans-vides.html » validée par Nico (16/10)
// ═══════════════════════════════════════════════════════════════════════════
// Remplace l'ancien état vide centré sur Vinted (« Tes annonces Vinted
// remontent ici — et repartent sur Leboncoin, Beebs et eBay »). L'en-tête et la
// barre d'onglets de la maquette ne sont que du décor : ceux de l'app restent.
// Gestes INCHANGÉS : « Synchroniser mes boutiques » mène au Stock (sa carte de
// synchronisation), « Ajouter mon premier article » et la carte Lens ouvrent
// Lens — les mêmes appels qu'avant (onImport, onOpenLens).
// Textes vérifiés dans le code le 16/10 :
//   · relevé et publication : les CINQ plateformes, Depop comprise ;
//   · republication : Vinted, Leboncoin, Beebs et Depop — JAMAIS eBay
//     (utils/republication.PLATEFORMES_REPUBLIABLES) ;
//   · retrait : toujours sur confirmation (« tu confirmes »), jamais seul.
import PlatformLogo from '../../components/platform-logos/PlatformLogo';
import { UI } from '../../components/ui';
import { COULEUR_PLATEFORME } from '../../utils/ventesStats';
import { CSS_ECRANS } from '../animations';
import { Boucle } from '../primitives';
import Icone from '../Icone';

const ENCRE2 = '#5C6560';
const MENTHE = '#E6F1EE';
const PECHE = '#FBEDE4';
const PECHE_ENCRE = '#B4521F';
const CARTE = { background: '#FFFFFF', border: `1px solid ${UI.border}` };

// Le hub : chaque plateforme, son centre (repère 310 × 230) et sa coche.
const HUB = [
  { p: 'vinted', nom: 'Vinted', cx: 155, cy: 22, coche: [199, 10] },
  { p: 'leboncoin', nom: 'Leboncoin', cx: 262, cy: 78, coche: [306, 66] },
  { p: 'beebs', nom: 'Beebs', cx: 232, cy: 200, coche: [276, 188] },
  { p: 'ebay', nom: 'eBay', cx: 78, cy: 200, coche: [122, 188] },
  { p: 'depop', nom: 'Depop', cx: 48, cy: 78, coche: [92, 66] },
];
const LARGEUR_PILULE = 96;

function HubPlateformes({ fr }) {
  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 310, margin: '0 auto' }}>
      <svg viewBox="0 0 310 230" width="100%" style={{ display: 'block', overflow: 'visible' }} role="img"
        aria-label={fr ? 'Tes annonces remontent de chaque plateforme vers FillSell, puis repartent sur toutes' : 'Your listings come up from each platform to FillSell, then go back out to all of them'}>
        <defs>
          <linearGradient id="fsx-hub" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={UI.teal} /><stop offset="1" stopColor={UI.tealDeep} /></linearGradient>
          <radialGradient id="fsx-halo"><stop offset="0" stopColor={UI.teal} stopOpacity=".22" /><stop offset="1" stopColor={UI.teal} stopOpacity="0" /></radialGradient>
        </defs>
        <circle cx="155" cy="112" r="92" fill="url(#fsx-halo)" />
        <g fill="none" stroke="#BFDCD5" strokeWidth="1.6" strokeLinecap="round">
          {HUB.map((h) => <path key={h.p} className="fsx-flux" d={`M${h.cx} ${h.cy} L155 112`} />)}
        </g>
        {/* 1. Les annonces remontent (points teal), 2. elles repartent (points aux couleurs de chaque plateforme). */}
        {HUB.map((h, i) => (
          <circle key={`m-${h.p}`} className="fsx-monte" r="4.5" fill={UI.teal}
            style={{ '--x': `${h.cx}px`, '--y': `${h.cy}px`, animationDelay: `${(i * 0.15).toFixed(2)}s` }} />
        ))}
        {HUB.map((h, i) => (
          <circle key={`r-${h.p}`} className="fsx-repart" r="4.5" fill={COULEUR_PLATEFORME[h.p]}
            style={{ '--x': `${h.cx}px`, '--y': `${h.cy}px`, animationDelay: `${(i * 0.12).toFixed(2)}s` }} />
        ))}
        <circle className="fsx-onde" cx="155" cy="112" r="40" fill="none" stroke={UI.teal} strokeWidth="2" />
        <rect x="117" y="74" width="76" height="76" rx="22" fill="url(#fsx-hub)" />
        <rect x="117.5" y="74.5" width="75" height="75" rx="21.5" fill="none" stroke="#FFFFFF" strokeOpacity=".18" />
        <g transform="translate(137 94) scale(1.5)" fill="none" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><path d="M3.3 7 12 12l8.7-5" /><path d="M12 22V12" />
        </g>
        {/* Les pastilles : le VRAI logo de chaque plateforme (PlatformLogo). */}
        {HUB.map((h) => (
          <foreignObject key={`p-${h.p}`} x={h.cx - LARGEUR_PILULE / 2} y={h.cy - 15} width={LARGEUR_PILULE} height="30">
            <div xmlns="http://www.w3.org/1999/xhtml" style={{ boxSizing: 'border-box', height: 30, borderRadius: 15, background: '#FFFFFF', border: '1px solid #E2DED6', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '0 8px', fontFamily: "'Space Grotesk',sans-serif", fontSize: 11.5, fontWeight: 600, color: UI.ink, whiteSpace: 'nowrap' }}>
              <PlatformLogo platform={h.p} size={16} />{h.nom}
            </div>
          </foreignObject>
        ))}
        {HUB.map((h, i) => (
          <g key={`c-${h.p}`} className="fsx-coche" style={{ animationDelay: `${(i * 0.12).toFixed(2)}s`, transformBox: 'fill-box', transformOrigin: 'center' }}>
            <circle cx={h.coche[0]} cy={h.coche[1]} r="8" fill={UI.tealDeep} />
            <path d={`M${h.coche[0] - 3.5} ${h.coche[1]} l2.4 2.4 4.4-4.6`} fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        ))}
      </svg>
    </div>
  );
}

function Legende({ n, children, className }) {
  return (
    <div className={className} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: UI.tealDeep }}>
      <span style={{ width: 20, height: 20, borderRadius: 10, background: MENTHE, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>{n}</span>{children}
    </div>
  );
}

function Tuile({ icone, fond, titre, texte }) {
  return (
    <div style={{ ...CARTE, padding: 16, borderRadius: 22, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      <div style={{ width: 42, height: 42, borderRadius: 13, background: fond, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>{icone}</div>
      <div style={{ fontSize: 15, lineHeight: 1.25, fontWeight: 700, color: UI.ink }}>{titre}</div>
      <div style={{ fontSize: 13, lineHeight: 1.45, color: ENCRE2 }}>{texte}</div>
    </div>
  );
}

export default function TableauVide({ lang, onImport, onOpenLens, extensionAbsente = false, onExtensionInfo = null }) {
  const fr = lang !== 'en';
  const boutonPrincipal = { height: 54, border: 0, borderRadius: 27, background: `linear-gradient(135deg,${UI.teal},${UI.tealDeep})`, color: '#FFFFFF', fontFamily: 'inherit', fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: '0 10px 24px -10px rgba(27,110,98,.6)', cursor: 'pointer', width: '100%' };
  return (
    <div className="fsx-ecran" style={{ display: 'flex', flexDirection: 'column', fontFamily: "'Space Grotesk',sans-serif", color: UI.ink }}>
      <style>{CSS_ECRANS}</style>

      <Boucle style={{ ...CARTE, padding: '24px 20px', borderRadius: 28, boxShadow: '0 1px 0 rgba(16,32,27,.03), 0 18px 40px -24px rgba(18,63,56,.25)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 30, padding: '0 14px', borderRadius: 15, background: PECHE, color: '#A9481C', fontSize: 11.5, fontWeight: 700, letterSpacing: '.12em', whiteSpace: 'nowrap' }}>
          <span className="fsx-blink" style={{ width: 7, height: 7, borderRadius: 4, background: UI.amber }} />
          {fr ? 'STOCK VIDE · À TOI DE JOUER' : 'EMPTY STOCK · YOUR MOVE'}
        </div>
        <HubPlateformes fr={fr} />
        <div style={{ position: 'relative', width: '100%', height: 22, marginTop: -6 }}>
          <Legende n="1" className="fsx-capA">{fr ? 'Tes annonces remontent ici' : 'Your listings come up here'}</Legende>
          <Legende n="2" className="fsx-capB">{fr ? 'Elles repartent partout' : 'They go back out everywhere'}</Legende>
        </div>
        <h1 style={{ margin: '2px 0 0', fontSize: 28, lineHeight: 1.12, fontWeight: 700, letterSpacing: '-0.02em', textAlign: 'center', color: UI.ink }}>
          {fr ? 'Tout ton stock, sur toutes tes plateformes.' : 'All your stock, on all your platforms.'}
        </h1>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: ENCRE2, textAlign: 'center' }}>
          {fr
            ? 'Tes annonces Vinted, Leboncoin, Beebs, eBay et Depop remontent ici. Tu les prépares une fois, elles repartent partout.'
            : 'Your Vinted, Leboncoin, Beebs, eBay and Depop listings come up here. Prepare them once, they go back out everywhere.'}
        </p>
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
          <button type="button" onClick={onImport} style={boutonPrincipal}>
            <Icone nom="synchro" taille={18} couleur="#FFFFFF" epaisseur={2.2} />
            {fr ? 'Synchroniser mes boutiques' : 'Sync my shops'}
          </button>
          <button type="button" onClick={onOpenLens} style={{ height: 54, border: `1px solid #E3DED4`, borderRadius: 27, background: '#F3F0EA', color: UI.ink, fontFamily: 'inherit', fontSize: 16, fontWeight: 600, cursor: 'pointer', width: '100%' }}>
            {fr ? 'Ajouter mon premier article' : 'Add my first item'}
          </button>
        </div>
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.45, color: ENCRE2, textAlign: 'center' }}>
          {fr
            ? "Tu pilotes depuis ton téléphone, l'extension FillSell s'occupe des plateformes sur ton ordinateur."
            : 'You steer from your phone, the FillSell extension handles the platforms on your computer.'}
        </p>
      </Boucle>

      <div style={{ margin: '28px 0 14px', fontSize: 11.5, fontWeight: 700, letterSpacing: '.14em', color: '#6F7774', textAlign: 'center' }}>
        {fr ? 'CE QUE TU PEUX FAIRE DÈS MAINTENANT' : 'WHAT YOU CAN DO RIGHT NOW'}
      </div>

      {/* Carte Lens — entière cliquable, comme avant (même geste que la barre d'onglets). */}
      <Boucle role="button" tabIndex={0} onClick={onOpenLens} onKeyDown={(e) => { if (e.key === 'Enter') onOpenLens?.(); }}
        style={{ ...CARTE, borderRadius: 28, overflow: 'hidden', boxShadow: '0 18px 40px -26px rgba(18,63,56,.3)', cursor: 'pointer' }}>
        <div style={{ position: 'relative', height: 200, background: `radial-gradient(120% 90% at 50% 0%, #1E6A5E 0%, #123F38 70%)` }}>
          <div style={{ position: 'absolute', top: 14, left: 14, display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 12px', borderRadius: 14, background: 'rgba(255,255,255,.12)', color: '#DDF2EC', fontSize: 11.5, fontWeight: 700, letterSpacing: '.12em' }}>
            <Icone nom="lens" taille={14} couleur="#DDF2EC" />LENS
          </div>
          <div style={{ position: 'absolute', left: '50%', top: 30, width: 150, height: 140, marginLeft: -75 }}>
            {[['left', 'top'], ['right', 'top'], ['left', 'bottom'], ['right', 'bottom']].map(([h, v]) => (
              <div key={h + v} style={{ position: 'absolute', [h]: 0, [v]: 0, width: 26, height: 26, [`border${h === 'left' ? 'Left' : 'Right'}`]: '3px solid #8CE0D4', [`border${v === 'top' ? 'Top' : 'Bottom'}`]: '3px solid #8CE0D4', [`border${v === 'top' ? 'Top' : 'Bottom'}${h === 'left' ? 'Left' : 'Right'}Radius`]: 10 }} />
            ))}
            <div className="fsx-fadeObj" style={{ position: 'absolute', left: '50%', top: '50%', width: 64, height: 64, margin: '-32px 0 0 -32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icone nom="tshirt" taille={58} couleur="#BFE7DD" epaisseur={1.2} />
            </div>
            <div className="fsx-scan" style={{ position: 'absolute', left: -12, right: -12, top: 31, height: 2, background: 'linear-gradient(90deg, rgba(140,224,212,0), #8CE0D4, rgba(140,224,212,0))', boxShadow: '0 0 14px 2px rgba(140,224,212,.55)' }} />
          </div>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 12, display: 'flex', justifyContent: 'center', gap: 6 }}>
            {[[fr ? "Levi's" : "Levi's", '#FFFFFF', '#123F38', 600, '.6s'], [fr ? 'Très bon état' : 'Very good', '#FFFFFF', '#123F38', 600, '.9s'], [fr ? 'Prix estimé' : 'Estimated price', '#F7C8AD', '#5B2509', 700, '1.2s']].map(([t, bg, c, w, d]) => (
              <span key={t} className="fsx-pop" style={{ animationDelay: d, height: 26, padding: '0 10px', borderRadius: 13, background: bg, color: c, fontSize: 12, fontWeight: w, display: 'inline-flex', alignItems: 'center' }}>{t}</span>
            ))}
          </div>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 23, lineHeight: 1.18, fontWeight: 700, letterSpacing: '-0.015em', color: UI.ink }}>
            {fr ? "Prends une photo, l'annonce est écrite" : 'Take a photo, the listing is written'}
          </h2>
          <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.5, color: ENCRE2 }}>
            {fr
              ? "L'IA reconnaît ton article, estime son prix et rédige l'annonce pour chacune de tes plateformes."
              : 'The AI recognises your item, estimates its price and writes the listing for each of your platforms.'}
          </p>
          <button type="button" onClick={(e) => { e.stopPropagation(); onOpenLens?.(); }} style={{ ...boutonPrincipal, marginTop: 8, height: 52, borderRadius: 26 }}>
            <Icone nom="ia" taille={18} couleur="#FFFFFF" />
            {fr ? "Analyser avec l'IA" : 'Analyze with AI'}
          </button>
        </div>
      </Boucle>

      <Boucle style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
        <Tuile fond={MENTHE} icone={<Icone nom="synchro" taille={22} couleur={UI.tealDeep} className="fsx-spin" />}
          titre={fr ? 'Republication automatique' : 'Automatic reposting'}
          texte={fr
            ? "Une annonce qui dort repasse en tête, au rythme d'une vraie personne, sur Vinted, Leboncoin, Beebs et Depop."
            : 'A listing that sits climbs back to the top, at a human pace, on Vinted, Leboncoin, Beebs and Depop.'} />
        <Tuile fond={PECHE} icone={<Icone nom="cloche" taille={22} couleur={PECHE_ENCRE} className="fsx-sonne" />}
          titre={fr ? 'Vendu ? Le reste se retire' : 'Sold? The rest comes down'}
          texte={fr ? 'FillSell repère la vente. Tu confirmes, les autres annonces partent en un tap.' : 'FillSell spots the sale. You confirm, the other listings go in one tap.'} />
        <Tuile fond={MENTHE} icone={[16, 22, 12, 19].map((h, i) => (
          <span key={i} className="fsx-barre" style={{ width: 3, height: h, borderRadius: 2, background: UI.tealDeep, animationDelay: `${i * 0.15}s` }} />
        ))}
          titre={fr ? 'Ton stock à la voix' : 'Your stock by voice'}
          texte={fr ? 'Dis « pull Zara taille M, 15 € » : c’est ajouté et classé.' : 'Say “Zara sweater size M, €15”: it’s added and sorted.'} />
        <Tuile fond={MENTHE} icone={(
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={UI.tealDeep} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 3v18h18" strokeOpacity=".45" /><path className="fsx-trace" d="M7 15l4-4 3 3 5-6" />
          </svg>
        )}
          titre={fr ? 'Tes marges suivies' : 'Your margins tracked'}
          texte={fr ? 'Dis « vendu 25 € » : la vente et ta marge sont enregistrées.' : 'Say “sold for €25”: the sale and your margin are saved.'} />
      </Boucle>

      {/* Ligne discrète, non bloquante (lot 2, gardée) : l'extension n'a jamais été vue sur ce compte. */}
      {extensionAbsente && (
        <p style={{ margin: '16px 4px 0', fontSize: 12, lineHeight: 1.5, color: ENCRE2, fontWeight: 500, textAlign: 'center' }}>
          {fr
            ? "L'extension n'est pas encore installée sur ton ordinateur — c'est elle qui publie pour toi. "
            : "The extension isn't installed on your computer yet — it's what publishes for you. "}
          <button type="button" onClick={onExtensionInfo} style={{ background: 'none', border: 'none', padding: 0, fontSize: 12, fontWeight: 700, color: UI.tealDeep, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit' }}>
            {fr ? 'Installer' : 'Install'}
          </button>
        </p>
      )}
    </div>
  );
}
