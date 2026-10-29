// ═══════════════════════════════════════════════════════════════════════════
// TITRE, DESCRIPTION ET PRIX GÉNÉRÉS À LA DEMANDE (26/10, D3 — Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Un réglage (Réglages › Préférences › Rédaction), éteint par défaut : rien ne change pour les autres comptes.
// Allumé, FillSell analyse TOUJOURS les photos (rayon, marque, caractéristiques — la rédaction tourne comme avant,
// c'est elle qui range l'article), mais le titre, la description et le prix qui partent sont ceux de la FICHE ; ce que
// FillSell a écrit attend derrière un bouton « Générer », champ par champ (titre, description, prix).
// profiles.platform_settings.redaction.a_la_demande (true | absent), écrit par platform_settings_fusionner seulement.
// Lecture partagée (une par compte et par session) : même forme que utils/useChoixPoidsLeboncoin.js.
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fusionnerReglages } from './reglagesPlateformes';
import { consignesValides } from './consignesRedaction';
import { strategieValide } from './strategiePrix';

export const CLE_REGLAGE_REDACTION = 'redaction';

/** Le réglage d'un objet platform_settings : true seulement quand la personne l'a allumé. */
export function redactionALaDemandeDesReglages(ps) {
  const r = ps && typeof ps === 'object' ? ps[CLE_REGLAGE_REDACTION] : null;
  return Boolean(r && typeof r === 'object' && r.a_la_demande === true);
}

// (29/10, lot B 1.2-1.4) Le MÊME objet `redaction` porte aussi les consignes du vendeur (consignes), sa stratégie de
// prix (strategie_prix) et « ouvrir l'annonce dès la fin de l'analyse » (ouvrir_annonce_apres_scan) : une lecture,
// une mémoire, pour tous les écrans.
/** Tous les réglages de rédaction d'un objet platform_settings (défauts = comportement d'avant). */
export function reglagesRedactionDesReglages(ps) {
  const r = ps && typeof ps === 'object' && ps[CLE_REGLAGE_REDACTION] && typeof ps[CLE_REGLAGE_REDACTION] === 'object'
    ? ps[CLE_REGLAGE_REDACTION] : {};
  return {
    aLaDemande: r.a_la_demande === true,
    consignes: consignesValides(r.consignes),
    strategiePrix: strategieValide(r.strategie_prix),
    ouvrirApresScan: r.ouvrir_annonce_apres_scan === true,
  };
}
const DEFAUTS = Object.freeze(reglagesRedactionDesReglages(null));

const memoire = new Map(); // userId → { aLaDemande, reglages, lue, promesse }
const abonnes = new Set();
const prevenir = () => { for (const f of abonnes) { try { f(); } catch { /* écran démonté */ } } };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function lire(userId) {
  if (!userId || !UUID.test(String(userId))) return;
  const e = memoire.get(userId);
  if (e?.lue || e?.promesse) return;
  const promesse = (async () => {
    try {
      const { data, error } = await supabase.from('profiles').select('platform_settings').eq('id', userId).maybeSingle();
      const deja = memoire.get(userId);
      if (deja?.lue) return; // un choix fait à l'écran pendant la lecture l'emporte
      const reglages = error ? DEFAUTS : reglagesRedactionDesReglages(data?.platform_settings);
      memoire.set(userId, { aLaDemande: reglages.aLaDemande, reglages, lue: !error, promesse: null });
    } catch {
      memoire.set(userId, { aLaDemande: false, reglages: DEFAUTS, lue: false, promesse: null });
    }
    prevenir();
  })();
  memoire.set(userId, { aLaDemande: false, reglages: DEFAUTS, lue: false, promesse });
}

/** Lecture synchrone (false tant que la base n'a pas répondu : le défaut, inchangé). */
export function redactionALaDemandeConnue(userId) {
  return Boolean(userId && memoire.get(userId)?.aLaDemande);
}

/** (29/10, lot B) Tous les réglages de rédaction connus (les défauts tant que la base n'a pas répondu). */
export function reglagesRedactionConnus(userId) {
  return (userId && memoire.get(userId)?.reglages) || DEFAUTS;
}

/** Retient le réglage ; l'écran suit tout de suite. Rend { ok }. */
export async function enregistrerRedactionALaDemande(userId, on) {
  if (userId) {
    const avant = reglagesRedactionConnus(userId);
    memoire.set(userId, { aLaDemande: Boolean(on), reglages: { ...avant, aLaDemande: Boolean(on) }, lue: true, promesse: null });
  }
  prevenir();
  if (!userId || !UUID.test(String(userId))) return { ok: false };
  const { error } = on
    ? await fusionnerReglages([CLE_REGLAGE_REDACTION], { a_la_demande: true })
    : await fusionnerReglages([CLE_REGLAGE_REDACTION], null, ['a_la_demande']);
  return { ok: !error };
}

/**
 * (29/10, lot B 1.2-1.4) Retient une partie des réglages de rédaction : { consignes?, strategiePrix?, ouvrirApresScan? }.
 * Seules les clés données changent (platform_settings_fusionner) ; des consignes vides sont RETIRÉES, jamais écrites
 * vides. Rend { ok }.
 */
export async function enregistrerReglagesRedaction(userId, partiel = {}) {
  const avant = reglagesRedactionConnus(userId);
  const suivant = { ...avant };
  const patch = {};
  const supprimer = [];
  if ('consignes' in partiel) {
    suivant.consignes = consignesValides(partiel.consignes);
    if (Object.keys(suivant.consignes).length) patch.consignes = suivant.consignes; else supprimer.push('consignes');
  }
  if ('strategiePrix' in partiel) {
    suivant.strategiePrix = strategieValide(partiel.strategiePrix);
    patch.strategie_prix = suivant.strategiePrix;
  }
  if ('ouvrirApresScan' in partiel) {
    suivant.ouvrirApresScan = partiel.ouvrirApresScan === true;
    if (suivant.ouvrirApresScan) patch.ouvrir_annonce_apres_scan = true; else supprimer.push('ouvrir_annonce_apres_scan');
  }
  if (userId) memoire.set(userId, { aLaDemande: suivant.aLaDemande, reglages: suivant, lue: true, promesse: null });
  prevenir();
  if (!userId || !UUID.test(String(userId))) return { ok: false };
  // Une consigne retirée est une clé SUPPRIMÉE (jamais un objet vide écrit) : seules les clés nommées bougent.
  const { error } = await fusionnerReglages([CLE_REGLAGE_REDACTION], Object.keys(patch).length ? patch : null, supprimer);
  return { ok: !error };
}

/** (29/10, lot B) { reglages, lue, enregistrer(partiel) } — tous les réglages de rédaction. */
export function useReglagesRedaction(userId) {
  const [, setTic] = useState(0);
  useEffect(() => {
    const f = () => setTic((n) => n + 1);
    abonnes.add(f);
    lire(userId);
    return () => { abonnes.delete(f); };
  }, [userId]);
  const e = userId ? memoire.get(userId) : null;
  return {
    reglages: e?.reglages || DEFAUTS,
    lue: Boolean(e?.lue),
    enregistrer: (partiel) => enregistrerReglagesRedaction(userId, partiel),
  };
}

/** { aLaDemande, lue, choisir(on) } */
export function useRedactionALaDemande(userId) {
  const [, setTic] = useState(0);
  useEffect(() => {
    const f = () => setTic((n) => n + 1);
    abonnes.add(f);
    lire(userId);
    return () => { abonnes.delete(f); };
  }, [userId]);
  const e = userId ? memoire.get(userId) : null;
  return {
    aLaDemande: Boolean(e?.aLaDemande),
    lue: Boolean(e?.lue),
    choisir: (on) => enregistrerRedactionALaDemande(userId, on),
  };
}
