// ═══════════════════════════════════════════════════════════════════════════
// UNE REPUBLICATION REPREND TOUJOURS L'ÉTAT DE SON ANNONCE (03/10, point E)
// ═══════════════════════════════════════════════════════════════════════════
// dew (gratuit, compte Vinted FRANÇAIS dont la page est en ANGLAIS — sonde
// « en-fr ») : 5 republications (sacs à dos, clavier, rangers) arrêtées au
// pré-vol sur « Condition (accepte : New with tags · … · Very good …) »,
// alors que la copie de chaque annonce porte son état (status_id 2 ou 3).
// L'extension pose l'état par son LIBELLÉ FRANÇAIS (« Très bon état »),
// introuvable dans une liste anglaise ; la voie par identifiant (0.6.69) et
// l'état servi dans la langue de la page (get-pending-jobs) étaient réservés
// aux pays de la zone euro OUVERTS — jamais à un compte français.
//
// LA RÈGLE : l'identifiant d'état vient de l'annonce elle-même ; seul son
// libellé dépend de la langue de la page, lue sur ce que Vinted a montré à CE
// compte (racine du rayon capturé, liste d'états relevée — langueVintedDuJob).
// Ce module rend l'état à poser, ou null quand rien n'est sûr :
//   · page française ou langue ambiguë → null (la question est alors légitime,
//     p. ex. un rayon qui n'accepte pas cet état) ;
//   · le libellé doit figurer dans la liste que la page a offerte ;
//   · une seule fois par job (etat_repris) : jamais de boucle.
// Lu par handler-watch (jobs déjà arrêtés, toutes versions d'extension) et
// par get-pending-jobs (état servi avant le prochain essai).
import { ETATS_VINTED, langueVintedDuJob, type LangueVinted } from "./vinted-pays.ts";

type Pf = Record<string, unknown>;
const objet = (v: unknown): Pf | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Pf) : null);
const norm = (s: unknown) => String(s ?? "").normalize("NFC").trim().toLowerCase();

/** L'état de l'annonce d'origine dans la langue de la page, ou null. */
export function etatDansLaLangueDeLaPage(pf: unknown, listeOfferte?: unknown): { valeur: string; langue: LangueVinted; status_id: number } | null {
  const p = objet(pf) ?? {};
  const snap = objet(p.republish_snapshot);
  const sid = Number(snap?.status_id);
  if (!Number.isInteger(sid) || sid <= 0) return null;
  const racine = Array.isArray(snap?.categoryPath) ? (snap!.categoryPath as unknown[])[0] : null;
  const langue = langueVintedDuJob({ racineCapturee: racine, listeEtatsRelevee: listeOfferte });
  if (!langue || langue === "fr") return null;
  const libelle = ETATS_VINTED[langue]?.libelles?.[sid];
  if (!libelle) return null;
  const offertes = Array.isArray(listeOfferte) ? (listeOfferte as unknown[]).map((v) => String(v)) : [];
  if (offertes.length) {
    const exact = offertes.find((v) => norm(v) === norm(libelle));
    if (!exact) return null; // la page ne l'offre pas pour ce rayon : la question reste
    return { valeur: exact, langue, status_id: sid };
  }
  return { valeur: libelle, langue, status_id: sid };
}

/**
 * Une republication Vinted arrêtée au pré-vol sur le SEUL champ « état », que
 * la copie sait remplir : l'état à poser (vintedAspects.condition), ou null.
 */
export function etatReprisPourJob(job: unknown): { valeur: string; langue: LangueVinted; status_id: number } | null {
  const j = objet(job);
  if (!j || j.platform !== "vinted" || j.action !== "republish" || j.status !== "needs_user") return null;
  const pf = objet(j.platform_fields) ?? {};
  if (pf.etat_repris) return null; // déjà repris une fois : jamais en boucle
  if (String(pf.needs_user_source ?? "") !== "prevol_negatif") return null;
  const nuf = objet(pf.needsUserField);
  if (!nuf || String(nuf.field_key ?? "") !== "condition") return null;
  const champs = Array.isArray(pf.champs_a_completer) ? pf.champs_a_completer : [];
  if (champs.length > 1) return null; // d'autres champs manquent : la question reste
  const va = objet(pf.vintedAspects) ?? {};
  if (String(va.condition ?? "").trim()) return null; // la personne a déjà répondu
  return etatDansLaLangueDeLaPage(pf, nuf.allowed_values);
}
