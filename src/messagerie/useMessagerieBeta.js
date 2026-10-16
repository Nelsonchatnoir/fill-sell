// ═══════════════════════════════════════════════════════════════════════════
// LE DRAPEAU ET LES COMPTEURS DE LA BÊTA MESSAGES + BORDEREAUX (16/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Une seule lecture : rpc messagerie_compteurs (non lus global et par article,
// commandes à expédier, et le drapeau bêta lui-même — fail-closed : RPC
// absente, illisible, compte non bêta = rien d'affiché).
// Hors bêta (tout le parc) : UNE lecture au chargement, puis plus rien.
// En bêta : relecture BORNÉE (utils/relectureBornee.js) toutes les 2 min,
// onglet visible seulement — jamais de setInterval.
import { useCallback, useEffect, useRef, useState } from 'react';
import { demarrerRelecture } from '../utils/relectureBornee';

const VIDE = Object.freeze({ beta: false, pret: false, nonLus: 0, conversationsNonLues: 0, parArticle: {}, aExpedier: 0 });

export function useMessagerieBeta(supabase, userId) {
  const [etat, setEtat] = useState(VIDE);
  const relecture = useRef(null);

  useEffect(() => {
    if (!supabase || !userId) return undefined;
    let vivant = true;
    const lire = async () => {
      const { data, error } = await supabase.rpc('messagerie_compteurs');
      if (!vivant) return undefined;
      if (error || !data || data.beta !== true) {
        setEtat({ ...VIDE, pret: true, user: userId });
        relecture.current?.arreter();
        return error ? false : undefined;
      }
      setEtat({
        user: userId, beta: true, pret: true,
        nonLus: Number(data.non_lus) || 0,
        conversationsNonLues: Number(data.conversations_non_lues) || 0,
        parArticle: data.par_article && typeof data.par_article === 'object' ? data.par_article : {},
        aExpedier: Number(data.a_expedier) || 0,
      });
      return undefined;
    };
    relecture.current = demarrerRelecture(lire, { intervalleMs: 120_000, maxMs: 15 * 60_000 });
    return () => { vivant = false; relecture.current?.arreter(); relecture.current = null; };
  }, [supabase, userId]);

  const relire = useCallback(() => { relecture.current?.relireMaintenant?.(); }, []);
  // Sans session : rien (l'état d'un compte précédent n'est jamais montré).
  if (!supabase || !userId || etat.user !== userId) return { ...VIDE, relire };
  return { ...etat, relire };
}

/**
 * (16/10 nuit) Les réglages de la bêta que les écrans doivent DIRE : le mode
 * d'envoi des réponses (2 = ouvert aux comptes bêta, 1 = liste blanche, 0 =
 * fermé) et la génération des bordereaux (ouverte ou non). Une lecture à
 * l'ouverture de l'écran (messagerie_compteurs), fail-closed : illisible =
 * liste blanche et génération fermée.
 */
export function useReglagesMessagerie(supabase) {
  const [reglages, setReglages] = useState({ pret: false, envoiMode: 1, generation: false });
  useEffect(() => {
    if (!supabase) return undefined;
    let vivant = true;
    supabase.rpc('messagerie_compteurs').then(({ data, error }) => {
      if (!vivant) return;
      if (error || !data || data.beta !== true) { setReglages({ pret: true, envoiMode: 1, generation: false }); return; }
      const mode = Number(data.envoi_mode);
      setReglages({ pret: true, envoiMode: Number.isFinite(mode) ? mode : 1, generation: data.generation === true });
    }).catch(() => { if (vivant) setReglages({ pret: true, envoiMode: 1, generation: false }); });
    return () => { vivant = false; };
  }, [supabase]);
  return reglages;
}
