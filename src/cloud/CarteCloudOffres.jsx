// ═══════════════════════════════════════════════════════════════════════════
// LA CARTE FILLSELL CLOUD DE LA FEUILLE DES OFFRES — maquette B validée par Nico le 09/11/2026
// ═══════════════════════════════════════════════════════════════════════════
// (maquette : https://claude.ai/artifact/8jv58tceFCDQRSNPFwAT2o, « Menthe à liseré, avec le relais »)
// Constat de Nico : 25 comptes ont ouvert la feuille depuis l'ouverture du Cloud, 0 clic — l'essai n'apparaissait nulle
// part, on lisait d'abord « +24,99 €/mois », un interrupteur gris au lieu d'un bouton, une carte aussi discrète que
// l'encadré du dessus, un texte long. La carte d'aujourd'hui : fond menthe, liseré sarcelle, « Essai gratuit 7 jours » en
// gros, « Plus besoin d'ordinateur », le relais (ordinateur endormi → nuage → Vinted, Leboncoin, Beebs, Depop), UN vrai
// bouton, le prix ENSUITE mais lisible (15 px, gras, encre : la règle d'Apple sur le montant facturé), les places.
// Les RÈGLES ne changent pas : l'essai ne s'annonce que s'il est offert (offre.essai, qui suit la boutique sur mobile) ;
// le prix est celui du canal (jeton PRIX : Stripe sur le web, la boutique sur iPhone/Android, lib/prixBoutique.js) ;
// bouton inactif tant que le prix n'est pas lu (Android) ; vente fermée → « Complet » (BlocCompletCloud) à la place.
// Un seul composant pour les deux voies : compte Free (onEssayer = le Cloud seul) et compte payant (nomPalier fourni,
// onEssayer = l'ajout à la formule). CLAIR uniquement.
import { Cloud, Laptop, Moon } from 'lucide-react';
import { C, MENTHE, BLANC, DEGRADE_TEAL } from './theme';
import { textesCloud } from './textes';
import { useDisponibiliteCloud, venteFermee, placesRestantes, RELECTURE_PLACES_MS } from './useDisponibiliteCloud';
import { BlocCompletCloud } from './InterrupteurCloud';
import { prixPret } from '../lib/prixBoutique';
import { usePrixBoutique } from '../lib/usePrixBoutique';
import { LOGOS_PLATEFORMES } from '../utils/logosPlateformes';

// Les quatre plateformes du Cloud ; les icônes : une seule source (utils/logosPlateformes.js, Beebs du 29/10).
const PLATEFORMES = ['Vinted', 'Leboncoin', 'Beebs', 'Depop'];

function Places({ n, T }) {
  return (
    <span data-cloud="places" aria-live="polite" style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, lineHeight: 1.3, borderRadius: 999,
      padding: '5px 10px', background: BLANC, color: C.tealDeep, border: `1px solid ${C.border}`,
    }}>
      <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 4, background: C.teal, flexShrink: 0 }} />
      {T.placesRestantes(n)}
    </span>
  );
}

// Le relais : ordinateur endormi → FillSell Cloud → tes plateformes. Statique (rien ne bouge : moins d'animations
// respecté d'office), décoratif pour un lecteur d'écran — la phrase dessous dit la même chose.
function Relais() {
  const trait = <span aria-hidden="true" style={{ flex: '1 1 0', height: 2, minWidth: 12, borderRadius: 2, background: 'rgba(27,110,98,0.35)' }} />;
  return (
    <div aria-hidden="true" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ position: 'relative', display: 'inline-flex', opacity: 0.55, color: C.tealDeep, flexShrink: 0 }}>
        <Laptop size={26} strokeWidth={1.8} />
        <Moon size={11} strokeWidth={2.4} style={{ position: 'absolute', top: -4, right: -6 }} />
      </span>
      {trait}
      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: 19, flexShrink: 0,
        background: BLANC, color: C.tealDeep, boxShadow: '0 4px 14px -6px rgba(27,110,98,0.45)' }}>
        <Cloud size={21} strokeWidth={2} />
      </span>
      {trait}
      <span style={{ display: 'inline-flex', gap: 5, flexShrink: 0 }}>
        {PLATEFORMES.map((k) => (
          <img key={k} src={LOGOS_PLATEFORMES[k]} alt="" width={20} height={20} data-logo-plateforme={k}
            style={{ borderRadius: 5, boxShadow: '0 0 0 1px rgba(16,32,27,0.12)', background: BLANC, display: 'block' }} />
        ))}
      </span>
    </div>
  );
}

/**
 * offre     : l'offre Cloud de la feuille ({ mode: 'interrupteur', essai }) — rien rendu hors de ce mode.
 * onEssayer : le geste (Free : le Cloud seul ; payant : l'ajout à la formule). Sans lui, rien n'est rendu.
 * nomPalier : le nom de la formule payante (« Pro »…) — null pour un compte Free.
 */
export default function CarteCloudOffres({ offre, onEssayer, nomPalier = null, lang = 'fr' }) {
  usePrixBoutique({ charger: true });
  const actif = offre?.mode === 'interrupteur' && typeof onEssayer === 'function';
  const vente = useDisponibiliteCloud({ actif, relireToutesLesMs: RELECTURE_PLACES_MS });
  if (!actif) return null;
  const T = textesCloud(lang);
  const essai = offre.essai === true;
  const fermee = venteFermee(vente.dispo);
  const n = placesRestantes(vente.dispo);
  const pret = prixPret('cloud');
  const cta = essai ? T.offresCtaEssai : nomPalier ? T.offresCtaAjout : T.offresCtaFree;
  return (
    <section data-cloud="offre" data-cloud-voie={nomPalier ? 'ajout' : 'free'} aria-label="FillSell Cloud" style={{
      background: MENTHE, border: `2px solid ${C.teal}`, borderRadius: 22, padding: '16px 16px 14px',
      display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 14px 30px -20px rgba(27,110,98,0.55)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', color: C.tealDeep, textTransform: 'uppercase' }}>{T.nom}</span>
        {!fermee && n > 0 && <Places n={n} T={T} />}
      </div>
      {essai && (
        <p data-cloud="essai" style={{ margin: 0, fontSize: 30, lineHeight: 1.05, fontWeight: 700, letterSpacing: '-0.03em', color: C.tealDeep }}>
          {T.offresTitreEssai}
        </p>
      )}
      <p style={{ margin: essai ? '-4px 0 0' : 0, fontSize: essai ? 18 : 24, fontWeight: 700, color: C.ink, lineHeight: 1.25, letterSpacing: essai ? 0 : '-0.02em' }}>
        {T.accroche}
      </p>
      <div style={{ background: BLANC, borderRadius: 16, padding: '12px 12px 10px', border: `1px solid ${C.border}` }}>
        <Relais />
        <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.45, color: C.mute2, fontWeight: 600 }}>{T.offresRelais}</p>
        {nomPalier && <p style={{ margin: '4px 0 0', fontSize: 12.5, lineHeight: 1.4, color: C.mute2, fontWeight: 600 }}>{T.offresEnPlus(nomPalier)}</p>}
      </div>
      {fermee ? (
        <BlocCompletCloud dispo={vente.dispo} onInscrire={vente.inscrire} lang={lang} />
      ) : (
        <>
          <button type="button" onClick={onEssayer} disabled={!pret} style={{
            width: '100%', minHeight: 52, border: 'none', borderRadius: 14, cursor: pret ? 'pointer' : 'default', fontFamily: 'inherit',
            fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em', background: DEGRADE_TEAL, color: BLANC,
            boxShadow: '0 10px 22px -8px rgba(47,158,144,0.55)', opacity: pret ? 1 : 0.55,
          }}>
            {cta}
          </button>
          <p data-cloud="prix" style={{ margin: 0, textAlign: 'center', fontSize: 15, fontWeight: 700, color: C.ink, lineHeight: 1.35 }}>
            {essai ? T.offresPrixEssai : T.offresPrix}
            <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: C.mute2, marginTop: 2 }}>{essai ? T.offresRappel : T.offresArret}</span>
          </p>
        </>
      )}
    </section>
  );
}
