// ═══════════════════════════════════════════════════════════════════════════
// LE SEUL POINT DE MONTAGE DU CLOUD DANS L'APP (04/10/2026, conception)
// ═══════════════════════════════════════════════════════════════════════════
// App.jsx monte ce composant UNE fois, derrière rien : c'est lui qui regarde
// le drapeau (cloudOfferVisible) — baissé, il ne lit rien, n'écoute rien et ne
// rend rien. Levé, il fait trois choses, et seulement celles-là :
//
//   1. il ÉCOUTE la 2e voie (cloud/offreCloud.js) et la demande gardée par la
//      page /extension, et demande à l'hôte d'ouvrir la feuille des formules
//      interrupteur coché — `onOuvrirOffres(origine)` ;
//   2. la VEILLE de la fin d'essai (ou le jour même), il montre le rappel
//      « Demain, l'option passe à 20 €/mois » — une fois par essai ;
//   3. l'essai FINI et non gardé, il montre ce qui s'arrête et ce qui continue
//      — une fois par essai.
//
// ⛔ Les gestes d'argent (arrêter, ajouter) viennent de l'hôte (`actions`) :
//    ce composant n'appelle aucun paiement. Le drapeau ne se lève pas sans
//    `actions.arreter` (contrôlé par scripts/cloud-ecrans-selftest.mjs).
// ⛔ « Une fois » est une commodité d'AFFICHAGE (localStorage, try/catch) : le
//    rappel par e-mail, lui, relève du serveur — pas de ce composant.
import { useEffect, useRef, useState } from 'react';
import { cloudOfferVisible } from '../config/cloudOffer';
import { useCloudProfil } from './useCloudProfil';
import { ecouterOffreCloud, reprendreDemande } from './offreCloud';
import { rappelVeilleDu } from './regles';
import { RappelVeilleFinEssai, EcranEssaiTermine } from './FinEssaiCloud';
import { nomDuPalier, palierDuProfil } from '../utils/palier';

const dejaVu = (cle) => { try { return localStorage.getItem(cle) === '1'; } catch { return false; } };
const marquerVu = (cle) => { try { localStorage.setItem(cle, '1'); } catch { /* affichage seul */ } };

export default function HoteCloud({ userId, lang = 'fr', onOuvrirOffres, actions = {} }) {
  const visible = cloudOfferVisible(userId);
  const lecture = useCloudProfil(userId, { actif: visible });
  const [ferme, setFerme] = useState(null);
  const ouvrirRef = useRef(onOuvrirOffres);
  useEffect(() => { ouvrirRef.current = onOuvrirOffres; }, [onOuvrirOffres]);

  // 1. La 2e voie, d'où qu'elle vienne.
  useEffect(() => {
    if (!visible || !userId) return undefined;
    const arreter = ecouterOffreCloud((origine) => ouvrirRef.current?.(origine));
    const gardee = reprendreDemande();
    if (gardee) ouvrirRef.current?.(gardee);
    return arreter;
  }, [visible, userId]);

  if (!visible || lecture.etat !== 'ok' || !lecture.cloud) return null;
  const cloud = lecture.cloud;
  // Le palier vient de la MÊME lecture que l'état Cloud (useCloudProfil).
  const nomPalier = nomDuPalier(palierDuProfil(lecture.profil ?? {})) ?? null;
  const cleEssai = cloud.essaiFin ? String(cloud.essaiFin) : 'sans_date';

  // 2. La veille.
  const quand = rappelVeilleDu(cloud, lecture.luLe);
  const cleVeille = `fs_cloud_veille_${userId}_${cleEssai}`;
  if (quand && ferme !== cleVeille && !dejaVu(cleVeille)) {
    return (
      <RappelVeilleFinEssai
        lang={lang} cloud={cloud} quand={quand} nomPalier={nomPalier} actions={actions}
        onFermer={() => { marquerVu(cleVeille); setFerme(cleVeille); lecture.relire(); }}
      />
    );
  }

  // 3. L'après. Pas pour un essai que la personne a ARRÊTÉ elle-même (04/10
  // soir : effet immédiat) — elle vient de lire, dans la confirmation, ce qui
  // change ; lui remontrer une feuille au lancement suivant serait du bruit.
  const cleFin = `fs_cloud_fin_${userId}_${cleEssai}`;
  if (cloud.etat === 'essai_termine' && !cloud.essaiArrete && ferme !== cleFin && !dejaVu(cleFin)) {
    return (
      <EcranEssaiTermine
        lang={lang} nomPalier={nomPalier} actions={actions}
        onFermer={() => { marquerVu(cleFin); setFerme(cleFin); }}
      />
    );
  }
  return null;
}
