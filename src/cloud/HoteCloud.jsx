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
//      « Demain, l'option passe à 24,99 €/mois » — une fois par essai ;
//   3. l'essai FINI et non gardé, il montre ce qui s'arrête et ce qui continue
//      — une fois par essai ;
//   4. (03/11, point 3) le Cloud ARRÊTÉ après paiement (résiliation, impayé) : « FillSell Cloud est arrêté », les
//      tâches repassent par l'extension, reprendre ou installer / ouvrir l'extension — une fois par abonnement ;
//   5. (03/11, point 5) une place libre GARDÉE 24 h à un(e) inscrit(e) de la liste d'attente : un bandeau (la
//      notification push part de la base, push-cloud-place), qui ouvre l'offre.
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
import { rappelVeilleDu, ecranApresCloud, arretEssaiConfirme } from './regles';
import { RappelVeilleFinEssai, EcranEssaiTermine, EcranCloudArrete, BandeauPlaceLibre } from './FinEssaiCloud';
import { useDisponibiliteCloud } from './useDisponibiliteCloud';
import { nomDuPalier, palierDuProfil } from '../utils/palier';

const dejaVu = (cle) => { try { return localStorage.getItem(cle) === '1'; } catch { return false; } };
const marquerVu = (cle) => { try { localStorage.setItem(cle, '1'); } catch { /* affichage seul */ } };

// (07/11 soir) `plateforme` : Capacitor.getPlatform() — la veille dit où arrêter un Cloud pris dans une boutique.
export default function HoteCloud({ userId, lang = 'fr', onOuvrirOffres, actions = {}, plateforme = 'web' }) {
  const visible = cloudOfferVisible(userId);
  const lecture = useCloudProfil(userId, { actif: visible });
  const vente = useDisponibiliteCloud({ actif: Boolean(visible && userId) });
  const [ferme, setFerme] = useState(null);
  // (08/11) La feuille de la veille SUIT un arrêt demandé (boutique ouverte, ou Stripe) : elle reste montée jusqu'à ce
  // que la personne la ferme, même quand l'essai arrêté n'est plus « la veille » — c'est là qu'elle lit la confirmation.
  const [suiviVeille, setSuiviVeille] = useState(null);   // { cle, quand }
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

  if (!visible) return null;
  // 5. La place libre gardée 24 h (liste d'attente) : avant tout le reste, la personne l'attendait.
  const clePlace = `fs_cloud_place_${userId}_${vente.dispo?.notifieLe ?? 'x'}`;   // une fois par notification
  if (vente.dispo?.placePourToi && ferme !== clePlace && !dejaVu(clePlace)) {
    return (
      <BandeauPlaceLibre
        lang={lang}
        onDemarrer={() => { marquerVu(clePlace); setFerme(clePlace); ouvrirRef.current?.('place_liberee'); }}
        onFermer={() => { marquerVu(clePlace); setFerme(clePlace); }}
      />
    );
  }
  if (lecture.etat !== 'ok' || !lecture.cloud) return null;
  const cloud = lecture.cloud;
  // Le palier vient de la MÊME lecture que l'état Cloud (useCloudProfil).
  const nomPalier = nomDuPalier(palierDuProfil(lecture.profil ?? {})) ?? null;
  const cleEssai = cloud.essaiFin ? String(cloud.essaiFin) : 'sans_date';

  // 2. La veille.
  const cleVeille = suiviVeille?.cle ?? `fs_cloud_veille_${userId}_${cleEssai}`;
  const quand = rappelVeilleDu(cloud, lecture.luLe) ?? suiviVeille?.quand ?? null;
  if (quand && ferme !== cleVeille && !dejaVu(cleVeille)) {
    return (
      <RappelVeilleFinEssai
        lang={lang} cloud={cloud} quand={quand} nomPalier={nomPalier} actions={actions}
        canal={lecture.profil?.cloud_canal ?? null} plateforme={plateforme}
        arretConfirme={arretEssaiConfirme(cloud, lecture.profil)} relire={lecture.relire}
        onSuivi={() => setSuiviVeille((s) => s ?? { cle: cleVeille, quand })}
        onFermer={() => { marquerVu(cleVeille); setFerme(cleVeille); setSuiviVeille(null); lecture.relire(); }}
      />
    );
  }

  // 3. L'après. Pas pour un essai que la personne a ARRÊTÉ elle-même (04/10
  // soir : effet immédiat) — elle vient de lire, dans la confirmation, ce qui
  // change ; lui remontrer une feuille au lancement suivant serait du bruit.
  const cleFin = `fs_cloud_fin_${userId}_${cleEssai}`;
  const apres = ecranApresCloud(cloud, lecture.profil, lecture.luLe ?? undefined);
  if (apres === 'essai_termine' && ferme !== cleFin && !dejaVu(cleFin)) {
    return (
      <EcranEssaiTermine
        lang={lang} nomPalier={nomPalier} actions={actions}
        onFermer={() => { marquerVu(cleFin); setFerme(cleFin); }}
      />
    );
  }
  // 4. Le Cloud arrêté après paiement : une fois par abonnement (sa référence).
  const cleArret = `fs_cloud_arret_${userId}_${lecture.profil?.cloud_ref ?? 'sans_ref'}`;
  if (apres === 'arrete' && ferme !== cleArret && !dejaVu(cleArret)) {
    return (
      <EcranCloudArrete
        lang={lang} actions={actions}
        onFermer={() => { marquerVu(cleArret); setFerme(cleArret); }}
      />
    );
  }
  return null;
}
