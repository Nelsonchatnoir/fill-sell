// ═══════════════════════════════════════════════════════════════════════════
// VENTES VIDE — maquette « fillsell-ecrans-vides.html » validée par Nico (16/10)
// ═══════════════════════════════════════════════════════════════════════════
// Remplace SalesTicker (VentesTab). AUCUNE donnée inventée : la scène animée
// ne montre ni montant ni pourcentage (règle du 09/08, gardée).
// Textes vérifiés dans le code le 16/10 :
//   · les cinq plateformes sont nommées, Depop comprise ; Opla ne l'est plus
//     (quittée le 10/10) ;
//   · « Tes ventes récentes remontent aussi quand tu synchronises tes
//     boutiques » (maquette) est RETIRÉ : seule la synchronisation du dressing
//     Vinted ramène des ventes passées (« ventes Vinted à enregistrer ») ; les
//     relevés Leboncoin, Beebs, eBay et Depop ramènent des annonces, pas des
//     ventes. La phrase aurait été fausse pour quatre plateformes sur cinq ;
//   · le retrait des autres annonces se fait TOUJOURS sur confirmation.
// « Restaurer mes achats » n'est plus sur cet écran : Réglages › Abonnement.
import PlatformLogo from '../../components/platform-logos/PlatformLogo';
import { UI } from '../../components/ui';
import { CSS_ECRANS } from '../animations';
import { Boucle } from '../primitives';
import Icone from '../Icone';
import EncartPremium from '../EncartPremium';

const ENCRE2 = '#5C6560';
const PLATEFORMES = [
  { p: 'vinted', nom: 'Vinted' }, { p: 'leboncoin', nom: 'Leboncoin' }, { p: 'beebs', nom: 'Beebs' },
  { p: 'ebay', nom: 'eBay' }, { p: 'depop', nom: 'Depop' },
];
const TUILE = { position: 'relative', height: 52, borderRadius: 13, background: '#FFFFFF', border: '1px solid #E2DED6', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5, minWidth: 0 };

function Ligne({ icone, fond, couleur, titre, texte, delai, dernier }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderBottom: dernier ? 'none' : '1px solid #EFECE6' }}>
      <span className="fsx-flotte" style={{ animationDelay: delai, width: 42, height: 42, borderRadius: 13, background: fond, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
        <Icone nom={icone} taille={20} couleur={couleur} epaisseur={2.2} />
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 15.5, fontWeight: 700, color: UI.ink }}>{titre}</span>
        <span style={{ fontSize: 13, lineHeight: 1.4, color: ENCRE2 }}>{texte}</span>
      </span>
    </div>
  );
}

export default function VentesVide({ lang, setTab, isPremium = false, onOffres, offresChargement = false, extensionAbsente = false, onExtensionInfo = null }) {
  const fr = lang !== 'en';
  const aller = (i) => { setTab?.(i); try { localStorage.setItem('tab', i); } catch { /* stockage indisponible */ } };
  return (
    <div className="fsx-ecran" style={{ display: 'flex', flexDirection: 'column', fontFamily: "'Space Grotesk',sans-serif", color: UI.ink }}>
      <style>{CSS_ECRANS}</style>

      <Boucle style={{ padding: 16, borderRadius: 28, background: '#FFFFFF', border: `1px solid ${UI.border}`, boxShadow: '0 18px 40px -26px rgba(18,63,56,.3)' }}>
        <div role="img" aria-label={fr ? 'Une vente est repérée sur Leboncoin, les autres annonces sont retirées et la marge se calcule' : 'A sale is spotted on Leboncoin, the other listings are removed and the margin is computed'}
          style={{ position: 'relative', height: 232, borderRadius: 20, background: 'radial-gradient(120% 80% at 50% 0%, #EAF4F1 0%, #F4F2EE 75%)', overflow: 'hidden' }}>
          <div className="fsx-notif" style={{ position: 'absolute', left: 18, right: 18, top: 16, height: 54, borderRadius: 16, background: '#FFFFFF', border: '1px solid #E2DED6', boxShadow: '0 12px 24px -14px rgba(16,32,27,.35)', display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px' }}>
            <span style={{ width: 32, height: 32, borderRadius: 10, background: '#FBEDE4', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
              <Icone nom="cloche" taille={17} couleur="#B4521F" className="fsx-cloche" />
            </span>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{fr ? 'Vendu sur Leboncoin' : 'Sold on Leboncoin'}</span>
              <span style={{ fontSize: 11.5, color: ENCRE2 }}>{fr ? 'Veste en jean · à confirmer' : 'Denim jacket · to confirm'}</span>
            </span>
            <span style={{ fontSize: 11, color: '#8A918E' }}>{fr ? 'maintenant' : 'now'}</span>
          </div>
          <div style={{ position: 'absolute', left: 14, right: 14, top: 92, display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 6 }}>
            {PLATEFORMES.map((x, i) => {
              const k = i > 1 ? i - 1 : i;
              if (x.p === 'leboncoin') return (
                <div key={x.p} style={{ ...TUILE, borderWidth: 1.5 }}>
                  <span className="fsx-cadre" style={{ position: 'absolute', inset: -1.5, borderRadius: 13, border: `1.5px solid ${UI.amber}`, background: 'rgba(255,246,240,.9)' }} />
                  <span style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                    <PlatformLogo platform={x.p} size={14} />
                    <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '-0.02em' }}>{x.nom}</span>
                  </span>
                  <span className="fsx-vendu7" style={{ position: 'absolute', top: -8, left: '50%', marginLeft: -23, width: 46, height: 17, borderRadius: 9, background: UI.amber, color: '#FFFFFF', fontSize: 9, fontWeight: 700, letterSpacing: '.06em', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{fr ? 'VENDU' : 'SOLD'}</span>
                </div>
              );
              return (
                <div key={x.p} className="fsx-retire7" style={{ ...TUILE, animationDelay: `${k * 0.15}s` }}>
                  <PlatformLogo platform={x.p} size={14} />
                  <span style={{ fontSize: 10, fontWeight: 600 }}>{x.nom}</span>
                  <span className="fsx-barre7" style={{ animationDelay: `${k * 0.15}s`, position: 'absolute', left: 8, right: 8, top: '50%', height: 1.5, background: '#6F7774' }} />
                </div>
              );
            })}
          </div>
          <div className="fsx-marge" style={{ position: 'absolute', left: 18, right: 18, bottom: 16, padding: '12px 14px', borderRadius: 16, background: '#123F38', color: '#FFFFFF', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700 }}>
                <Icone nom="courbe" taille={15} couleur="#8CE0D4" epaisseur={2.4} />{fr ? 'Marge calculée' : 'Margin computed'}
              </span>
              <span style={{ fontSize: 11, color: '#B9DDD4' }}>{fr ? 'vente − achat − frais' : 'sale − cost − fees'}</span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,.14)', overflow: 'hidden' }}>
              <div className="fsx-remplit" style={{ height: 6, borderRadius: 3, background: `linear-gradient(90deg, #8CE0D4, ${UI.teal})` }} />
            </div>
          </div>
        </div>
      </Boucle>

      <h1 style={{ margin: '26px 8px 0', fontSize: 26, lineHeight: 1.15, fontWeight: 700, letterSpacing: '-0.02em', textAlign: 'center', color: UI.ink }}>
        {fr ? "Aucune vente pour l'instant" : 'No sales yet'}
      </h1>
      <p style={{ margin: '12px 8px 0', fontSize: 15, lineHeight: 1.5, color: ENCRE2, textAlign: 'center' }}>
        {fr
          ? "Dès qu'un article part sur Vinted, Leboncoin, Beebs, eBay ou Depop, il arrive ici avec ta marge, et FillSell te propose de retirer les autres annonces."
          : 'As soon as an item sells on Vinted, Leboncoin, Beebs, eBay or Depop, it lands here with your margin, and FillSell offers to remove the other listings.'}
      </p>

      <button type="button" onClick={() => aller(1)}
        style={{ margin: '20px 0 0', height: 54, border: 0, borderRadius: 27, background: `linear-gradient(135deg,${UI.teal},${UI.tealDeep})`, color: '#FFFFFF', fontFamily: 'inherit', fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: '0 10px 24px -10px rgba(27,110,98,.6)', cursor: 'pointer', width: '100%' }}>
        {fr ? 'Voir mon stock' : 'See my stock'}<Icone nom="fleche" taille={18} couleur="#FFFFFF" epaisseur={2.2} />
      </button>

      {extensionAbsente && (
        <p style={{ margin: '12px 4px 0', fontSize: 12, lineHeight: 1.5, color: ENCRE2, fontWeight: 500, textAlign: 'center' }}>
          {fr
            ? "L'extension n'est pas encore installée sur ton ordinateur — c'est elle qui publie pour toi. "
            : "The extension isn't installed on your computer yet — it's what publishes for you. "}
          <button type="button" onClick={() => onExtensionInfo?.()} style={{ background: 'none', border: 'none', padding: 0, fontSize: 12, fontWeight: 700, color: UI.tealDeep, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit' }}>
            {fr ? 'Installer' : 'Install'}
          </button>
        </p>
      )}

      <div style={{ margin: '30px 0 12px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ flex: 1, height: 1, background: '#E1DDD5' }} />
        <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.14em', color: '#6F7774', whiteSpace: 'nowrap' }}>{fr ? 'À CHAQUE VENTE' : 'ON EVERY SALE'}</span>
        <span style={{ flex: 1, height: 1, background: '#E1DDD5' }} />
      </div>
      <Boucle style={{ borderRadius: 24, background: '#FFFFFF', border: `1px solid ${UI.border}`, overflow: 'hidden' }}>
        <Ligne icone="loupe" fond="#E6F1EE" couleur={UI.tealDeep} delai="0s"
          titre={fr ? 'On repère la vente' : 'We spot the sale'} texte={fr ? 'Tes plateformes sont surveillées.' : 'Your platforms are watched.'} />
        <Ligne icone="poubelle" fond="#FBEDE4" couleur="#B4521F" delai=".4s"
          titre={fr ? 'Tu retires les autres' : 'You remove the rest'} texte={fr ? 'En un tap, et seulement si tu confirmes.' : 'One tap, and only if you confirm.'} />
        <Ligne icone="courbe" fond="#E6F1EE" couleur={UI.tealDeep} delai=".8s" dernier
          titre={fr ? 'Ta marge se calcule' : 'Your margin computes'} texte={fr ? "Prix de vente moins prix d'achat et frais." : 'Sale price minus purchase price and fees.'} />
      </Boucle>

      <button type="button" onClick={() => aller(4)}
        style={{ margin: '12px 0 0', height: 52, borderRadius: 26, border: '1.5px solid #CFE0DB', background: '#FFFFFF', color: UI.tealDeep, fontFamily: 'inherit', fontSize: 15.5, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, cursor: 'pointer', width: '100%' }}>
        <Icone nom="barres" taille={18} couleur={UI.tealDeep} />{fr ? 'Voir mes statistiques' : 'See my statistics'}
      </button>

      {!isPremium && (
        <div style={{ marginTop: 20 }}>
          <EncartPremium lang={lang} onOffres={onOffres} desactive={offresChargement} />
        </div>
      )}
    </div>
  );
}
