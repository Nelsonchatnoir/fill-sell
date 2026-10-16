// Encart Premium des écrans Ventes (16/10, maquette validée par Nico) : carte
// vert foncé, trois avantages, bouton blanc. Il remplace, sur ces écrans,
// PremiumBanner (web) et IAPUpgradeBlock (téléphone) — même geste : le bouton
// ouvre la modale des offres (openUpgradeModal), jamais un achat direct.
// « Restaurer mes achats » n'est plus ici : il vit dans Réglages › Abonnement
// (SousPageAbonnement, téléphone et compte non Premium), comme Apple l'exige.
// Les trois avantages sont ceux du bloc d'offre existant (IAPUpgradeBlock :
// « Plus d'annonces · IA vocale · Stats »).
import Icone, { Couronne } from './Icone';

export default function EncartPremium({ lang, onOffres, desactive = false, libelle = null }) {
  const fr = lang !== 'en';
  const avantages = fr
    ? ["Plus d'annonces chaque mois", 'Ton stock à la voix', 'Statistiques avancées']
    : ['More listings every month', 'Your stock by voice', 'Advanced statistics'];
  return (
    <div style={{ position: 'relative', padding: '22px 20px 20px', borderRadius: 28, background: 'radial-gradient(120% 100% at 100% 0%, #24796B 0%, #123F38 60%, #0E302B 100%)', color: '#FFFFFF', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <span style={{ alignSelf: 'flex-start', height: 26, padding: '0 10px', borderRadius: 13, background: 'rgba(242,211,138,.16)', color: '#F2D38A', fontSize: 11, fontWeight: 700, letterSpacing: '.14em', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <Couronne taille={12} />PREMIUM
      </span>
      <div style={{ fontSize: 22, lineHeight: 1.2, fontWeight: 700, letterSpacing: '-0.015em' }}>{fr ? 'Va plus loin avec FillSell' : 'Go further with FillSell'}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {avantages.map((a) => (
          <div key={a} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14.5, color: '#E2F2EE' }}>
            <span style={{ width: 20, height: 20, borderRadius: 10, background: 'rgba(140,224,212,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
              <Icone nom="coche" taille={11} couleur="#8CE0D4" epaisseur={3.5} />
            </span>{a}
          </div>
        ))}
      </div>
      <button type="button" onClick={onOffres} disabled={desactive}
        style={{ position: 'relative', overflow: 'hidden', marginTop: 4, height: 52, border: 0, borderRadius: 26, background: '#FFFFFF', color: '#123F38', fontFamily: 'inherit', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: desactive ? 'default' : 'pointer', opacity: desactive ? 0.7 : 1 }}>
        {libelle ?? (fr ? 'Voir les offres' : 'See plans')}
        <Icone nom="fleche" taille={18} couleur="#123F38" epaisseur={2.2} />
        <span className="fsx-shine" aria-hidden="true" />
      </button>
      <div style={{ fontSize: 12.5, color: '#A9CFC6', textAlign: 'center' }}>
        {fr ? 'Sans engagement · Résiliable en 1 clic' : 'No commitment · Cancel anytime in 1 click'}
      </div>
    </div>
  );
}
