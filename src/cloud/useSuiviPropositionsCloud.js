// (18/11/2026, lot T1, décisions 3 et 5 de Nico) App.jsx pose ici, pour tous les écrans, ce que l'app a le droit de
// proposer du Cloud (propositionsCloud.js). Le dernier paiement : la dernière ligne coin_ledger de source 'payment' des
// 7 derniers jours (lisible par le compte : RLS « own ledger read » ; Stripe, Apple et Google l'écrivent tous), et un
// palier qui MONTE dans cette session (l'achat vient de réussir : la ligne peut arriver après), gardé sur l'appareil.
// UNE lecture par compte et par palier (jamais en boucle).
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { RANG_PALIER } from './formulesCloud';
import {
  propositionsCloud, poserPropositionsCloud, SILENCE_APRES_PAIEMENT_MS, lirePaiementLocal, noterPaiementLocal, plusRecent,
} from './propositionsCloud';

export function useSuiviPropositionsCloud({ userId = null, palier = 'gratuit', palierCharge = false, compteCreeLe = null } = {}) {
  const [dernier, setDernier] = useState(null);
  const [lu, setLu] = useState(false);

  useEffect(() => {
    if (!userId) return undefined;
    let annule = false;
    const depuis = new Date(Date.now() - SILENCE_APRES_PAIEMENT_MS).toISOString();
    Promise.resolve()
      .then(() => supabase.from('coin_ledger').select('created_at')
        .eq('user_id', userId).in('kind', ['grant_monthly', 'grant_upgrade']).eq('metadata->>source', 'payment')
        .gte('created_at', depuis).order('created_at', { ascending: false }).limit(1))
      .then(({ data, error }) => {
        if (annule) return;
        const ms = !error && data?.[0]?.created_at ? Date.parse(data[0].created_at) : null;
        setDernier(plusRecent(ms, lirePaiementLocal(userId)));
        setLu(true);
      })
      .catch(() => { if (!annule) { setDernier(lirePaiementLocal(userId)); setLu(true); } });
    return () => { annule = true; };
  }, [userId, palier]);

  // Un palier qui monte APRÈS la première lecture du profil = un achat qui vient de réussir.
  const precedent = useRef(null);
  useEffect(() => {
    if (!userId || !palierCharge) return undefined;
    const avant = precedent.current;
    precedent.current = palier;
    if (avant != null && (RANG_PALIER[palier] ?? 0) > (RANG_PALIER[avant] ?? 0)) {
      const maintenant = Date.now();
      noterPaiementLocal(userId, maintenant);
      const t = setTimeout(() => setDernier(maintenant), 0);   // hors du rendu de l'effet
      return () => clearTimeout(t);
    }
    return undefined;
  }, [userId, palier, palierCharge]);

  useEffect(() => {
    const cree = Date.parse(compteCreeLe ?? '');
    poserPropositionsCloud(propositionsCloud({
      palier, dernierPaiementMs: dernier, compteCreeMs: Number.isFinite(cree) ? cree : null, lu: Boolean(userId) && lu && palierCharge,
    }));
  }, [userId, palier, dernier, lu, palierCharge, compteCreeLe]);
}
