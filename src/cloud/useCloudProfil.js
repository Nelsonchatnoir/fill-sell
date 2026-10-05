// ═══════════════════════════════════════════════════════════════════════════
// L'ÉTAT CLOUD DU COMPTE — UNE LECTURE À PART, QUI ÉCHOUE SANS RIEN CASSER
// ═══════════════════════════════════════════════════════════════════════════
// CONCEPTION (04/10/2026). Les colonnes is_cloud / cloud_essai_debut /
// cloud_essai_fin sont une PROPOSITION de migration, pas encore en base.
//
// ⛔ POSTGREST EST TOUT OU RIEN (docs/agents/pieges.md) : une colonne absente
//    dans un select = 400 + data null. Ces colonnes ne vont donc JAMAIS dans
//    le select de `profiles` d'App.jsx (il viderait l'app entière). Elles se
//    lisent ICI, dans une requête SÉPARÉE : si elle échoue, l'état vaut
//    'echec' et aucun écran Cloud ne s'affiche — jamais un état deviné.
// ⛔ Rien ne part tant que `actif` est faux : les appelants passent
//    `cloudOfferVisible(userId)` (drapeau baissé = aucune requête).
//
// Les drapeaux de palier sont relus dans la MÊME requête : cloudDuProfil a
// besoin des deux (une option sans palier est « suspendue »), et les lire
// ensemble évite un état Cloud calculé sur un palier d'une autre lecture.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { cloudDuProfil } from '../utils/palier';
import { cloudOfferVisible, cloudConnexionVisible } from '../config/cloudOffer';

// Les colonnes (20261004233000 ; décisions du 04/10 soir comprises : essai
// arrêté, fin de période payée, arrêt demandé en fin de période) + la raison
// d'un essai refusé après coup (20261005120000, carte ou compte de plateforme).
export const COLONNES_CLOUD = 'is_premium, is_pro, is_comped, is_business, is_cloud, cloud_essai_debut, cloud_essai_fin, cloud_essai_arrete, cloud_periode_fin, cloud_arret_fin_periode, cloud_essai_refus';

/**
 * @returns {{ etat: 'inactif'|'lecture'|'ok'|'echec', cloud: object|null, profil: object|null, luLe: number|null, relire: () => void }}
 *   cloud = cloudDuProfil(…) quand etat === 'ok', sinon null ; profil = la ligne
 *   lue (palier + colonnes Cloud) ; luLe = l'instant de la lecture.
 */
export function useCloudProfil(userId, { actif = true } = {}) {
  const [lu, setLu] = useState({ pour: null, etat: 'lecture', profil: null });
  const [tour, setTour] = useState(0);
  const relire = useCallback(() => setTour((n) => n + 1), []);
  const doitLire = Boolean(actif && userId);

  useEffect(() => {
    if (!doitLire) return undefined;
    let mort = false;
    const cle = `${userId}:${tour}`;
    Promise.resolve()
      .then(() => supabase.from('profiles').select(COLONNES_CLOUD).eq('id', userId).maybeSingle())
      .then(({ data, error }) => {
        if (mort) return;
        if (error || !data) {
          if (error) console.warn('[cloud] état de l’option illisible —', error.message ?? error);
          setLu({ pour: cle, etat: 'echec', profil: null });
          return;
        }
        setLu({ pour: cle, etat: 'ok', profil: data, le: Date.now() });
      })
      .catch((e) => {
        if (mort) return;
        console.warn('[cloud] état de l’option illisible —', e?.message ?? e);
        setLu({ pour: cle, etat: 'echec', profil: null });
      });
    return () => { mort = true; };
  }, [doitLire, userId, tour]);

  if (!doitLire) return { etat: 'inactif', cloud: null, relire };
  // Une lecture faite pour un AUTRE compte (ou un tour précédent) ne vaut rien.
  if (lu.pour !== `${userId}:${tour}`) return { etat: 'lecture', cloud: null, relire };
  return {
    etat: lu.etat,
    // L'état est calculé à l'heure de la LECTURE (rendu pur) ; relire() le
    // recalcule — les écrans relisent à chaque ouverture.
    cloud: lu.etat === 'ok' ? cloudDuProfil(lu.profil, lu.le) : null,
    profil: lu.etat === 'ok' ? lu.profil : null,
    luLe: lu.etat === 'ok' ? lu.le : null,
    relire,
  };
}

/**
 * La lecture Cloud d'une page qui en a besoin à deux endroits (Réglages ›
 * Abonnement : le bloc ET la mention dans la confirmation de résiliation) —
 * UNE requête, partagée. Drapeau baissé : rien ne part, état 'inactif'.
 * `c` = le contexte de la page ({ user }).
 */
export function useCloudReglages(c) {
  // (05/10) Un compte TÉMOIN (test réel, config/cloudOffer.js) voit l'état de
  // son option et « Me connecter » ; l'offre, elle, reste fermée pour lui.
  const visible = cloudOfferVisible(c?.user?.id) || cloudConnexionVisible(c?.user?.id);
  const lecture = useCloudProfil(c?.user?.id, { actif: visible });
  return visible ? lecture : INACTIF;
}
const INACTIF = Object.freeze({ etat: 'inactif', cloud: null, profil: null, luLe: null, relire: () => {} });
