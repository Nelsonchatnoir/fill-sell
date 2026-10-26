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

export const CLE_REGLAGE_REDACTION = 'redaction';

/** Le réglage d'un objet platform_settings : true seulement quand la personne l'a allumé. */
export function redactionALaDemandeDesReglages(ps) {
  const r = ps && typeof ps === 'object' ? ps[CLE_REGLAGE_REDACTION] : null;
  return Boolean(r && typeof r === 'object' && r.a_la_demande === true);
}

const memoire = new Map(); // userId → { aLaDemande, lue, promesse }
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
      memoire.set(userId, { aLaDemande: error ? false : redactionALaDemandeDesReglages(data?.platform_settings), lue: !error, promesse: null });
    } catch {
      memoire.set(userId, { aLaDemande: false, lue: false, promesse: null });
    }
    prevenir();
  })();
  memoire.set(userId, { aLaDemande: false, lue: false, promesse });
}

/** Lecture synchrone (false tant que la base n'a pas répondu : le défaut, inchangé). */
export function redactionALaDemandeConnue(userId) {
  return Boolean(userId && memoire.get(userId)?.aLaDemande);
}

/** Retient le réglage ; l'écran suit tout de suite. Rend { ok }. */
export async function enregistrerRedactionALaDemande(userId, on) {
  if (userId) memoire.set(userId, { aLaDemande: Boolean(on), lue: true, promesse: null });
  prevenir();
  if (!userId || !UUID.test(String(userId))) return { ok: false };
  const { error } = on
    ? await fusionnerReglages([CLE_REGLAGE_REDACTION], { a_la_demande: true })
    : await fusionnerReglages([CLE_REGLAGE_REDACTION], null, ['a_la_demande']);
  return { ok: !error };
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
