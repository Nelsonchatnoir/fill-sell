// ═══════════════════════════════════════════════════════════════════════════
// PARCOURS D'ENTRÉE — LE CONTEXTE, MONTÉ UNE FOIS (2026-09-20)
// ═══════════════════════════════════════════════════════════════════════════
// Tout ce que les écrans LISENT vit ici, et rien d'autre ne s'y ajoute : un
// écran ne fait pas d'appel réseau dans son coin.
//
// ⛔ AUCUN APPEL NEUF. Strictement les fonctions qui existaient déjà :
//   · lireCapaciteSyncCompte / demanderSyncDressingServeur (utils/vintedSync)
//   · lireSyncMultiOuverte / demanderRelevePlateforme (utils/syncPlateformes)
//   · useEnvoiLienExtension (hooks)
//   · usage_logs 'onboarding_choice' (télémétrie best-effort, jamais bloquante)
// Aucun quota, aucun palier, aucun coin_ledger n'est touché : le relevé n'est
// ni une publication ni une republication (cf. syncPlateformes.js).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase, supabaseUrl, supabaseAnonKey } from '../lib/supabase';
import { lireCapaciteSyncCompte, demanderSyncDressingServeur, lireDernierRunDressing } from '../utils/vintedSync';
import { lireSyncMultiOuverte, demanderRelevePlateforme, lireDerniersRunsReleve } from '../utils/syncPlateformes';
import { murConnexionReleve } from '../annonces/etatReleve';
import { useEnvoiLienExtension } from '../hooks/useEnvoiLienExtension';

// ⚠️ CES DEUX CLÉS NE CHANGENT PAS DE NOM NI DE SENS. Elles sont lues
// ailleurs (App.jsx remonte le parcours quand l'attente est encore posée) :
//   · ONBOARD_DONE_KEY  : miroir local de profiles.onboarded_at — un cache
//     anti-clignotement, jamais la source de vérité ;
//   · ONBOARD_STATE_KEY : 'attente_extension' = « cet appareil-ci attend
//     l'extension ». Posée dès que l'écran extension est atteint sans
//     extension détectée, retirée à la fin du parcours.
export const ONBOARD_STATE_KEY = 'fs_onboard_state';
export const ONBOARD_DONE_KEY = 'fs_onboard_choice_done';
// Position FINE dans le parcours — nouvelle, locale, purement d'affichage.
export const ENTREE_ETAPE_KEY = 'fs_entree_etape';
// ⚠️ CACHE D'AFFICHAGE, PAS UNE SOURCE. Les plateformes cochées vivent dans
// profiles.platform_settings.plateformes_vendeur (cf. plus bas) ; cette clé
// ne sert qu'à garder les coches à l'écran si la page est rechargée avant que
// l'écriture serveur ne soit revenue.
export const ENTREE_CHOIX_KEY = 'fs_entree_choix';
// Le relevé A ÉTÉ DEMANDÉ sur cet appareil, avant que l'extension ne soit là.
// Sans cette clé, un rechargement effacerait l'intention et la personne
// devrait revenir cliquer — exactement ce qu'on lui promet d'éviter.
export const ENTREE_RELEVE_KEY = 'fs_entree_releve_demande';

// ── LE CHAMP DE PRÉFÉRENCE ──────────────────────────────────────────────────
// profiles.platform_settings est le sac de préférences de plateformes qui
// EXISTE DÉJÀ (adresse Leboncoin, jours d'extension, republication planifiée
// par plateforme, alertes masquées). On y range une clé de plus, et surtout
// PAS une colonne ni une table nouvelle.
//
// ⛔ CE N'EST PAS `plateformesDuCompte` ET ÇA NE DOIT PAS LE DEVENIR : la
//    liste des plateformes qu'un compte peut VISER est calculée
//    (utils/stockFiltres) à partir des constantes du stock et de
//    profiles.plateformes_visibles. L'écrire ici mentirait à l'écran de
//    publication. Ce qu'on range, c'est la réponse à « où tu vends ? » — une
//    préférence déclarée, qui pilote le parcours et les Réglages.
export const CLE_PREFERENCE = 'plateformes_vendeur';

const lireJSON = (cle, defaut) => {
  try { const v = JSON.parse(localStorage.getItem(cle) || 'null'); return v ?? defaut; }
  catch { return defaut; }
};
const ecrire = (cle, valeur) => {
  try { localStorage.setItem(cle, typeof valeur === 'string' ? valeur : JSON.stringify(valeur)); }
  catch { /* stockage indisponible : la base fait foi */ }
};

// ── LE DRAPEAU DE SORTIE — profiles.onboarded_at ────────────────────────────
// Source de vérité du « cette personne a fait son entrée ». Écrit dans TOUS
// les cas de sortie : parcours terminé, et fermeture en cours de route.
export async function marquerEntreeFaite(userId) {
  if (!userId) return;
  // .select() obligatoire après un update client (RLS) — sans lui, PostgREST
  // rend 0 ligne et l'erreur passe inaperçue.
  const { error } = await supabase
    .from('profiles')
    .update({ onboarded_at: new Date().toISOString() })
    .eq('id', userId)
    .select('onboarded_at');
  if (error) console.warn('[entree] onboarded_at non écrit :', error.message);
}

// Variante SORTIE BRUTALE (onglet fermé, app tuée) : le client Supabase ne
// garantit rien quand le document se démonte, `fetch(keepalive)` si. Le jeton
// est celui mis en cache à l'ouverture du parcours — le lire ici serait
// asynchrone, donc trop tard.
export function marquerEntreeFaiteAuVol(userId, jeton) {
  if (!userId || !jeton) return;
  try {
    fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      keepalive: true,
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${jeton}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ onboarded_at: new Date().toISOString() }),
    }).catch(() => { /* sortie brutale : personne pour lire l'échec */ });
  } catch { /* idem */ }
}

export function useContexteEntree({ lang, user, demanderPseudo }) {
  const fr = lang !== 'en';
  // ⚠️ L'identifiant est EXTRAIT UNE FOIS, et c'est LUI qu'on met en
  // dépendance. Écrire `[user?.id]` fait diverger les dépendances inférées
  // (`user`) de celles écrites, et le compilateur React renonce à optimiser
  // tout le fichier — c'est exactement ce que dit `preserve-manual-memoization`.
  const userId = user?.id ?? null;
  // « Téléphone » = natif OU petit écran web — même règle que StockTab et que
  // l'ancien parcours : sur un téléphone, installer ici est impossible.
  const surTelephone = useMemo(
    () => Capacitor.isNativePlatform() || (typeof window !== 'undefined' && window.innerWidth < 768),
    [],
  );

  const [choix, setChoix] = useState(() => lireJSON(ENTREE_CHOIX_KEY, { plateformes: [], debute: false }));
  const [extensionVue, setExtensionVue] = useState(false);
  const [syncMultiOuverte, setSyncMultiOuverte] = useState(false);
  const [releve, setReleve] = useState(() => (lireJSON(ENTREE_RELEVE_KEY, false) ? { etat: 'en_file' } : { etat: 'idle' }));
  const [ebayRelie, setEbayRelie] = useState(false);
  // ── CE QUE LE PREMIER RELEVÉ A DONNÉ (2026-09-22) ─────────────────────────
  // Le parcours lançait le relevé puis n'en reparlait JAMAIS : la personne
  // arrivait dans le Stock sans savoir que Leboncoin, Beebs ou eBay n'avaient
  // rien pu lire faute de session. C'est le premier endroit où un nouvel
  // inscrit rencontre une plateforme non connectée — le geste doit être là.
  // `murs` : [{ platform, motif }], déjà qualifiés. `relevéVinted` : le nombre
  // d'annonces du dernier relevé Vinted RÉUSSI, ou null.
  const [murs, setMurs] = useState([]);
  const [releveVinted, setReleveVinted] = useState(null);
  // Deux faits distincts : la personne a DEMANDÉ le relevé (état 'en_file',
  // relu de ENTREE_RELEVE_KEY au montage) ; les appels sont PARTIS (ce ref).
  // Les confondre, c'est soit perdre l'intention, soit la rejouer.
  const partiRef = useRef(false);
  const choixRef = useRef(choix);
  const jetonRef = useRef(null);

  const { envoi, secondesRestantes, envoyer: envoyerLien } = useEnvoiLienExtension(lang, user?.email ?? null);

  useEffect(() => { choixRef.current = choix; }, [choix]);

  // Jeton mis en cache pour la sortie brutale (cf. marquerEntreeFaiteAuVol).
  useEffect(() => {
    let annule = false;
    supabase.auth.getSession()
      .then(({ data }) => { if (!annule) jetonRef.current = data?.session?.access_token ?? null; })
      .catch(() => {});
    return () => { annule = true; };
  }, [userId]);

  // L'interrupteur du relevé multiplateforme, FAIL-CLOSED : on n'annonce
  // jamais ce que le serveur refuserait.
  useEffect(() => {
    let annule = false;
    lireSyncMultiOuverte(userId).then((v) => { if (!annule) setSyncMultiOuverte(v === true); }).catch(() => {});
    return () => { annule = true; };
  }, [userId]);

  // La préférence déjà posée (autre appareil, retour dans le parcours) reprend
  // la main sur le cache local, qui n'est qu'un anti-clignotement.
  useEffect(() => {
    if (!userId) return undefined;
    let annule = false;
    supabase.from('profiles').select('platform_settings').eq('id', userId).maybeSingle()
      .then(({ data }) => {
        if (annule) return;
        const dejaCoche = data?.platform_settings?.[CLE_PREFERENCE];
        if (!Array.isArray(dejaCoche) || !dejaCoche.length) return;
        if (choixRef.current.plateformes.length || choixRef.current.debute) return;
        const suivant = { plateformes: dejaCoche, debute: false };
        ecrire(ENTREE_CHOIX_KEY, suivant);
        setChoix(suivant);
      })
      .catch(() => { /* préférence illisible : le parcours repart de zéro */ });
    return () => { annule = true; };
  }, [userId]);

  // Détection de l'extension — POLL INCHANGÉ (8 s, lireCapaciteSyncCompte).
  // Différence avec l'ancien parcours : elle ne fait plus SORTIR de l'écran.
  // Elle allume une ligne d'état, et c'est tout — la personne reste maîtresse
  // de son enchaînement. Le poll s'arrête de lui-même dès que l'extension est
  // vue, et au démontage : jamais de requête qui tourne dans le vide.
  useEffect(() => {
    if (!userId || extensionVue) return undefined;
    let vivant = true;
    const tick = async () => {
      try {
        const cap = await lireCapaciteSyncCompte(userId);
        if (vivant && cap?.capable) setExtensionVue(true);
      } catch { /* la détection ne fait jamais échouer l'écran */ }
    };
    tick();
    const id = setInterval(tick, 8000);
    return () => { vivant = false; clearInterval(id); };
  }, [userId, extensionVue]);

  // Le relevé a été lancé : on relit l'état des plateformes toutes les 8 s —
  // les MÊMES lectures que la carte du Stock, jamais une requête neuve. Le
  // poll ne tourne que pendant le parcours et s'arrête au démontage.
  // ⛔ Vinted se lit par `lireDernierRunDressing` (dernier run QUEL QUE SOIT
  //    son statut) : `lireDernierRunVinted` ne rend que les runs réussis, un
  //    mur Vinted n'y apparaîtrait jamais.
  useEffect(() => {
    if (!userId || releve.etat !== 'lance') return undefined;
    let vivant = true;
    const tick = async () => {
      try {
        const [runs, dressing] = await Promise.all([
          lireDerniersRunsReleve(userId).catch(() => ({})),
          lireDernierRunDressing(userId).catch(() => null),
        ]);
        if (!vivant) return;
        const cibles = choixRef.current.plateformes;
        const trouves = [];
        if (cibles.includes('vinted')) {
          const m = murConnexionReleve(dressing, 'vinted');
          if (m) trouves.push({ platform: 'vinted', motif: m });
        }
        for (const p of cibles.filter((x) => x !== 'vinted')) {
          const m = murConnexionReleve(runs?.[p] ?? null, p);
          if (m) trouves.push({ platform: p, motif: m });
        }
        setMurs(trouves);
        setReleveVinted(dressing?.status === 'done' ? Number(dressing.items_vus ?? 0) : null);
      } catch { /* la lecture d'état ne fait jamais échouer un écran du parcours */ }
    };
    tick();
    const id = setInterval(tick, 8000);
    return () => { vivant = false; clearInterval(id); };
  }, [userId, releve.etat]);

  const journaliser = useCallback((choixTrace, extra = null) => {
    if (!userId) return;
    try {
      supabase.from('usage_logs')
        .insert({ user_id: userId, feature: 'onboarding_choice', metadata: { choix: choixTrace, ...(extra ?? {}) } })
        .then(({ error }) => { if (error) console.warn('[entree] choix non journalisé :', error.message); });
    } catch { /* la télémétrie ne bloque jamais le parcours */ }
  }, [userId]);

  const majChoix = useCallback((maj) => {
    setChoix((c) => {
      const suivant = typeof maj === 'function' ? maj(c) : maj;
      ecrire(ENTREE_CHOIX_KEY, suivant);
      return suivant;
    });
  }, []);

  // UNE écriture, à la validation de l'écran — pas une par coche. Lecture,
  // fusion, écriture : platform_settings porte aussi l'adresse Leboncoin, les
  // jours d'extension et les réglages par plateforme, qu'on n'écrase pas.
  const enregistrerPlateformes = useCallback(async () => {
    if (!userId) return;
    try {
      const { data: cur } = await supabase.from('profiles').select('platform_settings').eq('id', userId).maybeSingle();
      const base = cur?.platform_settings || {};
      const { error } = await supabase
        .from('profiles')
        .update({ platform_settings: { ...base, [CLE_PREFERENCE]: choixRef.current.plateformes } })
        .eq('id', userId)
        .select('id');
      if (error) console.warn('[entree] préférence de plateformes non écrite :', error.message);
    } catch (e) {
      console.warn('[entree] préférence de plateformes non écrite :', e?.message ?? e);
    }
  }, [userId]);

  // LE RELEVÉ — les appels existants, rien de plus. Vinted part par la sync
  // du dressing (kind 'dressing'), les autres par demander_sync_plateforme,
  // et seulement si l'interrupteur serveur est ouvert. Le serveur tranche
  // cadence, doublons et version d'extension : on ne re-décide rien ici.
  //
  // ⛔ SANS EXTENSION, ON NE BLOQUE PAS ET ON N'APPELLE PAS. Les deux RPC
  //    répondent `extension_jamais_vue` : les appeler ne mettrait rien en
  //    file, ça brûlerait la demande. On garde l'intention sur l'appareil et
  //    l'effet ci-dessous la rejoue à la seconde où l'extension se montre —
  //    la personne n'a pas à revenir cliquer.
  const lancerReleve = useCallback(async () => {
    if (partiRef.current) return;
    ecrire(ENTREE_RELEVE_KEY, true);
    if (!extensionVue) { setReleve({ etat: 'en_file' }); return; }
    partiRef.current = true;
    setReleve({ etat: 'en_cours' });
    const cibles = choixRef.current.plateformes;
    try {
      if (cibles.includes('vinted')) await demanderSyncDressingServeur();
      if (syncMultiOuverte) {
        for (const pf of cibles.filter((p) => p !== 'vinted')) {
          await demanderRelevePlateforme(pf);
        }
      }
    } catch { /* le refus serveur est un état, pas une panne d'écran */ }
    setReleve({ etat: 'lance' });
  }, [extensionVue, syncMultiOuverte]);

  // Comportement CONSERVÉ de l'ancien parcours : si l'extension apparaît
  // pendant que le parcours est ouvert et que la personne a déclaré des
  // plateformes, le relevé part tout seul — elle n'a pas à revenir cliquer.
  // Le départ est DIFFÉRÉ d'un tick : un setState synchrone dans le corps d'un
  // effet déclenche une cascade de rendus (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!extensionVue || partiRef.current) return undefined;
    if (!choix.plateformes.length) return undefined;
    const id = setTimeout(() => { lancerReleve(); }, 0);
    return () => clearTimeout(id);
  }, [extensionVue, choix.plateformes.length, lancerReleve]);

  return {
    lang, fr, user, demanderPseudo, surTelephone,
    choix, majChoix, enregistrerPlateformes,
    extensionVue, syncMultiOuverte,
    envoi, secondesRestantes, envoyerLien,
    releve, lancerReleve,
    murs, releveVinted,
    ebayRelie, setEbayRelie,
    journaliser, jetonRef,
  };
}
