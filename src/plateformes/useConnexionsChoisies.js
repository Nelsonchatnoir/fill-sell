// ═══════════════════════════════════════════════════════════════════════════
// LES CONNEXIONS DES PLATEFORMES CHOISIES, LUES SANS BOUCLE (13/11/2026, décision de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Monté par le Tableau, la carte « Synchroniser » du Stock et Réglages › Mes plateformes : la MÊME règle
// (./connexionChoisie.js) sur la MÊME vérité serveur (plateformes_verite, utils/veritePlateformes — lecture partagée).
// En plus, une seule lecture légère du profil : la délégation Leboncoin (beta_flags) et le motif de la sonde Vinted
// (extension_sessions.sonde_motif, extension ≥ 0.6.187) — ils ne décident d'aucun état, ils précisent « inconnue ».
// Relecture BORNÉE (utils/relectureBornee) : à l'ouverture, toutes les 5 min onglet visible, au retour d'onglet ; une
// lecture de moins d'une minute est resservie (changer d'onglet ne relit rien) ; après un geste, `relire()` relit frais.
// État « client Cloud » pas encore lu → rien n'est dit (jamais un texte d'ordinateur à un client Cloud).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { lireVeritePlateformes } from '../utils/veritePlateformes';
import { demarrerRelecture } from '../utils/relectureBornee';
import { useEtatCompteCloud } from '../cloud/useCompteCloud';
import { useConnexionsCloudPartage } from '../cloud/useConnexionsCloud';
import { connexionsChoisies } from './connexionChoisie';

export const RELECTURE_CONNEXIONS_MS = 5 * 60_000;
const RESSERVIE_MS = 60_000;
let memoire = { userId: null, le: 0, verite: null, complements: null };

async function lireComplements(userId) {
  const { data, error } = await supabase.from('profiles')
    .select('beta_flags,sonde_motif:extension_sessions->sonde_motif').eq('id', userId).maybeSingle();
  if (error || !data) return null;
  const d = data.beta_flags?.delegation_leboncoin;
  return {
    delegues: d && typeof d === 'object' && typeof d.executant === 'string' ? ['leboncoin'] : [],
    sondeMotif: data.sonde_motif && typeof data.sonde_motif === 'object' ? data.sonde_motif : null,
  };
}

async function lireTout(userId, frais = false) {
  if (!frais && memoire.userId === userId && memoire.verite && Date.now() - memoire.le < RESSERVIE_MS) return memoire;
  const [verite, complements] = await Promise.all([
    lireVeritePlateformes({ frais }),
    lireComplements(userId).catch(() => null),
  ]);
  memoire = { userId, le: Date.now(), verite, complements: complements ?? (memoire.userId === userId ? memoire.complements : null) };
  return memoire;
}

/**
 * @returns {{ lu: boolean, clientCloud: boolean, installation: boolean, choisies: string[], lignes: object[], relire: () => void }}
 */
export function useConnexionsChoisies({ userId, lang = 'fr', actif = true, plateformesFermees = [] }) {
  const [lu, setLu] = useState(() => (memoire.userId === userId ? memoire : null));
  const etatCloud = useEtatCompteCloud(userId ?? null);
  const cx = useConnexionsCloudPartage();

  useEffect(() => {
    if (!actif || !userId) return undefined;
    let vivant = true;
    const relecture = demarrerRelecture(async () => {
      const m = await lireTout(userId);
      if (vivant) setLu({ ...m });
      return Boolean(m.verite);
    }, { intervalleMs: RELECTURE_CONNEXIONS_MS, maxMs: 20 * 60_000 });
    return () => { vivant = false; relecture.arreter(); };
  }, [actif, userId]);

  const relire = useCallback(() => {
    if (!userId) return;
    lireTout(userId, true).then((m) => setLu({ ...m })).catch(() => {});
  }, [userId]);

  const cleFermees = (Array.isArray(plateformesFermees) ? plateformesFermees : []).join(',');
  const r = useMemo(() => connexionsChoisies({
    verite: lu?.verite ?? null,
    cloud: { compteLu: etatCloud.lu, clientCloud: etatCloud.cloud, lu: cx.lu, etats: cx.etats, isoles: cx.isoles, ebayApi: cx.ebayApi },
    sondeMotif: lu?.complements?.sondeMotif ?? null,
    delegues: lu?.complements?.delegues ?? [],
    plateformesFermees: cleFermees ? cleFermees.split(',') : [],
    lang,
  }), [lu, etatCloud.lu, etatCloud.cloud, cx.lu, cx.etats, cx.isoles, cx.ebayApi, cleFermees, lang]);
  return { ...r, relire };
}
