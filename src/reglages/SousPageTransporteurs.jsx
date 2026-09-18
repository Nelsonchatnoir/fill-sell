// ═══════════════════════════════════════════════════════════════════════════
// RÉGLAGES › EXPÉDITION › MES TRANSPORTEURS (2026-09-18)
// ═══════════════════════════════════════════════════════════════════════════
// Les transporteurs étaient ENFOUIS dans la carte eBay, derrière la checklist
// vendeur : on les sort là où on les cherche, dans EXPÉDITION, à côté de
// l'adresse de remise.
//
// ⛔ AUCUNE LOGIQUE DÉPLACÉE. La politique de livraison eBay (lecture des
// services chez eBay, plafond, prix par transporteur, délai d'expédition,
// écriture de la politique) reste ENTIÈREMENT dans EbayCompteSection : ce
// fichier n'en monte qu'une VUE (`vue="transporteurs"`). Extraire le
// sélecteur aurait demandé d'en sortir l'état eBay — c'est-à-dire de toucher
// la logique, ce que ce lot s'interdit.
import EbayCompteSection from '../components/EbayCompteSection';

export default function SousPageTransporteurs({ c }) {
  return <EbayCompteSection lang={c.lang} user={c.user} vue="transporteurs" />;
}
