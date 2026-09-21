// ═══════════════════════════════════════════════════════════════════════════
// OÙ LE JOB S'EST ARRÊTÉ, ET CE QUE ÇA VEUT DIRE (2026-09-21)
// ═══════════════════════════════════════════════════════════════════════════
// Deux questions, un seul endroit, parce qu'elles se posent ensemble :
//   1. quelle est la page de fin de la DERNIÈRE tentative ?
//   2. cette page est-elle le mur de connexion de la plateforme du job ?
//
// ⛔ POURQUOI UNE LISTE, ET PAS UNE CASE (le défaut mesuré le 21/09).
// `work_window_state.at_end` est ÉCRASÉ à chaque tentative. Pendant la mesure
// du mur d'inscription vendeur eBay, la trace qui avait ouvert le chantier a
// disparu sous nos yeux : à 18h07 le job portait onboardweb.ebay.fr, à 18h20
// il portait /lstng/error. Une seule case ne peut pas dire « ce compte a buté
// trois fois sur le même mur » — donc on ne saura jamais combien de gens
// butent sur quoi. L'extension 0.6.50 écrira `work_window_state.fins`, une
// entrée par tentative, bornée. Ici, on lit la LISTE si elle existe, la case
// sinon : le parc entier est couvert sans attendre le paquet.
//
// ⛔ ON LIT LA DERNIÈRE ENTRÉE, JAMAIS « N'IMPORTE LAQUELLE ». Un job qui a
//    buté sur un mur à la tentative 1 et qui l'a franchi à la 3e n'est plus
//    devant ce mur : décider sur une entrée ancienne, ce serait arrêter un job
//    qui repartait très bien.

/** Une page de fin relevée par l'extension au terme d'une tentative. */
export interface FinDeJob {
  tab_url: string | null;
  fill_step: string | null;
  at: string | null;
}

/**
 * La page de fin de la DERNIÈRE tentative.
 * Lit `work_window_state.fins` (liste, 0.6.50+) et, à défaut,
 * `work_window_state.at_end` (case unique, tout le parc d'avant).
 */
export function derniereFinDeJob(platformFields: unknown): FinDeJob | null {
  const pf = (platformFields ?? null) as Record<string, unknown> | null;
  const wws = (pf?.work_window_state ?? null) as Record<string, unknown> | null;
  if (!wws) return null;
  const brut = Array.isArray(wws.fins) && wws.fins.length
    ? wws.fins[wws.fins.length - 1]
    : wws.at_end;
  const e = (brut ?? null) as Record<string, unknown> | null;
  if (!e || typeof e !== "object") return null;
  return {
    tab_url: typeof e.tab_url === "string" && e.tab_url ? e.tab_url : null,
    fill_step: e.fill_step == null ? null : String(e.fill_step),
    at: typeof e.at === "string" && e.at ? e.at : null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// LE MUR DE CONNEXION D'UNE PLATEFORME
// ═══════════════════════════════════════════════════════════════════════════
// ⛔ UNE PAGE D'INSCRIPTION N'EST PAS LA PREUVE D'UNE ABSENCE DE COMPTE
//    (correction du 21/09). `vinted.fr/member/register/select_type` est la
//    page où Vinted renvoie TOUT visiteur non connecté, qu'il ait un compte ou
//    non. On ne sait pas distinguer les deux, donc on ne l'affirme jamais :
//    ces pages-là valent « pas connecté », et le message est le même pour
//    tout le monde — « en attente de ta connexion ».
//    (Le cas eBay est différent et vit ailleurs : sur onboardweb.ebay.fr la
//    personne EST connectée, c'est son compte qui n'est pas vendeur. Voir
//    _shared/ebay-page-vendeur.ts.)
// ⛔ L'HÔTE DOIT ÊTRE CELUI DE LA PLATEFORME DU JOB. Sans ça, un job Vinted
//    qui finit sur beebs.app conclurait « reconnecte-toi à Vinted ».

/** L'adresse est-elle le mur de connexion/entrée de CETTE plateforme ? */
export function estPageDeConnexionPlateforme(platform: unknown, u: unknown): boolean {
  if (typeof u !== "string" || !u) return false;
  try {
    const url = new URL(u);
    const h = url.hostname.toLowerCase();
    const p = url.pathname.toLowerCase();
    switch (platform) {
      case "beebs":
        // beebs.app/fr/auth et beebs.app/auth — mesurés en prod (25 jobs).
        return /(^|\.)beebs\.app$/.test(h) && /\/(login|signin|connexion)|\/auth(\/|$)/.test(p);
      case "vinted":
        // /member/register/* AJOUTÉ le 21/09 : c'est là que Vinted renvoie un
        // visiteur non connecté (7 jobs, 6 comptes, 0 publication ensuite).
        return /(^|\.)vinted\.[a-z]{2,3}(\.[a-z]{2,3})?$/.test(h)
          && /^\/(auth|login|member\/(signup_login|register|signup|login))(\/|$)/.test(p);
      case "leboncoin":
        return (/(^|\.)auth\.leboncoin\.fr$/.test(h))
          || (/(^|\.)leboncoin\.fr$/.test(h) && p.startsWith("/connexion"));
      case "ebay":
        // signin.ebay.* seulement : l'inscription VENDEUR (onboardweb) n'est
        // pas un défaut de connexion, elle a sa propre cause et son message.
        return /^signin\.ebay\.[a-z]{2,3}(\.[a-z]{2,3})?$/.test(h);
      case "opla":
        return /(^|\.)opla\.co$/.test(h) && /^\/(login|signin|connexion|auth)(\/|$)/.test(p);
      default:
        return false;
    }
  } catch {
    // Pas une URL : pas un mur de connexion.
    return false;
  }
}

/** Les plateformes qui ont un mur de connexion reconnu. */
export const PLATEFORMES_AVEC_MUR = ["beebs", "vinted", "leboncoin", "ebay", "opla"] as const;

/**
 * L'adresse est-elle le mur de connexion d'UNE plateforme, laquelle qu'elle
 * soit ? Sert de pré-filtre : il évite de lire la ligne du job pour les
 * verdicts qui, de toute évidence, ne sont pas devant un mur. La décision,
 * elle, se prend toujours avec la plateforme du job (ci-dessus).
 */
export function estPageDeConnexionQuelconque(u: unknown): boolean {
  return PLATEFORMES_AVEC_MUR.some((p) => estPageDeConnexionPlateforme(p, u));
}
