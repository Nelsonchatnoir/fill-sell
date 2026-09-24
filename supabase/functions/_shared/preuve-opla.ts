// ══════════════════════════════════════════════════════════════════════════
// LA PREUVE QU'UN COMPTE A AUTORISÉ OPLA — LUE EN BASE, POUR TOUS LES BUILDS
// (2026-09-24, solene.mantero · Thomas Dri)
// ══════════════════════════════════════════════════════════════════════════
// LE VERROU. Un poste d'avant la 0.6.64 ne DÉCLARE pas son accès Opla :
// update-job-status l'apprend de ses écritures, et un parcage « Autoriser
// Opla » le marque `opla_acces: false`. Dès lors get-pending-jobs ne lui sert
// plus AUCUN job Opla — donc plus rien ne peut jamais réapprendre `true`. Si la
// personne autorise ensuite, la 0.6.61 relance bien ses jobs (popup →
// OPLA_ACCES_ACCORDE → rearmerJobsOplaEnAttente), mais ils ne lui sont pas
// servis, et handler-watch les re-parque 30 min plus tard « aucun poste avec
// accès ». L'autorisation ne levait jamais l'attente.
//
// LA RÈGLE. Ce module dit si le compte a une PREUVE RÉELLE d'accès Opla plus
// récente que toute preuve contraire. Preuves positives (l'extension a lu ou
// écrit sur opla.co, ou a vu la permission accordée) :
//   · un relevé Opla abouti (vinted_sync_runs platform=opla, status=done,
//     kind ≠ 'connexion') ;
//   · une publication Opla aboutie par l'extension (published_at) ;
//   · une relance posée PAR L'EXTENSION après l'octroi dans le popup
//     (platform_fields.opla_acces_accorde_le sans accorde_par serveur).
// Preuves contraires : un relevé « accès Opla non accordé »
// (chrome.permissions.contains = false), et le moment où le poste a été
// appris sans accès (opla_acces_le), quand il est connu.
// ⛔ JAMAIS une preuve :
//   · une « connexion » Opla `done` — pour Opla, elle veut dire « le popup
//     s'est ouvert sur cet ordinateur », pas « la personne a autorisé » ;
//   · un 401 de sonde, dans un sens comme dans l'autre (cf. 0.6.65).

// deno-lint-ignore no-explicit-any
type Admin = any;

export type PreuveOpla = { le: string; source: string } | null;

const plusRecent = (a: string | null | undefined, b: string | null | undefined): string | null => {
  const ta = Date.parse(String(a ?? "")), tb = Date.parse(String(b ?? ""));
  if (!Number.isFinite(ta)) return Number.isFinite(tb) ? String(b) : null;
  if (!Number.isFinite(tb)) return String(a);
  return ta >= tb ? String(a) : String(b);
};

/**
 * La preuve positive la plus récente, si elle est postérieure à `apres` (le
 * moment où le poste a été appris sans accès) ET à tout relevé « accès non
 * accordé ». Sinon null. Trois lectures bornées, best-effort.
 */
export async function preuveAccesOpla(admin: Admin, userId: string, apres: string | null = null): Promise<PreuveOpla> {
  const candidats: Array<{ le: string; source: string }> = [];
  const { data: rel } = await admin.from("vinted_sync_runs")
    .select("finished_at, kind").eq("user_id", userId).eq("platform", "opla")
    .eq("status", "done").neq("kind", "connexion").not("finished_at", "is", null)
    .order("finished_at", { ascending: false }).limit(1);
  if (rel?.[0]?.finished_at) candidats.push({ le: rel[0].finished_at, source: `relevé Opla abouti (${rel[0].kind})` });

  const { data: pub } = await admin.from("cross_post_jobs")
    .select("published_at, handler_build").eq("user_id", userId).eq("platform", "opla")
    .eq("status", "published").not("published_at", "is", null)
    .neq("handler_build", "releve-annonces")
    .order("published_at", { ascending: false }).limit(1);
  if (pub?.[0]?.published_at) candidats.push({ le: pub[0].published_at, source: "publication Opla aboutie" });

  const { data: acc } = await admin.from("cross_post_jobs")
    .select("platform_fields").eq("user_id", userId).eq("platform", "opla")
    .not("platform_fields->>opla_acces_accorde_le", "is", null)
    .is("platform_fields->>opla_acces_accorde_par", null)
    .order("created_at", { ascending: false }).limit(20);
  let accorde: string | null = null;
  for (const j of (acc ?? []) as Array<{ platform_fields: Record<string, unknown> | null }>) {
    accorde = plusRecent(accorde, String(j.platform_fields?.["opla_acces_accorde_le"] ?? ""));
  }
  if (accorde) candidats.push({ le: accorde, source: "autorisation accordée dans le popup (relance de l'extension)" });

  if (!candidats.length) return null;
  const meilleure = candidats.sort((a, b) => Date.parse(b.le) - Date.parse(a.le))[0];
  const tPreuve = Date.parse(meilleure.le);
  if (!Number.isFinite(tPreuve)) return null;

  // Preuve contraire : le poste appris sans accès APRÈS elle.
  const tApres = Date.parse(String(apres ?? ""));
  if (Number.isFinite(tApres) && tApres >= tPreuve) return null;
  // Preuve contraire : un relevé « accès Opla non accordé » APRÈS elle.
  const { data: neg } = await admin.from("vinted_sync_runs")
    .select("finished_at").eq("user_id", userId).eq("platform", "opla")
    .ilike("erreur", "%accès Opla non accordé%").not("finished_at", "is", null)
    .order("finished_at", { ascending: false }).limit(1);
  const tNeg = Date.parse(String(neg?.[0]?.finished_at ?? ""));
  if (Number.isFinite(tNeg) && tNeg >= tPreuve) return null;
  return meilleure;
}
