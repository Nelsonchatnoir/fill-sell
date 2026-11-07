// ═══════════════════════════════════════════════════════════════════════════
// PARCOURS D'ENTRÉE — LA VOIE FILLSELL CLOUD, MONTÉE PAR LE CONTEXTE (04/11/2026, lot 3)
// ═══════════════════════════════════════════════════════════════════════════
// Ce que les étapes « Comment tu veux publier ? », « Rien à payer avant le… »
// et « Connecte tes comptes » LISENT. Tout passe par les chemins Cloud qui
// existent déjà — aucun fichier de src/cloud/ n'est modifié :
//   · l'état de l'option : useCloudProfil + voieCloud (comme VoieSansOrdinateur) ;
//   · la vente possible / la liste d'attente : useDisponibiliteCloud ;
//   · l'ACHAT de l'essai : `essaiCloud(origine)`, passé par App.jsx — c'est
//     achatCloud.acheter (cloud/achatCloud.js : conditions, place réservée,
//     Stripe ou boutique, on ne croit que le serveur). Aucun paiement ici ;
//   · les connexions : les mêmes lectures que l'écran « Me connecter »
//     (cloud_coffre_etat_moi, ebay-account, platform_settings / cloud_voie) et
//     ses fonctions pures (cloud/executant.js).
//
// ⛔ FERMÉ = RIEN NE PART. `ouvert` exige le téléphone, cloudOfferVisible(userId)
//    et l'achat fourni par l'hôte : faux pour tous les comptes ordinaires le
//    04/11 (CLOUD_OFFER_ENABLED = false, aucun témoin) — aucune requête, aucun
//    état, le parcours d'avant.
// ⛔ Aucune relecture en boucle : une lecture à l'ouverture de l'étape des
//    connexions, une après chaque page de connexion refermée.
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { cloudOffreVendable, CLOUD_PLATEFORMES_CONNEXION } from '../config/cloudOffer';
import { useCloudProfil } from '../cloud/useCloudProfil';
import { useDisponibiliteCloud, venteFermee, placesRestantes, RELECTURE_PLACES_MS } from '../cloud/useDisponibiliteCloud';
import { voieCloud } from '../cloud/regles';
import { textesConnexion } from '../cloud/textesConnexion';
import { etatConnexion, verificationsCloud, connectesIsoles } from '../cloud/executant';
import { lireEtatEbay, ebayVoieApiDuCompte } from '../utils/ebayCompte';
import { parcoursCloud, datesEssai, dateCourte } from './regles';

const CX_LECTURE = Object.freeze({ etat: 'lecture', etats: null, verifs: [], isoles: [], ebayRelie: null });

export function useCloudEntree({ userId, lang, surTelephone, voie, essaiCloud, plateformesFermees = [] }) {
  const ouvert = Boolean(surTelephone && userId && typeof essaiCloud === 'function' && cloudOffreVendable(userId));
  const lecture = useCloudProfil(userId, { actif: ouvert });
  // (07/11) Le compteur de places se relit seul (relecture bornée) tant que l'option n'est pas prise.
  const dejaActif = lecture.etat === 'ok' && lecture.cloud?.actif === true;
  const vente = useDisponibiliteCloud({ actif: ouvert, relireToutesLesMs: ouvert && !dejaActif ? RELECTURE_PLACES_MS : null });
  const relireCloud = lecture.relire;
  const relireVente = vente.relire;
  const [achat, setAchat] = useState({ etat: 'repos', message: null });
  const enVolRef = useRef(false);
  // L'horloge de l'écran, figée au montage (comme CarteVoieCloud) : la date
  // promise ne bouge pas sous les yeux, et le rendu reste pur.
  const [horloge] = useState(() => Date.now());

  const actifLu = lecture.etat === 'ok' && lecture.cloud?.actif === true;
  const actif = actifLu || achat.etat === 'actif' || achat.etat === 'deja';
  const parcours = parcoursCloud({ ouvert, lecture, voie, actif });

  // ── L'ACHAT DE L'ESSAI — le chemin existant, rien d'autre ─────────────────
  const lancerEssai = useCallback(async () => {
    if (enVolRef.current || typeof essaiCloud !== 'function') return null;
    enVolRef.current = true;
    setAchat({ etat: 'en_cours', message: null });
    let r = null;
    try { r = await essaiCloud('entree_cloud'); }
    catch (e) {
      console.warn('[entree] essai Cloud :', e?.message ?? e);
      r = { etat: 'erreur', message: textesConnexion(lang).achatEchec };
    }
    enVolRef.current = false;
    const etat = r?.etat ?? 'erreur';
    setAchat(etat === 'annule' ? { etat: 'repos', message: null } : { etat, message: r?.message ?? null });
    // Le serveur a bougé (option active, paiement reçu, inscription en liste
    // d'attente) : UNE relecture, jamais une boucle.
    if (etat === 'actif' || etat === 'deja' || etat === 'attente') relireCloud();
    if (etat === 'attente') relireVente();
    return etat;
  }, [essaiCloud, lang, relireCloud, relireVente]);

  // ── LES CONNEXIONS — les lectures de « Me connecter », à l'étape seulement ─
  const connexionsActives = Boolean(parcours && voie === 'cloud' && actif && userId);
  const [cx, setCx] = useState(CX_LECTURE);
  const vivantRef = useRef(true);
  useEffect(() => {
    vivantRef.current = true;
    return () => { vivantRef.current = false; };
  }, []);
  const relireConnexions = useCallback(() => {
    if (!userId) return;
    Promise.all([
      Promise.resolve().then(() => supabase.rpc('cloud_coffre_etat_moi'))
        .then(({ data, error }) => (error ? 'echec' : (data ?? {})), () => 'echec'),
      // eBay : la connexion OFFICIELLE (API), lue comme « Me connecter » la lit.
      Promise.resolve().then(() => lireEtatEbay())
        .then((r) => ebayVoieApiDuCompte(r?.etat ?? null) === true, () => null),
      Promise.resolve().then(() => supabase.from('profiles').select('platform_settings, cloud_voie').eq('id', userId).maybeSingle())
        .then(({ data }) => data ?? null, () => null),
    ]).then(([etats, ebayRelie, profil]) => {
      if (!vivantRef.current) return;
      setCx({
        etat: etats === 'echec' ? 'echec' : 'ok',
        etats: etats === 'echec' ? null : etats,
        ebayRelie,
        verifs: verificationsCloud({ cloudVoie: profil?.cloud_voie === true, platformSettings: profil?.platform_settings ?? null, plateformes: CLOUD_PLATEFORMES_CONNEXION }),
        isoles: connectesIsoles(profil?.platform_settings ?? null),
      });
    }).catch(() => { if (vivantRef.current) setCx({ ...CX_LECTURE, etat: 'echec' }); });
  }, [userId]);
  useEffect(() => {
    if (!connexionsActives) return undefined;
    const t = setTimeout(relireConnexions, 0);   // la lecture part hors du rendu de l'effet
    return () => clearTimeout(t);
  }, [connexionsActives, relireConnexions]);

  // Mêmes règles d'état que MeConnecterCloud : connectée (ou connectée dans son
  // navigateur réservé), à reconnecter, à connecter, ou en vérification.
  const lignes = CLOUD_PLATEFORMES_CONNEXION.filter((p) => !plateformesFermees.includes(p.id)).map((p) => {
    const e = etatConnexion(cx.etats?.[p.id]);
    const isole = cx.isoles.includes(p.id) && e !== 'connecte';
    return { id: p.id, nom: p.nom, etat: e === 'connecte' || isole ? 'connecte' : e, verif: cx.verifs.find((x) => x.id === p.id)?.etat ?? null };
  });

  const essaiFin = lecture.etat === 'ok' && lecture.cloud?.etat === 'essai' ? lecture.cloud.essaiFin : null;
  return {
    ouvert, parcours, actif,
    lecture, offre: voieCloud(lecture),
    vente: { fermee: venteFermee(vente.dispo), dispo: vente.dispo, inscrire: vente.inscrire, places: placesRestantes(vente.dispo) },
    achat, lancerEssai,
    // Avant l'essai : maintenant + 7 jours. Pendant : la fin RÉELLE lue en base.
    dates: datesEssai(lecture.luLe ?? horloge, lang),
    essaiFinCourt: essaiFin ? dateCourte(essaiFin, lang) : null,
    connexions: {
      etat: cx.etat, lignes, ebayRelie: cx.ebayRelie, relire: relireConnexions,
      connectees: lignes.filter((l) => l.etat === 'connecte').length, total: lignes.length,
    },
  };
}
