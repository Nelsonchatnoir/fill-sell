// ═══════════════════════════════════════════════════════════════════════════
// LA PORTE D'ÉCRITURE DE public.comptes_plateformes (13/11/2026, étape 4 « comptes hors France », L1)
// ═══════════════════════════════════════════════════════════════════════════
// Tous les écrivains passent ICI (callback eBay, siteDuCompteEbay, get-pending-jobs pour les sondes Vinted et Depop) ;
// la règle est pure (_shared/sites-plateformes.js, ecritureComptePlateforme) :
//   · une ligne identique → AUCUNE écriture ; une ligne changée → UN update des seuls champs changés (+ lu_le), ciblé
//     sur la clé, jamais `pilote` ; une ligne nouvelle → UN insert (une course 23505 → rien de plus) ; jamais d'upsert
//     aveugle, jamais d'effacement (une sonde muette n'efface rien) ;
//   · la même ligne revue dans le même isolat → aucune requête pendant 30 min (aucune lecture de plus par poll) ;
//   · la table absente (migration M1 pas encore appliquée) → rien, sans erreur, et plus aucune tentative pendant
//     10 min : le code se déploie AVANT la migration et marche après, sans redéploiement.
// Jamais bloquant : toute erreur est rendue en motif, jamais levée. Le client `admin` (service_role) est passé par
// l'appelant (aucun import réseau : Deno et Node le chargent tel quel). Preuve : scripts/une-ecriture-selftest.mjs.
import { ecritureComptePlateforme, lignesDesSessions, signatureLigne } from "./sites-plateformes.js";

export const TABLE_COMPTES_PLATEFORMES = "comptes_plateformes";
const MEMOIRE_MS = 30 * 60_000;
const TABLE_ABSENTE_MS = 10 * 60_000;
const COLONNES = "user_id, plateforme, compte, site, pays, langue, devise, domaine, source, brut, lu_le, pilote";

/** @type {Map<string, number>} signature → instant où elle a été vue (dans cet isolat). */
const vues = new Map();
/** @type {Map<string, number>} compte FillSell → instant où ses sessions ont été notées (dans cet isolat). */
const sessionsNotees = new Map();
let tableAbsenteJusqua = 0;

/** Pour les selftests : oublie la mémoire de l'isolat. */
export function _reinitialiserMemo() { vues.clear(); sessionsNotees.clear(); tableAbsenteJusqua = 0; }

/** L'erreur dit-elle que la table n'existe pas (encore) ? PostgREST PGRST205 / Postgres 42P01. */
export function estTableAbsente(error) {
  const code = String(error?.code ?? "");
  const msg = String(error?.message ?? "");
  return code === "PGRST205" || code === "42P01" || (/comptes_plateformes/.test(msg) && /does not exist|could not find|schema cache/i.test(msg));
}

function memoriser(sig, maintenant) {
  if (vues.size > 5000) vues.clear();
  vues.set(sig, maintenant);
}

/**
 * Note la ligne lue (ligneCompte*() de sites-plateformes.js) : rien si elle est déjà là, identique.
 * @param {any} admin — client Supabase service_role
 * @param {Record<string, any>|null} ligne
 * @param {{ maintenant?: number }} [o]
 * @returns {Promise<{ ecrit: boolean, motif: "sans_ligne"|"deja_vue"|"table_absente"|"inchangee"|"inseree"|"modifiee"|"course"|"erreur", detail?: string }>}
 */
export async function noterComptePlateforme(admin, ligne, { maintenant = Date.now() } = {}) {
  if (!ligne) return { ecrit: false, motif: "sans_ligne" };
  if (maintenant < tableAbsenteJusqua) return { ecrit: false, motif: "table_absente" };
  const sig = signatureLigne(ligne);
  const vue = vues.get(sig);
  if (vue !== undefined && maintenant - vue < MEMOIRE_MS) return { ecrit: false, motif: "deja_vue" };
  try {
    const { data: actuelle, error: eLu } = await admin.from(TABLE_COMPTES_PLATEFORMES).select(COLONNES)
      .eq("user_id", ligne.user_id).eq("plateforme", ligne.plateforme).eq("compte", ligne.compte).maybeSingle();
    if (eLu) {
      if (estTableAbsente(eLu)) { tableAbsenteJusqua = maintenant + TABLE_ABSENTE_MS; return { ecrit: false, motif: "table_absente" }; }
      return { ecrit: false, motif: "erreur", detail: String(eLu.message ?? eLu.code ?? "").slice(0, 200) };
    }
    const d = ecritureComptePlateforme(actuelle ?? null, ligne, { maintenant });
    if (!d.ecrire) { memoriser(sig, maintenant); return { ecrit: false, motif: d.motif === "inchangee" ? "inchangee" : "sans_ligne" }; }
    if (d.motif === "nouvelle") {
      const { error } = await admin.from(TABLE_COMPTES_PLATEFORMES).insert(d.insert);
      if (error) {
        if (String(error.code ?? "") === "23505") return { ecrit: false, motif: "course" };
        if (estTableAbsente(error)) { tableAbsenteJusqua = maintenant + TABLE_ABSENTE_MS; return { ecrit: false, motif: "table_absente" }; }
        return { ecrit: false, motif: "erreur", detail: String(error.message ?? error.code ?? "").slice(0, 200) };
      }
      memoriser(sig, maintenant);
      return { ecrit: true, motif: "inseree" };
    }
    const { error } = await admin.from(TABLE_COMPTES_PLATEFORMES).update(d.champs)
      .eq("user_id", ligne.user_id).eq("plateforme", ligne.plateforme).eq("compte", ligne.compte);
    if (error) return { ecrit: false, motif: "erreur", detail: String(error.message ?? error.code ?? "").slice(0, 200) };
    memoriser(sig, maintenant);
    return { ecrit: true, motif: "modifiee" };
  } catch (e) {
    return { ecrit: false, motif: "erreur", detail: String(e?.message ?? e).slice(0, 200) };
  }
}

/**
 * Note les comptes que disent les sessions de l'extension (vinted_identite, depop_identite) — get-pending-jobs, sur
 * des sessions DÉJÀ lues (aucune lecture de profil de plus). Sonde muette : rien.
 * @param {any} admin
 * @param {string} userId
 * @param {unknown} sessions — profiles.extension_sessions
 * @param {{ maintenant?: number }} [o]
 */
export async function noterComptesDesSessions(admin, userId, sessions, o = {}) {
  const out = [];
  for (const l of lignesDesSessions(userId, sessions)) out.push({ plateforme: l.plateforme, ...(await noterComptePlateforme(admin, l, o)) });
  if (userId) { if (sessionsNotees.size > 5000) sessionsNotees.clear(); sessionsNotees.set(String(userId), o.maintenant ?? Date.now()); }
  return out;
}

/**
 * Les sessions de ce compte ont-elles été notées il y a moins de 30 min (dans cet isolat) ? get-pending-jobs s'en sert
 * pour ne relire le profil qu'une fois par 30 min quand seules des tâches Depop partent.
 */
export function sessionsDejaNotees(userId, maintenant = Date.now()) {
  const t = sessionsNotees.get(String(userId ?? ""));
  return t !== undefined && maintenant - t < MEMOIRE_MS;
}

/**
 * La ligne d'un compte (lecture par la clé) ; null si absente, illisible ou table pas encore créée — jamais une panne.
 * @param {any} admin
 * @param {{ userId: string, plateforme: string, compte: string|null|undefined }} cle
 */
export async function lireComptePlateforme(admin, { userId, plateforme, compte } = {}) {
  const c = String(compte ?? "").trim();
  if (!userId || !plateforme || !c) return null;
  if (Date.now() < tableAbsenteJusqua) return null;
  try {
    const { data, error } = await admin.from(TABLE_COMPTES_PLATEFORMES).select(COLONNES)
      .eq("user_id", userId).eq("plateforme", plateforme).eq("compte", c).maybeSingle();
    if (error && estTableAbsente(error)) tableAbsenteJusqua = Date.now() + TABLE_ABSENTE_MS;
    return error ? null : (data ?? null);
  } catch {
    return null;
  }
}
