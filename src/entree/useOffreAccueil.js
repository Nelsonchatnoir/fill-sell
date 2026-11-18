// (18/11/2026, lot T1 de Nico) L'offre Cloud de l'accueil, lue une fois, partagée par les écrans de la refonte
// (EtapesAccueil.jsx). La décision est PURE (regles.offreAccueil) ; ce hook ne fait que la brancher sur le contexte.
import { canalDeVente } from '../config/cloudOffer';
import { businessOfferVisible } from '../config/businessOffer';
import { cartesFormulesCloud } from '../cloud/formulesCloud';
import { etatEssaiBoutique } from '../lib/prixBoutique';
import { usePrixBoutique } from '../lib/usePrixBoutique';
import { offreAccueil } from './regles';

/** { carte, essaiPropose, enLecture, raison, modele, formules, cloudSeul, offreCloud } — voir regles.offreAccueil. */
export function useOffreAccueil(c) {
  usePrixBoutique();
  const k = c.formules;
  const formules = k?.parcours === true;
  const palier = c.palier === 'free' ? 'gratuit' : (c.palier ?? 'gratuit');
  const modele = formules ? cartesFormulesCloud({
    palier, canalApp: canalDeVente(c.plateforme), canalAbonnement: null, essaiPermis: k.essaiPermis,
    essaiBoutique: (f) => etatEssaiBoutique(f), businessVisible: businessOfferVisible(c.user?.id ?? null),
  }) : { cartes: [], essaiAffiche: false, founder: false };
  const cloudSeul = !formules && c.cloud?.parcours === true;
  const o = formules ? offreAccueil(modele, k.essaiPermis)
    : { carte: null, essaiPropose: cloudSeul && c.cloud?.offre?.essai === true, enLecture: false, raison: cloudSeul ? (c.cloud?.offre?.essai === true ? null : 'cloud_seul_sans_essai') : 'cloud_absent' };
  return { ...o, modele, formules, cloudSeul, offreCloud: formules || cloudSeul, palier };
}

