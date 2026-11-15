// (15/11/2026, point 3 du lot de Nico) UN COMPTE FILLSELL CLOUD, AU MOMENT D'UN MAIL — pur, sans réseau.
//
// Le welcome et le « comment ça marche » (email-tunnel) disaient à tout le monde « une extension installée dans Chrome
// sur ton ordinateur » et menaient au Chrome Web Store : faux pour un client du Cloud, qui n'a besoin ni d'ordinateur ni
// de Chrome (il connecte ses plateformes depuis l'app). Règle permanente de Nico (13/11/2026) : un client Cloud ne lit
// jamais « ordinateur » ni « Chrome ». Ces deux mails ont donc leur texte du Cloud (_shared/emails-fillsell.ts, opts.cloud).
//
// Un compte est « au Cloud » pour un mail quand, AU MOMENT DE L'ENVOI :
//   · profiles.cloud_voie est vrai — la lecture du mail de relance des tâches (15/11 matin, fea32ce, email-tunnel) : le
//     drapeau « le Cloud exécute les tâches du compte », posé par cloud_voie_appliquer à chaque changement de is_cloud /
//     cloud_essai_* (déclencheur profiles_cloud_pool) et par cloud_voies_synchroniser (pg_cron, 5 min) ;
//   · OU son Cloud est vivant d'après ses colonnes (cloudVivantDuProfil, _shared/cloud-option.js) : payé (is_cloud), ou
//     ESSAI EN COURS (cloud_essai_debut posé, cloud_essai_fin à venir, pas arrêté) — le compte qui DÉMARRE un essai est
//     reconnu même si le drapeau n'est pas encore relu.
// Profil illisible (lecture ratée, ligne absente) → null : l'appelant garde le texte d'avant (jamais une erreur, jamais
// un mail perdu). Testé par scripts/mails-cloud-sans-ordinateur-selftest.mjs.
import { cloudVivantDuProfil } from "./cloud-option.js";

/** Les colonnes de profiles que lit la règle (une lecture séparée : elle ne retient jamais la langue ni l'envoi). */
export const COLONNES_CLOUD_MAIL = "id, cloud_voie, is_cloud, cloud_essai_debut, cloud_essai_fin, cloud_essai_arrete";
/** Comptes lus par requête (PostgREST coupe à 1 000 lignes sans erreur : un lot reste loin dessous). */
export const LOT_CLOUD_MAIL = 100;

/** Ce compte est-il au Cloud au moment de l'envoi ? true | false ; null si le profil est illisible (texte d'avant). */
export function compteAuCloudPourMail(profil, maintenant = Date.now()) {
  if (!profil || typeof profil !== "object") return null;
  try {
    return profil.cloud_voie === true || cloudVivantDuProfil(profil, maintenant) === true;
  } catch {
    return null;
  }
}

/**
 * La réponse « Cloud ou pas » de chaque compte, lue dans profiles par lots bornés : Map(id → true | false | null).
 * Ne jette jamais : un lot en erreur (réponse en erreur, exception, client cassé) laisse ses comptes à null, et un compte
 * absent de la réponse aussi — l'appelant envoie alors le texte d'avant.
 * base : un client supabase (service) ; ids : les comptes (doublons et vides ignorés).
 * @returns {Promise<Map<string, boolean | null>>}
 */
export async function lireCloudDesComptes({ base, ids, maintenant = Date.now(), lot = LOT_CLOUD_MAIL }) {
  const uniques = [...new Set((Array.isArray(ids) ? ids : []).filter((x) => x != null && x !== "").map(String))];
  /** @type {Map<string, boolean | null>} */
  const out = new Map(uniques.map((id) => [id, null]));
  const taille = Number.isInteger(lot) && lot > 0 ? Math.min(lot, LOT_CLOUD_MAIL) : LOT_CLOUD_MAIL;
  for (let i = 0; i < uniques.length; i += taille) {
    const tranche = uniques.slice(i, i + taille);
    try {
      const { data, error } = await base.from("profiles").select(COLONNES_CLOUD_MAIL).in("id", tranche);
      if (error || !Array.isArray(data)) continue;
      for (const p of data) {
        const id = p?.id != null ? String(p.id) : null;
        if (id && out.has(id)) out.set(id, compteAuCloudPourMail(p, maintenant));
      }
    } catch {
      // lot illisible : ses comptes restent à null (le texte d'avant)
    }
  }
  return out;
}
