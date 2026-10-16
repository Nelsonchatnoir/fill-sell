// ═══════════════════════════════════════════════════════════════════════════
// STOCK VIDE — maquette « fillsell-ecrans-vides.html » validée par Nico (16/10)
// ═══════════════════════════════════════════════════════════════════════════
// Le haut de l'écran Stock (titre, synchronisation, gestes, republication,
// « Ajouter un article ») ne change PAS. Seul le bas d'un stock vide change :
//   · le bandeau « stock vide » perd son bouton « Ajouter un article » (le
//     doublon de la carte du haut) : il ne fait plus que dire où arrivera tout ;
//   · « Ce que FillSell fait » : quatre étapes, chacune avec sa scène animée.
// ⚠️ Chaque phrase décrit une capacité RÉELLE (vérifiée dans le code le 16/10) :
//   · étape 3 : la republication tourne sur Vinted, Leboncoin, Beebs et Depop,
//     JAMAIS sur eBay (utils/republication.PLATEFORMES_REPUBLIABLES) ;
//   · étape 4 : le retrait se fait TOUJOURS sur confirmation.
import PlatformLogo from '../../components/platform-logos/PlatformLogo';
import { UI } from '../../components/ui';
import { CSS_ECRANS } from '../animations';
import { Boucle } from '../primitives';
import Icone from '../Icone';

const ENCRE2 = '#5C6560';
const PLATEFORMES = [
  { p: 'vinted', nom: 'Vinted' }, { p: 'leboncoin', nom: 'Leboncoin' }, { p: 'beebs', nom: 'Beebs' },
  { p: 'ebay', nom: 'eBay' }, { p: 'depop', nom: 'Depop' },
];
const PASTILLE = { height: 18, padding: '0 7px 0 3px', borderRadius: 9, background: '#FFFFFF', border: '1px solid #E2DED6', fontSize: 10, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4, color: UI.ink, whiteSpace: 'nowrap' };
const SCENE = { position: 'relative', height: 128, borderRadius: 18, background: '#F2F6F5', overflow: 'hidden' };
const LIGNE_GRISE = { flex: 1, height: 6, borderRadius: 3, background: '#E4E1DA' };

/** Le bandeau d'un stock vide — sans bouton (le seul « Ajouter un article » est en haut). */
export function BandeauStockVide({ lang }) {
  const fr = lang !== 'en';
  return (
    <div style={{ padding: 16, borderRadius: 22, border: '1.5px dashed #CFE0DB', background: '#F0F6F4', display: 'flex', alignItems: 'center', gap: 14 }}>
      <span style={{ width: 44, height: 44, borderRadius: 14, background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
        <Icone nom="colis" taille={22} couleur={UI.tealDeep} epaisseur={1.8} />
      </span>
      <div style={{ fontSize: 14, lineHeight: 1.45, color: '#2F4A45' }}>
        {fr
          ? 'Ton stock est vide. Synchronise tes boutiques ou ajoute un article : tout arrivera ici.'
          : 'Your stock is empty. Sync your shops or add an item: everything will land here.'}
      </div>
    </div>
  );
}

function Etape({ n, titre, texte, children }) {
  return (
    <Boucle style={{ padding: '12px 12px 18px', borderRadius: 26, background: '#FFFFFF', border: `1px solid ${UI.border}`, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {children}
      <div style={{ display: 'flex', gap: 12, padding: '0 6px' }}>
        <span style={{ width: 30, height: 30, borderRadius: 15, background: `linear-gradient(135deg,${UI.teal},${UI.tealDeep})`, color: '#FFFFFF', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>{n}</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: UI.ink }}>{titre}</div>
          <div style={{ fontSize: 14, lineHeight: 1.5, color: ENCRE2 }}>{texte}</div>
        </div>
      </div>
    </Boucle>
  );
}

function Coche({ delai }) {
  return (
    <span className="fsx-pop2" style={{ animationDelay: delai, width: 12, height: 12, borderRadius: 6, background: UI.tealDeep, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <Icone nom="coche" taille={8} couleur="#FFFFFF" epaisseur={4} />
    </span>
  );
}

function Tuile({ p, nom, children, style, className, delai }) {
  return (
    <div className={className} style={{ animationDelay: delai, position: 'relative', height: 48, borderRadius: 12, background: '#FFFFFF', border: '1px solid #E2DED6', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, minWidth: 0, ...style }}>
      <PlatformLogo platform={p} size={14} />
      <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: nom === 'Leboncoin' ? '-0.02em' : 0, color: UI.ink }}>{nom}</span>
      {children}
    </div>
  );
}

export default function CeQueFillSellFait({ lang }) {
  const fr = lang !== 'en';
  return (
    <div className="fsx-ecran" style={{ display: 'flex', flexDirection: 'column', gap: 12, fontFamily: "'Space Grotesk',sans-serif" }}>
      <style>{CSS_ECRANS}</style>
      <div style={{ margin: '18px 0 2px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ flex: 1, height: 1, background: '#E1DDD5' }} />
        <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.14em', color: '#6F7774', whiteSpace: 'nowrap' }}>{fr ? 'CE QUE FILLSELL FAIT' : 'WHAT FILLSELL DOES'}</span>
        <span style={{ flex: 1, height: 1, background: '#E1DDD5' }} />
      </div>

      {/* 1. Les annonces en ligne remontent dans le stock. */}
      <Etape n="1" titre={fr ? 'Synchronise tes boutiques' : 'Sync your shops'}
        texte={fr ? 'Tes annonces déjà en ligne remontent dans ton stock, depuis chacune de tes plateformes.' : 'Your live listings come into your stock, from each of your platforms.'}>
        <div style={SCENE} aria-hidden="true">
          <div style={{ position: 'absolute', left: 12, top: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {PLATEFORMES.map((x) => <span key={x.p} style={PASTILLE}><PlatformLogo platform={x.p} size={12} />{x.nom}</span>)}
          </div>
          <div className="fsx-flot" style={{ position: 'absolute', left: 104, top: 63, width: 46, height: 2 }}><i /></div>
          <div style={{ position: 'absolute', left: 156, right: 12, top: 14, height: 100, borderRadius: 14, background: '#FFFFFF', border: '1px solid #E2DED6', padding: 8, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.1em', color: '#6F7774' }}>{fr ? 'TON STOCK' : 'YOUR STOCK'}</div>
            {[['vinted', '#DCEBE7', '.2s'], ['leboncoin', '#F6E1D3', '.6s'], ['ebay', '#DDE3F8', '1s']].map(([p, fond, d]) => (
              <div key={p} className="fsx-rowIn" style={{ animationDelay: d, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 18, height: 18, borderRadius: 5, background: fond, flex: 'none' }} /><span style={LIGNE_GRISE} /><PlatformLogo platform={p} size={12} />
              </div>
            ))}
          </div>
        </div>
      </Etape>

      {/* 2. Une annonce préparée une fois part sur les cinq. */}
      <Etape n="2" titre={fr ? 'Publie partout' : 'Publish everywhere'}
        texte={fr ? 'Une annonce préparée une fois, déposée sur Vinted, Leboncoin, Beebs, eBay et Depop.' : 'One listing prepared once, posted to Vinted, Leboncoin, Beebs, eBay and Depop.'}>
        <div style={SCENE} aria-hidden="true">
          <div style={{ position: 'absolute', left: 16, top: 24, width: 86, height: 80, borderRadius: 14, background: '#FFFFFF', border: '1px solid #E2DED6', padding: 8, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 6, boxShadow: '0 8px 18px -12px rgba(18,63,56,.4)' }}>
            <span style={{ height: 36, borderRadius: 8, background: 'linear-gradient(135deg,#DCEBE7,#C4DED7)' }} />
            <span style={{ height: 6, borderRadius: 3, background: '#E4E1DA' }} />
            <span style={{ width: '60%', height: 6, borderRadius: 3, background: '#E4E1DA' }} />
          </div>
          <div className="fsx-flot" style={{ position: 'absolute', left: 110, top: 63, width: 56, height: 2 }}><i /></div>
          <div style={{ position: 'absolute', left: 176, top: 9, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {PLATEFORMES.map((x, i) => (
              <span key={x.p} className="fsx-chipOn" style={{ ...PASTILLE, animationDelay: `${i * 0.25}s` }}>
                <PlatformLogo platform={x.p} size={12} />{x.nom}<Coche delai={`${i * 0.25}s`} />
              </span>
            ))}
          </div>
        </div>
      </Etape>

      {/* 3. L'annonce qui dort repasse en tête. */}
      <Etape n="3" titre={fr ? 'Republie ce qui stagne' : 'Repost what stalls'}
        texte={fr
          ? "Une annonce qui dort repasse en tête des résultats, au rythme d'une vraie personne, sur Vinted, Leboncoin, Beebs et Depop (pas sur eBay)."
          : 'A listing that sits climbs back to the top of the results, at a human pace, on Vinted, Leboncoin, Beebs and Depop (not eBay).'}>
        <div style={SCENE} aria-hidden="true">
          <div style={{ position: 'absolute', left: '50%', top: 12, width: 240, height: 104, marginLeft: -120 }}>
            {[['fsx-down1', '#F6E1D3', fr ? 'hier' : 'yesterday'], ['fsx-down2', '#DDE3F8', fr ? 'il y a 3 j' : '3 d ago']].map(([cl, fond, quand]) => (
              <div key={cl} className={cl} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 30, borderRadius: 10, background: '#FFFFFF', border: '1px solid #E2DED6', display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px' }}>
                <span style={{ width: 18, height: 18, borderRadius: 5, background: fond }} /><span style={LIGNE_GRISE} /><span style={{ fontSize: 10, color: '#8A918E' }}>{quand}</span>
              </div>
            ))}
            <div className="fsx-up" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 30, borderRadius: 10, background: '#FFFFFF', border: `1.5px solid ${UI.teal}`, display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px', boxShadow: '0 8px 18px -10px rgba(27,110,98,.55)', zIndex: 2 }}>
              <span style={{ width: 18, height: 18, borderRadius: 5, background: '#DCEBE7' }} /><span style={{ ...LIGNE_GRISE, background: '#CFE3DE' }} />
              <span style={{ position: 'relative', width: 66, height: 14, fontSize: 10, textAlign: 'right' }}>
                <span className="fsx-oldOut" style={{ position: 'absolute', right: 0, top: 0, color: '#8A918E', whiteSpace: 'nowrap' }}>{fr ? 'il y a 2 sem.' : '2 wk ago'}</span>
                <span className="fsx-newIn" style={{ position: 'absolute', right: 0, top: 0, color: UI.tealDeep, fontWeight: 700, whiteSpace: 'nowrap' }}>{fr ? "à l'instant" : 'just now'}</span>
              </span>
            </div>
          </div>
          <span className="fsx-tagIn" style={{ position: 'absolute', right: 22, top: 4, height: 20, padding: '0 8px', borderRadius: 10, background: UI.tealDeep, color: '#FFFFFF', fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4, zIndex: 3 }}>
            <Icone nom="haut" taille={10} couleur="#FFFFFF" epaisseur={3} />{fr ? 'En tête' : 'On top'}
          </span>
        </div>
      </Etape>

      {/* 4. Vendu sur une plateforme : on confirme, les autres se retirent. */}
      <Etape n="4" titre={fr ? 'Vendu quelque part ?' : 'Sold somewhere?'}
        texte={fr
          ? "FillSell repère la vente sur n'importe laquelle de tes plateformes. Tu confirmes, et les autres annonces sont retirées en un tap."
          : 'FillSell spots the sale on any of your platforms. You confirm, and the other listings come down in one tap.'}>
        <div style={{ ...SCENE, padding: 12, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 10 }} aria-hidden="true">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 5 }}>
            {PLATEFORMES.map((x, i) => x.p === 'leboncoin' ? (
              <Tuile key={x.p} p={x.p} nom={x.nom} style={{ background: '#FFF6F0', border: `1.5px solid ${UI.amber}` }}>
                <span className="fsx-vendu" style={{ position: 'absolute', top: -7, left: '50%', marginLeft: -22, width: 44, height: 16, borderRadius: 8, background: UI.amber, color: '#FFFFFF', fontSize: 9, fontWeight: 700, letterSpacing: '.06em', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{fr ? 'VENDU' : 'SOLD'}</span>
              </Tuile>
            ) : (
              <Tuile key={x.p} p={x.p} nom={x.nom} className="fsx-retire" delai={`${(i > 1 ? i - 1 : i) * 0.15}s`}>
                <span className="fsx-barreRetire" style={{ animationDelay: `${(i > 1 ? i - 1 : i) * 0.15}s`, position: 'absolute', left: 8, right: 8, top: '50%', height: 1.5, background: '#6F7774' }} />
              </Tuile>
            ))}
          </div>
          <div style={{ position: 'relative', height: 40 }}>
            <div className="fsx-press" style={{ position: 'absolute', left: '50%', top: 0, width: 196, marginLeft: -98, height: 38, borderRadius: 19, background: UI.ink, color: '#FFFFFF', fontSize: 12.5, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {fr ? 'Retirer les 4 autres' : 'Remove the other 4'}
              <span className="fsx-tap" style={{ position: 'absolute', left: '50%', top: '50%', width: 24, height: 24, margin: '-12px 0 0 -12px', borderRadius: 12, background: '#FFFFFF' }} />
            </div>
            <div className="fsx-doneIn" style={{ position: 'absolute', left: '50%', top: 0, width: 196, marginLeft: -98, height: 38, borderRadius: 19, background: UI.tealDeep, color: '#FFFFFF', fontSize: 12.5, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Icone nom="coche" taille={14} couleur="#FFFFFF" epaisseur={3} />{fr ? 'Annonces retirées' : 'Listings removed'}
            </div>
          </div>
        </div>
      </Etape>
    </div>
  );
}
