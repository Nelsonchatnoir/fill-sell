// ═══════════════════════════════════════════════════════════════════════════
// (03/11/2026, point 5 de Nico) LA VENTE DU CLOUD EST-ELLE POSSIBLE ? — place serveur ET IP, liste d'attente
// ═══════════════════════════════════════════════════════════════════════════
// Une lecture : cloud_disponibilite_moi() (migration 20261103203000) — la base décide (places des serveurs vivants,
// places gardées 24 h aux inscrits prévenus, file d'attente, IP attribuable). L'app n'affiche le bouton d'achat
// (Stripe, App Store, Google Play) que si la vente est possible ; sinon « Être prévenu(e) ». La préparation
// (cloud_essai_preparer_moi) refuse de toute façon « complet » : l'écran n'est jamais la seule garde.
// ⛔ Rien ne part tant que `actif` est faux : les appelants ne montent ce hook que derrière la porte du Cloud
//    (cloudOfferVisible / cloudConnexionVisible) — aucune requête pour un compte ordinaire. Illisible = comme avant
//    (le bouton reste, la base refusera).
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/** La réponse de la base, mise à plat pour l'écran (pure : testée). Illisible → null. */
export function lireDisponibilite(d) {
  if (!d || typeof d !== 'object' || typeof d.vente_possible !== 'boolean') return null;
  const a = d.attente && typeof d.attente === 'object' ? d.attente : {};
  return {
    vente: d.vente_possible === true,
    raison: d.raison ?? null,
    inscrit: a.inscrit === true,
    rang: Number.isFinite(Number(a.rang)) && Number(a.rang) > 0 ? Number(a.rang) : null,
    placePourToi: a.place_pour_toi === true,
    notifieLe: typeof a.notifie_le === 'string' ? a.notifie_le : null,
    dejaClient: d.raison === 'deja_client',
  };
}

/** Faut-il remplacer le bouton d'achat par « Complet » ? (pure) Seulement une lecture SÛRE qui dit non. */
export const venteFermee = (dispo) => Boolean(dispo && dispo.vente === false && !dispo.dejaClient);

export function useDisponibiliteCloud({ actif = true } = {}) {
  const [lu, setLu] = useState({ etat: actif ? 'lecture' : 'inactif', dispo: null });
  const [tour, setTour] = useState(0);
  useEffect(() => {
    if (!actif) return undefined;
    let mort = false;
    Promise.resolve()
      .then(() => supabase.rpc('cloud_disponibilite_moi'))
      .then(({ data, error }) => {
        if (mort) return;
        const dispo = error ? null : lireDisponibilite(data);
        setLu({ etat: dispo ? 'ok' : 'echec', dispo });
      })
      .catch(() => { if (!mort) setLu({ etat: 'echec', dispo: null }); });
    return () => { mort = true; };
  }, [actif, tour]);
  const relire = useCallback(() => setTour((n) => n + 1), []);
  /** « Être prévenu(e) » : rend vrai si l'inscription est enregistrée. */
  const inscrire = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('cloud_attente_inscrire_moi');
      if (error || data?.ok !== true) return false;
      const dispo = lireDisponibilite(data);
      if (dispo) setLu({ etat: 'ok', dispo });
      return true;
    } catch {
      return false;
    }
  }, []);
  return { ...lu, relire, inscrire };
}
