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
//
// (07/11, décision de Nico) LE COMPTEUR « 14 places restantes » : le nombre `places` que la VENTE elle-même calcule
// (cloud_vente_etat, renvoyé tel quel par cloud_disponibilite_moi : places libres des serveurs aptes, moins les places
// gardées 24 h aux inscrits prévenus, moins la file devant soi) — jamais un chiffre écrit en dur. Vente impossible
// (complet, aucune IP) = 0 : la liste d'attente. Il se met à jour seul sur les écrans d'offre : relecture BORNÉE
// (utils/relectureBornee.js : onglet visible seulement, une lecture à la fois, ralentie si la base peine), jamais
// un setInterval ; l'hôte toujours monté (HoteCloud) garde sa lecture unique.
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { demarrerRelecture } from '../utils/relectureBornee';

/** Cadence du compteur de places sur les écrans d'offre (une lecture par minute, onglet visible). */
export const RELECTURE_PLACES_MS = 60_000;

/** La réponse de la base, mise à plat pour l'écran (pure : testée). Illisible → null. */
export function lireDisponibilite(d) {
  if (!d || typeof d !== 'object' || typeof d.vente_possible !== 'boolean') return null;
  const a = d.attente && typeof d.attente === 'object' ? d.attente : {};
  const places = Number(d.places);
  return {
    vente: d.vente_possible === true,
    raison: d.raison ?? null,
    // (07/11) Les places que la vente compte ; absent ou illisible = inconnu (null), jamais 0 inventé.
    places: d.places != null && Number.isInteger(places) && places >= 0 ? places : null,
    inscrit: a.inscrit === true,
    rang: Number.isFinite(Number(a.rang)) && Number(a.rang) > 0 ? Number(a.rang) : null,
    placePourToi: a.place_pour_toi === true,
    notifieLe: typeof a.notifie_le === 'string' ? a.notifie_le : null,
    dejaClient: d.raison === 'deja_client',
  };
}

/** Faut-il remplacer le bouton d'achat par « Complet » ? (pure) Seulement une lecture SÛRE qui dit non. */
export const venteFermee = (dispo) => Boolean(dispo && dispo.vente === false && !dispo.dejaClient);

/**
 * (07/11) Le chiffre du compteur (pure) : null = rien à afficher (lecture absente, client déjà servi, nombre inconnu) ;
 * 0 = vente impossible (la liste d'attente prend la place du bouton) ; sinon les places de la vente.
 */
export function placesRestantes(dispo) {
  if (!dispo || dispo.dejaClient || dispo.places == null) return null;
  return dispo.vente === true ? dispo.places : 0;
}

export function useDisponibiliteCloud({ actif = true, relireToutesLesMs = null } = {}) {
  const [lu, setLu] = useState({ etat: actif ? 'lecture' : 'inactif', dispo: null });
  const [tour, setTour] = useState(0);
  const relectureRef = useRef(null);
  useEffect(() => {
    if (!actif) return undefined;
    let mort = false;
    // Une relecture ratée ne remplace jamais une bonne lecture déjà affichée (le compteur ne clignote pas).
    const garder = (avant) => (avant.etat === 'ok' ? avant : { etat: 'echec', dispo: null });
    const lire = () => Promise.resolve()
      .then(() => supabase.rpc('cloud_disponibilite_moi'))
      .then(({ data, error }) => {
        if (mort) return false;
        const dispo = error ? null : lireDisponibilite(data);
        setLu((avant) => (dispo ? { etat: 'ok', dispo } : garder(avant)));
        return Boolean(dispo);
      })
      .catch(() => { if (!mort) setLu(garder); return false; });
    if (Number.isFinite(relireToutesLesMs) && relireToutesLesMs > 0) {
      const relecture = demarrerRelecture(lire, { intervalleMs: relireToutesLesMs, maxMs: 10 * 60_000 });
      relectureRef.current = relecture;
      return () => { mort = true; relecture.arreter(); if (relectureRef.current === relecture) relectureRef.current = null; };
    }
    lire();
    return () => { mort = true; };
  }, [actif, tour, relireToutesLesMs]);
  const relire = useCallback(() => {
    if (relectureRef.current) relectureRef.current.relireMaintenant();
    else setTour((n) => n + 1);
  }, []);
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
