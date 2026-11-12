// ═══════════════════════════════════════════════════════════════════════════
// PARCOURS D'ENTRÉE — LES FORMULES AVEC CLOUD (11/11/2026, textes validés par Nico, § 8.2 du plan + 3 corrections)
// ═══════════════════════════════════════════════════════════════════════════
// « As-tu un ordinateur ? » : oui → l'extension (4a), la fenêtre d'offres s'ouvrira ensuite sur « Sans Cloud » ;
// non → « FillSell tourne pour toi, même sans ordinateur » (4b), puis « Choisis ta formule » (la même source que la
// fenêtre d'offres : cloud/OffresAvecCloud.jsx), puis « Rien à payer avant le … » pour Premium + Cloud ou Pro + Cloud.
// ⛔ FERMÉ = RIEN NE PART : `ouvert` exige le téléphone, formulesCloudVendables(userId) (interrupteur serveur du canal ou
//    témoin) et l'achat fourni par l'hôte (`essaiFormule`) — faux pour tout compte ordinaire tant que Nico n'a pas
//    ouvert le canal : aucune requête, aucun état, le parcours d'avant (plan.js ; verrou formules-cloud-ferme).
// ⛔ Aucun paiement ici : essaiFormule(formule, opts) = lancerAchatFormule d'App.jsx (cloud/achatFormuleCloud.js).
import { useCallback, useRef, useState } from 'react';
import { formulesCloudVendables } from '../config/cloudOffer';
import { useCloudProfil } from '../cloud/useCloudProfil';
import { useDisponibiliteCloud, venteFermee } from '../cloud/useDisponibiliteCloud';
import { essaiPermisDuCompte, noterVueOffres } from '../cloud/formulesCloud';
import { FORMULES_CLOUD } from '../../supabase/functions/_shared/formules-cloud.js';
import { datesEssai, dateCourte } from './regles';

export const ENTREE_FORMULE_KEY = 'fs_entree_formule';
// { f, essai } : la formule choisie dans « Choisis ta formule », et si sa carte annonçait l'essai.
const lireFormule = () => {
  try {
    const v = JSON.parse(localStorage.getItem(ENTREE_FORMULE_KEY) ?? 'null');
    return v && FORMULES_CLOUD.includes(v.f) ? { f: v.f, essai: v.essai === true } : null;
  } catch { return null; }
};

export function useFormulesEntree({ userId, lang, surTelephone, essaiFormule, apresAchat = null }) {
  const ouvert = Boolean(surTelephone && userId && typeof essaiFormule === 'function' && formulesCloudVendables(userId));
  const lecture = useCloudProfil(userId, { actif: ouvert });
  const vente = useDisponibiliteCloud({ actif: ouvert });
  const [choix, setChoix] = useState(lireFormule);
  const [achat, setAchat] = useState({ etat: 'repos', message: null });
  const enVolRef = useRef(false);
  const [horloge] = useState(() => Date.now());

  const choisir = useCallback((f, essai = false) => {
    const sure = FORMULES_CLOUD.includes(f) ? { f, essai: essai === true } : null;
    setChoix(sure);
    try { if (sure) localStorage.setItem(ENTREE_FORMULE_KEY, JSON.stringify(sure)); else localStorage.removeItem(ENTREE_FORMULE_KEY); } catch { /* affichage */ }
  }, []);

  /** La voie du parcours, notée pour la fenêtre d'offres d'après (« Sans Cloud » avec un ordinateur, « Avec Cloud » sans). */
  const noterVoie = useCallback((voie) => noterVueOffres(voie === 'cloud' ? 'avec' : 'sans'), []);

  const lancer = useCallback(async (formule, opts = {}) => {
    if (enVolRef.current || typeof essaiFormule !== 'function') return null;
    enVolRef.current = true;
    setAchat({ etat: 'en_cours', message: null });
    let r = null;
    try { r = await essaiFormule(formule, opts); } catch { r = { etat: 'erreur', message: null }; }
    enVolRef.current = false;
    const etat = r?.etat ?? 'erreur';
    setAchat(etat === 'annule' ? { etat: 'repos', message: null } : { etat, message: r?.message ?? null });
    if (etat === 'actif' || etat === 'change' || etat === 'attente') { lecture.relire(); apresAchat?.(); }
    return etat;
  }, [essaiFormule, lecture, apresAchat]);

  const actifLu = lecture.etat === 'ok' && lecture.cloud?.actif === true;
  const essaiFin = lecture.etat === 'ok' && lecture.cloud?.etat === 'essai' ? lecture.cloud.essaiFin : null;
  return {
    ouvert, parcours: ouvert, lecture, essaiPermis: essaiPermisDuCompte(lecture),
    vente: { fermee: venteFermee(vente.dispo), dispo: vente.dispo, inscrire: vente.inscrire },
    choisie: choix?.f ?? null, choisieAvecEssai: choix?.essai === true, choisir, noterVoie, achat, lancer,
    actif: actifLu || achat.etat === 'actif' || achat.etat === 'change',
    dates: datesEssai(lecture.luLe ?? horloge, lang),
    essaiFinCourt: essaiFin ? dateCourte(essaiFin, lang) : null,
  };
}
