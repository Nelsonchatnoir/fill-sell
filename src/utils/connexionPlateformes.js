// ═══════════════════════════════════════════════════════════════════════════
// « ME CONNECTER » — LE TÉLÉPHONE DEMANDE, L'ORDINATEUR OUVRE (2026-09-22)
// ═══════════════════════════════════════════════════════════════════════════
// C'est le mur nº1 des nouveaux inscrits : une plateforme pas connectée, un
// job qui meurt, et aucun geste à cliquer. Ce module porte le geste.
//
// ⛔ L'APP NE PEUT PAS PARLER À L'EXTENSION. Le manifeste n'a pas
//    d'`externally_connectable` : une page web n'a aucun moyen d'appeler
//    chrome.runtime. C'est écrit depuis le 18/09 dans utils/oplaAcces.js, et
//    ça ne change pas ici. La demande passe donc par LA BASE, exactement comme
//    les relevés : l'app pose une ligne, l'extension la réclame à son poll.
//    C'est aussi ce qui fait marcher le cas qui compte — la personne est sur
//    son TÉLÉPHONE, l'ordinateur est à côté, et c'est lui qui doit ouvrir la
//    page de connexion.
//
// ⛔ AUCUNE MIGRATION, ET C'EST DÉLIBÉRÉ. `vinted_sync_runs` EST déjà une file
//    de demandes app → extension : user_id, kind, platform, status, queued_at,
//    claimed_at, finished_at. Vérifié le 22/09 : AUCUNE contrainte CHECK sur
//    `kind` (la seule contrainte porte sur `platform`, et elle accepte déjà
//    les cinq), et la RLS laisse le propriétaire insérer, lire et modifier ses
//    lignes. Un `kind` neuf est donc inerte pour les lecteurs existants, qui
//    filtrent tous sur 'dressing' ou 'annonces'.
//    L'historique de migrations de ce projet est divergent (cf. CLAUDE.md) :
//    ne pas y ajouter une table quand la file existe est le choix le moins
//    risqué, pas un raccourci.
//
// ⚠️ LA PURGE EXISTANTE NE NOUS COUVRE PAS : purger_sync_queue_perimee ne
//    touche que kind in ('dressing','annonces'). Notre péremption est donc
//    portée par le LECTEUR (get-pending-jobs, garde .gte) et par le nettoyage
//    d'ici. Et elle est COURTE : une demande d'ouverture de page n'a de sens
//    que quelques minutes — au-delà, la personne est passée à autre chose.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '../lib/supabase';
import { PLATFORM_LOGIN_URLS, EBAY_VENDEUR_URL } from './shared';

/** Le `kind` de nos lignes dans la file. Inerte pour les autres lecteurs. */
export const KIND_CONNEXION = 'connexion';

/**
 * La première version d'extension qui sait ouvrir une page de connexion.
 * ⚠️ MIROIR du garde-fou de get-pending-jobs (`versionAuMoins(version,
 *    "0.6.53")`) : les deux doivent dire la même chose, sinon l'app promet une
 *    page que l'ordinateur n'ouvrira jamais.
 */
export const VERSION_MINIMALE = '0.6.53';

/** « 0.6.53 » ≥ « 0.6.53 » — comparaison numérique, segment par segment. */
export function versionAuMoins(version, minimum) {
  const d = (v) => String(v ?? '').trim().split('.').map((x) => Number.parseInt(x, 10) || 0);
  const a = d(version);
  const b = d(minimum);
  if (!String(version ?? '').trim()) return false;   // inconnue : on n'affirme rien
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return true;
}

/** Une demande d'ouverture ne vaut que quelques minutes. */
export const DEMANDE_TTL_MS = 10 * 60 * 1000;

/**
 * Au-delà, on considère que Chrome n'est pas ouvert. L'extension touche
 * `profiles.extension_last_seen_at` à chaque poll ; sur le parc actif, l'écart
 * observé se compte en minutes.
 * ⚠️ On ne s'en sert JAMAIS pour dire « pas connecté » — seulement pour
 *    expliquer pourquoi une demande ne part pas. Ce sont deux choses
 *    différentes, et les confondre accuserait quelqu'un de connecté.
 */
export const EXTENSION_MUETTE_MS = 5 * 60 * 1000;

// Noms propres : ils ne se traduisent pas.
export const NOMS_PLATEFORME = {
  vinted: 'Vinted', leboncoin: 'Leboncoin', beebs: 'Beebs', ebay: 'eBay', opla: 'Opla',
};

/**
 * ⚠️ MIROIR de PLATFORMS (chrome-extension/popup.js, ~l.25) : les deux bundles
 * n'ont aucun module en commun. Le popup ouvre DÉJÀ ces adresses depuis son
 * bouton « connecter » ; on ne réinvente pas les URL, on les recopie une fois
 * et les deux fichiers se citent. C'est l'EXTENSION qui ouvre réellement la
 * page : cette table ne sert ici qu'à nommer et à afficher.
 */
export const ADRESSE_CONNEXION = {
  vinted: 'https://www.vinted.fr/',
  leboncoin: 'https://www.leboncoin.fr/',
  beebs: 'https://www.beebs.app/',
  ebay: 'https://www.ebay.fr/',
  opla: 'https://www.opla.co/',
};

// ══ SUR LE WEB, LE BOUTON EST UN LIEN. RIEN D'AUTRE. ══════════════════════
// (2026-09-22, correction de cap) Sur un ordinateur, l'app tourne DANS le
// navigateur qui porte la session : il n'y a rien à demander à personne, on
// ouvre la page de connexion dans un onglet. Instantané, aucune file, aucune
// dépendance à un paquet Chrome Web Store.
// La file (kind='connexion') reste le chemin du MOBILE, et d'elle seule : sur
// un téléphone, ouvrir Vinted ne connecte pas l'ordinateur — ça ne servirait
// à rien.
//
// ⛔ UNE SEULE TABLE D'ADRESSES DANS L'APP, ET ELLE EXISTAIT DÉJÀ :
//    `PLATFORM_LOGIN_URLS` (utils/shared.js), que la carte d'un job échoué et
//    l'étape de publication utilisent depuis longtemps. En créer une seconde
//    ici aurait garanti qu'un jour les deux divergent — et c'est justement en
//    la relisant qu'on a trouvé le 404 de Beebs. On s'y branche, on ne la
//    double pas. Opla n'y figure pas, et c'est juste : son mur est une
//    permission d'hôte Chrome, qu'aucun lien ne peut accorder.

/**
 * Web ou natif ? Capacitor, jamais la largeur d'écran : un navigateur étroit
 * reste un navigateur, et une tablette native reste native.
 * Import paresseux pour que ce module reste utilisable hors React/Capacitor.
 */
export function estWeb() {
  try { return !Capacitor.isNativePlatform(); } catch { return true; }
}

/**
 * Le lien à ouvrir sur le WEB, ou null quand il n'y en a pas (Opla).
 * `null` n'est pas un défaut : c'est l'information « ici, un lien ne suffit pas ».
 */
export function lienWeb(platform, motif = MOTIFS.CONNEXION) {
  if (motif === MOTIFS.AUTORISER_OPLA || platform === 'opla') return null;
  if (motif === MOTIFS.VENDEUR_EBAY) return EBAY_VENDEUR_URL;
  return PLATFORM_LOGIN_URLS[platform] ?? null;
}

/**
 * Les motifs pour lesquels on ouvre une page, et ce qu'on demande d'y faire.
 * `vendeur_ebay` n'est PAS une connexion : le compte existe, il n'est pas
 * encore vendeur, et ça se règle chez eBay.
 */
export const MOTIFS = Object.freeze({
  CONNEXION: 'connexion',
  REAUTH_EBAY: 'reauth_ebay',
  VENDEUR_EBAY: 'vendeur_ebay',
  // ⛔ OPLA N'EST PAS UNE CONNEXION. Son mur est une permission d'hôte Chrome,
  //    et `chrome.permissions.request` n'accepte de s'exécuter que dans un
  //    geste de la personne, sur une page d'extension. L'extension ouvre donc
  //    son POPUP, où le bouton « Autoriser Opla » existe depuis le 16/09.
  AUTORISER_OPLA: 'autoriser_opla',
});

/** L'adresse à ouvrir pour un motif donné (informative : c'est l'extension qui ouvre). */
export function adressePour(platform, motif = MOTIFS.CONNEXION) {
  if (motif === MOTIFS.VENDEUR_EBAY || motif === MOTIFS.REAUTH_EBAY) return 'https://www.ebay.fr/sl/sell';
  if (motif === MOTIFS.AUTORISER_OPLA) return null; // c'est le popup, pas une page web
  return ADRESSE_CONNEXION[platform] ?? null;
}

/**
 * Pose une demande d'ouverture. Rend { ok, id } ou { ok:false, motif }.
 *
 * ⛔ UNE SEULE DEMANDE VIVANTE PAR PLATEFORME. Sans ça, trois clics font trois
 *    onglets — et l'utilisateur qui s'impatiente clique trois fois. On réutilise
 *    la demande en cours tant qu'elle n'est ni réclamée ni périmée.
 */
export async function demanderConnexion({ userId, platform, motif = MOTIFS.CONNEXION, declencheur = 'app' }) {
  if (!userId || !ADRESSE_CONNEXION[platform]) return { ok: false, motif: 'plateforme_inconnue' };
  const depuis = new Date(Date.now() - DEMANDE_TTL_MS).toISOString();
  try {
    const { data: vivante } = await supabase
      .from('vinted_sync_runs')
      .select('id, status, queued_at')
      .eq('user_id', userId).eq('kind', KIND_CONNEXION).eq('platform', platform)
      .eq('status', 'queued').gte('queued_at', depuis)
      .order('queued_at', { ascending: false }).limit(1);
    if (vivante?.length) return { ok: true, id: vivante[0].id, deja: true };

    const { data, error } = await supabase
      .from('vinted_sync_runs')
      .insert({
        user_id: userId,
        kind: KIND_CONNEXION,
        platform,
        status: 'queued',
        queued_at: new Date().toISOString(),
        // `declencheur` porte le MOTIF : c'est lui qui dira à l'extension quelle
        // page ouvrir (connexion, reconnexion de sécurité, inscription vendeur).
        declencheur: `${declencheur}:${motif}`,
      })
      .select('id').single();
    if (error) return { ok: false, motif: 'ecriture_refusee' };
    return { ok: true, id: data.id };
  } catch {
    return { ok: false, motif: 'reseau' };
  }
}

// ══ « AUTORISER OPLA » SUR LE WEB — LA PAGE DEMANDE, L'EXTENSION OUVRE ═════
// (2026-09-23) Une page web ne peut pas accorder une permission d'hôte
// Chrome : `chrome.permissions.request` n'obéit qu'à un geste DANS une page
// d'extension. Mais la page peut DEMANDER à l'extension d'ouvrir cette page-là
// (son popup, en fenêtre ou en onglet) — par le pont fillsell-auth.js, liste
// fermée de commandes, jamais rien d'autre. La personne y appuie sur
// « Autoriser Opla » : un geste, pas une explication de navigateur.
// Rend { ok, ouverte, dejaAccordee } ou { ok:false, motif:'extension_absente' }
// si l'extension ne répond pas dans le délai — c'est l'app qui dit alors quoi
// faire (installer l'extension), sans décrire d'icône.
export const AUTORISATION_OPLA_ATTENTE_MS = 4000;
export function demanderAutorisationOplaSurLeWeb() {
  return new Promise((resolve) => {
    let fini = false;
    const finir = (r) => { if (fini) return; fini = true; window.removeEventListener('message', onMessage); clearTimeout(minuteur); resolve(r); };
    const onMessage = (e) => {
      if (e.source !== window || !e.data?.__fillsellOplaOuverture) return;
      const rep = e.data.__fillsellOplaOuverture;
      finir({ ok: rep?.ok === true, ouverte: rep?.ouverte === true, dejaAccordee: rep?.dejaAccordee === true, motif: rep?.ok ? null : 'refusee' });
    };
    const minuteur = setTimeout(() => finir({ ok: false, ouverte: false, dejaAccordee: false, motif: 'extension_absente' }), AUTORISATION_OPLA_ATTENTE_MS);
    window.addEventListener('message', onMessage);
    try { window.postMessage({ __fillsellCmd: 'AUTORISER_OPLA' }, window.location.origin); }
    catch { finir({ ok: false, ouverte: false, dejaAccordee: false, motif: 'extension_absente' }); }
  });
}

/** Marque périmées les demandes de connexion trop vieilles de ce compte. */
export async function purgerMesDemandes(userId) {
  if (!userId) return;
  const depuis = new Date(Date.now() - DEMANDE_TTL_MS).toISOString();
  try {
    await supabase.from('vinted_sync_runs')
      .update({ status: 'expired', finished_at: new Date().toISOString() })
      .eq('user_id', userId).eq('kind', KIND_CONNEXION).eq('status', 'queued')
      .lt('queued_at', depuis);
  } catch { /* best-effort : la garde qui fait foi est côté lecteur */ }
}

/**
 * Le suivi d'une demande, pour l'écran : `etat` vaut
 *   'repos'     rien en cours
 *   'demande'   posée, pas encore réclamée par l'extension
 *   'ouverte'   l'extension l'a réclamée → la page est ouverte sur le PC
 *   'muette'    Chrome n'a pas l'air ouvert (on le DIT, on n'échoue pas)
 *   'refusee'   l'écriture n'est pas passée
 */
export function useDemandeConnexion({ userId }) {
  const [etat, setEtat] = useState('repos');
  const [platform, setPlatform] = useState(null);
  const suivi = useRef(null);

  const stop = useCallback(() => {
    if (suivi.current) { clearInterval(suivi.current); suivi.current = null; }
  }, []);
  useEffect(() => stop, [stop]);

  const demander = useCallback(async (pf, motif = MOTIFS.CONNEXION) => {
    setPlatform(pf);
    setEtat('demande');
    // Chrome ouvert ? La bonne version ? On le dit AVANT de poser la demande :
    // une demande qui dort n'apprend rien à personne, et promettre une page
    // qui ne s'ouvrira pas est pire que ne rien promettre.
    let muette = false;
    let tropVieille = false;
    try {
      const { data } = await supabase
        .from('profiles').select('extension_last_seen_at, extension_version').eq('id', userId).maybeSingle();
      const vu = Date.parse(data?.extension_last_seen_at ?? '');
      muette = !Number.isFinite(vu) || Date.now() - vu > EXTENSION_MUETTE_MS;
      // ⚠️ MIROIR du garde-fou serveur : get-pending-jobs ne sert les demandes
      //    de connexion qu'aux extensions ≥ VERSION_MINIMALE. En deçà, la
      //    demande partirait dans le vide et l'écran attendrait pour rien.
      tropVieille = !muette && !versionAuMoins(data?.extension_version, VERSION_MINIMALE);
    } catch { /* illisible : on ne conclut rien, on tente */ }

    if (tropVieille) { setEtat('trop_vieille'); return { ok: false, motif: 'extension_trop_vieille' }; }

    const r = await demanderConnexion({ userId, platform: pf, motif });
    if (!r.ok) { setEtat('refusee'); return r; }
    if (muette) { setEtat('muette'); return r; }

    // On attend que l'extension la réclame. Elle poste `claimed_at` en
    // ouvrant l'onglet : c'est la seule preuve que la page est bien là.
    stop();
    const debut = Date.now();
    suivi.current = setInterval(async () => {
      if (Date.now() - debut > 90_000) { stop(); setEtat((e) => (e === 'demande' ? 'muette' : e)); return; }
      try {
        const { data } = await supabase
          .from('vinted_sync_runs').select('status').eq('id', r.id).maybeSingle();
        if (data?.status && data.status !== 'queued') { stop(); setEtat('ouverte'); }
      } catch { /* on réessaiera au tick suivant */ }
    }, 3000);
    return r;
  }, [userId, stop]);

  const reinitialiser = useCallback(() => { stop(); setEtat('repos'); setPlatform(null); }, [stop]);

  return { etat, platform, demander, reinitialiser };
}
