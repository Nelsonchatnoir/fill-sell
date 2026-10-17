// ═══════════════════════════════════════════════════════════════════════════
// LA MÉMOIRE « COMPTE × CATÉGORIE » — LECTURE ET ÉCRITURE (18/10 nuit, point 1)
// ═══════════════════════════════════════════════════════════════════════════
// La règle (ce qui se retient, ce qui se pose) vit dans
// src/publication/moteur/memoireCategorie.js ; ici, seulement la table
// memoire_champs_categorie (RLS : chacun ses lignes) :
//   · UNE lecture par compte et par ouverture de l'app (cache partagé par tous
//     les moteurs d'un lot — jamais une lecture par article, jamais d'intervalle) ;
//   · écriture au clic Publier, seulement ce qui change (lignesAEcrire) ;
//   · les moteurs montés sont prévenus d'une réponse retenue (abonnement) : le
//     prochain article du même rayon la reçoit sans recharger ;
//   · Réglages › Préférences : lister, oublier une entrée, tout vider.
// Table absente ou lecture ratée = mémoire vide : l'écran pose ses questions
// comme avant, rien ne casse.
import { indexerMemoire, cleMemoire } from "../publication/moteur/memoireCategorie.js";

const TABLE = "memoire_champs_categorie";
const COLONNES = "plateforme, compte, categorie, champ, valeur, inventaire_id, repondu_le";
const PAGE = 1000;

// ── L'INTERRUPTEUR (18/10 nuit) ─────────────────────────────────────────────
// La preuve réelle de bout en bout n'a pas pu être faite cette nuit (sur le
// compte de Nico, la rédaction IA remplit déjà l'Univers de Mode : la question
// n'apparaît plus depuis le correctif A10 du 11/10). Règle de la nuit : livré
// ÉTEINT. FAIL-CLOSED, même modèle que publication/interrupteur.js :
//   1. profiles.beta_flags.memoire_categorie = true | false (un compte) ;
//   2. coin_config.memoire_categorie_ouverte = 1 (tout le monde).
// Éteint : mémoire vide, rien retenu, rien posé, section Réglages masquée —
// l'écran pose ses questions exactement comme avant.
export const CLE_PROFIL_MEMOIRE = "memoire_categorie";
export const CLE_CONFIG_MEMOIRE = "memoire_categorie_ouverte";
async function memoireOuverte(supabase, userId) {
  try {
    const { data, error } = await supabase.from("profiles").select("beta_flags").eq("id", userId).maybeSingle();
    if (!error && data?.beta_flags?.[CLE_PROFIL_MEMOIRE] === true) return true;
    if (!error && data?.beta_flags?.[CLE_PROFIL_MEMOIRE] === false) return false;
  } catch { /* colonne absente = fermé */ }
  try {
    const { data, error } = await supabase.from("coin_config").select("value").eq("key", CLE_CONFIG_MEMOIRE).maybeSingle();
    return !error && Number(data?.value) === 1;
  } catch { return false; }
}

const etat = new Map(); // userId → { map: Map|null, ouverte: boolean|null, promesse: Promise|null, abonnes: Set }
const de = (userId) => {
  if (!etat.has(userId)) etat.set(userId, { map: null, ouverte: null, promesse: null, abonnes: new Set() });
  return etat.get(userId);
};
/** L'interrupteur tel que lu (null tant que la lecture n'a pas répondu). */
export function memoireOuverteEnCache(userId) {
  return userId ? (etat.get(userId)?.ouverte ?? null) : null;
}
const prevenir = (userId) => {
  const e = de(userId);
  for (const cb of e.abonnes) { try { cb(e.map); } catch { /* un abonné ne casse pas les autres */ } }
};

async function lireToutes(supabase, userId) {
  const lignes = [];
  for (let debut = 0; debut < 20 * PAGE; debut += PAGE) {
    const { data, error } = await supabase.from(TABLE).select(COLONNES).eq("user_id", userId)
      .order("plateforme").order("categorie").order("champ").range(debut, debut + PAGE - 1);
    if (error) throw error;
    lignes.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return lignes;
}

/** La mémoire du compte (Map) — lue une fois, ensuite le cache. */
export function chargerMemoire(supabase, userId) {
  if (!supabase || !userId) return Promise.resolve(new Map());
  const e = de(userId);
  if (e.map) return Promise.resolve(e.map);
  if (!e.promesse) {
    e.promesse = memoireOuverte(supabase, userId)
      .then((ouverte) => {
        e.ouverte = ouverte;
        return ouverte ? lireToutes(supabase, userId) : [];
      })
      .then((lignes) => { e.map = indexerMemoire(lignes); return e.map; })
      .catch((err) => {
        console.warn("[mémoire] lecture impossible — les questions restent posées :", err?.message ?? err);
        e.map = new Map();
        return e.map;
      })
      .finally(() => { e.promesse = null; prevenir(userId); });
  }
  return e.promesse;
}

/** Ce que le cache sait déjà (null tant que la lecture n'a pas répondu). */
export function memoireEnCache(userId) {
  return userId ? (etat.get(userId)?.map ?? null) : null;
}

/** Être prévenu quand la mémoire change (lecture finie, réponse retenue, oubli). */
export function abonnerMemoire(userId, cb) {
  if (!userId || typeof cb !== "function") return () => {};
  const e = de(userId);
  e.abonnes.add(cb);
  return () => e.abonnes.delete(cb);
}

/**
 * Retient des réponses (lignes de lignesAEcrire). Une ligne existante est
 * REMPLACÉE (une nouvelle réponse remplace l'ancienne). Best-effort.
 */
export async function retenirReponses(supabase, userId, lignes) {
  if (!supabase || !userId || !Array.isArray(lignes) || !lignes.length) return { ok: true, n: 0 };
  // Éteinte (ou pas encore lue) : rien n'est retenu.
  if (de(userId).ouverte !== true) return { ok: true, n: 0, eteinte: true };
  const rows = lignes.map((l) => ({ user_id: userId, plateforme: l.plateforme, compte: l.compte, categorie: l.categorie, champ: l.champ, valeur: l.valeur, inventaire_id: l.inventaire_id ?? null }));
  const { data, error } = await supabase.from(TABLE)
    .upsert(rows, { onConflict: "user_id,plateforme,compte,categorie,champ" })
    .select(COLONNES);
  if (error) {
    console.warn("[mémoire] réponse non retenue :", error.message);
    return { ok: false, n: 0, erreur: error.message };
  }
  const e = de(userId);
  if (!e.map) e.map = new Map();
  for (const l of data ?? rows) {
    e.map.set(cleMemoire(l), { valeur: String(l.valeur), repondu_le: l.repondu_le ?? new Date().toISOString(), inventaire_id: l.inventaire_id ?? null });
  }
  prevenir(userId);
  return { ok: true, n: (data ?? rows).length };
}

/** Réglages : toutes les entrées, triées pour l'affichage. */
export async function listerMemoire(supabase, userId) {
  if (!supabase || !userId) return null;
  const e = de(userId);
  e.ouverte = await memoireOuverte(supabase, userId);
  // Éteinte : null = la section Réglages ne s'affiche pas.
  if (!e.ouverte) { e.map = new Map(); prevenir(userId); return null; }
  const lignes = await lireToutes(supabase, userId);
  e.map = indexerMemoire(lignes);
  prevenir(userId);
  return lignes;
}

/** Réglages : oublie UNE entrée (la question reviendra sur ce rayon). */
export async function oublierEntree(supabase, userId, { plateforme, compte, categorie, champ }) {
  if (!supabase || !userId) return { ok: false };
  const { error } = await supabase.from(TABLE).delete()
    .eq("user_id", userId).eq("plateforme", plateforme).eq("compte", compte).eq("categorie", categorie).eq("champ", champ);
  if (error) return { ok: false, erreur: error.message };
  de(userId).map?.delete(cleMemoire({ plateforme, compte, categorie, champ }));
  prevenir(userId);
  return { ok: true };
}

/** Réglages : vide toute la mémoire du compte. */
export async function viderMemoire(supabase, userId) {
  if (!supabase || !userId) return { ok: false };
  const { error } = await supabase.from(TABLE).delete().eq("user_id", userId);
  if (error) return { ok: false, erreur: error.message };
  de(userId).map = new Map();
  prevenir(userId);
  return { ok: true };
}
