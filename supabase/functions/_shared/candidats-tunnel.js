// ═══════════════════════════════════════════════════════════════════════════
// LES CANDIDATS DU TUNNEL DE MAILS, LUS EN ENTIER — et le plafond de 2 mails / 24 h (15/11/2026, point 2 du lot (2) de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// CE QUI SE PASSAIT. email-tunnel lisait `email_tunnel_candidates()` par un rpc NU : la fonction rend tous les comptes
// (3 777 lignes le 15/11), SANS ordre, et PostgREST coupe à 1 000 lignes sans erreur. Le « comment ça marche » (J+1)
// ne partait donc qu'aux inscrits de la veille tombés par hasard dans les 1 000 premières lignes : 12 envois en 12 jours
// pour 243 inscrits. Le rattrapage J+1 du welcome avait le même trou, et les blasts manuels aussi.
//
// LA RÈGLE :
//   · la liste se lit PAR PAGES, dans un ordre stable (inscription, puis id), jusqu'à la dernière page ; une page en
//     erreur arrête tout (échec FERMÉ : jamais une liste partielle prise pour la liste entière) ;
//   · les mails J+1 ne lisent que la FENÊTRE de leur règle (inscrits de la veille, filtrée par la base) : la correction
//     ne rattrape personne — seuls partent les comptes qui deviennent éligibles, selon la règle d'avant ;
//   · avant chaque mail J+1 de notre initiative : le plafond de 2 mails par personne sur 24 h glissantes (email_logs,
//     mêmes types comptés que la porte des envois ponctuels : _shared/plafond-mails.js — une vente ne compte pas), en
//     comptant aussi ce que CE passage vient d'envoyer.
// Verrou : scripts/tunnel-candidats-complets-selftest.mjs (`npm run selftest:tunnel-candidats-complets`).
import { PLAFOND_24H, compteDansPlafond } from "./plafond-mails.js";

export const PAGE_CANDIDATS = 1000;

/**
 * Tous les candidats du tunnel (email_tunnel_candidates), lus par pages. `depuis` / `avant` (Date ou ISO) : la fenêtre
 * d'inscription, filtrée par la base. Lève une erreur si une page est illisible (l'appelant n'envoie rien).
 * @param {any} base client supabase (service)
 * @param {{ depuis?: Date | string | null, avant?: Date | string | null, page?: number }} [o]
 * @returns {Promise<Array<{ user_id: string, user_email: string, lang: string, is_premium: boolean, created_at: string }>>}
 */
export async function lireCandidatsTunnel(base, { depuis = null, avant = null, page = PAGE_CANDIDATS } = {}) {
  const taille = Number.isInteger(page) && page > 0 ? Math.min(page, PAGE_CANDIDATS) : PAGE_CANDIDATS;
  const iso = (d) => (d instanceof Date ? d.toISOString() : String(d));
  const tous = [];
  for (let debut = 0; ; debut += taille) {
    let q = base.rpc("email_tunnel_candidates");
    if (depuis != null) q = q.gte("created_at", iso(depuis));
    if (avant != null) q = q.lt("created_at", iso(avant));
    const { data, error } = await q.order("created_at", { ascending: true }).order("user_id", { ascending: true })
      .range(debut, debut + taille - 1);
    if (error) throw new Error(`email_tunnel_candidates (page ${debut / taille + 1}) : ${error.message ?? error}`);
    const lignes = Array.isArray(data) ? data : [];
    tous.push(...lignes);
    if (lignes.length < taille) return tous;
  }
}

/**
 * Le compteur du plafond de 2 mails / 24 h pour un passage du tunnel (pur).
 * lignes : les email_logs des comptes visés ({ user_id, email_type, sent_at }) ; maintenant : l'horloge.
 * → { peut(userId) : vrai s'il reste de la place, noter(userId, type) : compte un mail parti dans ce passage, compte(userId) }
 */
export function plafondTunnel(lignes, maintenant = Date.now()) {
  const depuis = maintenant - 24 * 3600_000;
  const n = new Map();
  for (const l of Array.isArray(lignes) ? lignes : []) {
    const t = Date.parse(l?.sent_at ?? "");
    if (!l?.user_id || !Number.isFinite(t) || t <= depuis || t > maintenant + 60_000) continue;
    if (!compteDansPlafond(l.email_type)) continue;
    n.set(String(l.user_id), (n.get(String(l.user_id)) ?? 0) + 1);
  }
  return {
    compte: (u) => n.get(String(u)) ?? 0,
    peut: (u) => (n.get(String(u)) ?? 0) < PLAFOND_24H,
    noter: (u, type) => { if (compteDansPlafond(type)) n.set(String(u), (n.get(String(u)) ?? 0) + 1); },
  };
}
