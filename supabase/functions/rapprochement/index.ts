// ═══════════════════════════════════════════════════════════════════════════
// rapprochement — LE MOTEUR QUI VA AU BOUT (07/10/2026, règle de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// « Un article n'entre JAMAIS dans le stock tant qu'il n'a pas été rapproché
// de tout ce que l'utilisateur a déjà. » Le rapprochement d'un relevé se
// termine DANS LA FOULÉE, côté serveur, sans nouvel appui ni cron quotidien.
//
// APPELANTS (aucun n'a de session) → verify_jwt = FALSE (déployer avec
// --no-verify-jwt), garde maison sur `x-cron-secret` :
//   · la base, au relevé : rapprocher_releve et trg_rapprochement_fin_run
//     → rapprochement_relancer (pg_net, { user_id }) ;
//   · le filet `rapprochement-1min` (pg_cron, {}), qui ne part QUE s'il y a un
//     compte en retard.
//
// CE QU'ELLE FAIT : pour chaque compte en file, elle appelle
// `rapprochement_avancer` (un passage borné de quelques secondes, sous verrou
// par compte) jusqu'à « termine » ; quand le moteur demande des empreintes,
// elle les fait calculer EN PARALLÈLE par `empreintes-urls` (6 photos par
// appel, 2 s de CPU au plus chacun), puis reprend. Elle ne décide RIEN : tout
// est tranché en base (rapprochement_avancer).
// Budget : 110 s ; au-delà, elle se relance elle-même (une fois) pour finir.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";

const BUDGET_MS = 110_000;
const PASSAGE_MS = 8_000;           // budget d'un appel à rapprochement_avancer
const PHOTOS_PAR_APPEL = 6;         // empreintes-urls : 2 s de CPU par requête
const APPELS_EN_PARALLELE = 10;
const COMPTES_PAR_APPEL = 6;

const json = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { "Content-Type": "application/json" } });

serve(async (req) => {
  const secret = req.headers.get("x-cron-secret");
  const attendu = Deno.env.get("CRON_SECRET");
  if (!secret || !attendu || secret !== attendu) return json({ error: "unauthorized" }, 401);

  let body: { user_id?: unknown; relance?: unknown } = {};
  try { body = await req.json(); } catch { /* corps vide : le filet */ }
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  const debut = Date.now();
  const reste = () => BUDGET_MS - (Date.now() - debut);

  // Les vitesses des relevés (« environ X min ») : au plus une fois par heure.
  await admin.rpc("synchro_vitesses_relire").then(() => {}, () => {});

  let comptes: string[] = [];
  if (typeof body.user_id === "string" && body.user_id) {
    comptes = [body.user_id];
  } else {
    const { data } = await admin.from("rapprochement_comptes").select("user_id")
      .neq("etat", "termine").order("maj_le", { ascending: true }).limit(COMPTES_PAR_APPEL);
    comptes = ((data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id);
  }

  const empreinter = async (urls: string[]) => {
    const lots: string[][] = [];
    for (let i = 0; i < urls.length; i += PHOTOS_PAR_APPEL) lots.push(urls.slice(i, i + PHOTOS_PAR_APPEL));
    let calculees = 0;
    for (let i = 0; i < lots.length && reste() > 15_000; i += APPELS_EN_PARALLELE) {
      const vague = lots.slice(i, i + APPELS_EN_PARALLELE);
      const res = await Promise.all(vague.map((l) =>
        fetch(`${supabaseUrl}/functions/v1/empreintes-urls`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-cron-secret": attendu },
          body: JSON.stringify({ urls: l }),
        }).then((r) => r.json()).catch(() => null)));
      for (const r of res) calculees += Number(r?.calculees) || 0;
    }
    return calculees;
  };

  const bilan: Record<string, unknown>[] = [];
  let inacheve = false;
  for (const user of comptes) {
    const parCompte: Record<string, unknown> = { user, passages: 0, photos: 0 };
    let dernier: Record<string, unknown> | null = null;
    while (true) {
      if (reste() < 12_000) { inacheve = true; break; }
      const { data, error } = await admin.rpc("rapprochement_avancer", { p_user: user, p_budget_ms: PASSAGE_MS });
      parCompte.passages = Number(parCompte.passages) + 1;
      if (error) { parCompte.erreur = error.message; break; }
      dernier = (data ?? {}) as Record<string, unknown>;
      const etat = String(dernier.etat ?? "");
      if (etat === "empreintes") {
        // Plus le temps de calculer : on rend la main (relance), jamais un
        // passage « à vide » qui ferait classer le compte sans ses photos.
        if (reste() < 20_000) { inacheve = true; break; }
        const urls = Array.isArray(dernier.urls) ? (dernier.urls as string[]) : [];
        parCompte.photos = Number(parCompte.photos) + await empreinter(urls);
        continue;
      }
      if (etat === "decision" || etat === "creation") continue;
      break; // termine, attente_releves, occupe, cpu, rien
    }
    parCompte.etat = dernier?.etat ?? null;
    bilan.push(parCompte);
  }

  // Le budget est épuisé et un compte n'est pas fini : une relance, une seule
  // (le filet de la minute reprend de toute façon ce qui resterait).
  if (inacheve && body.relance !== true) {
    const suite = fetch(`${supabaseUrl}/functions/v1/rapprochement`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-cron-secret": attendu },
      body: JSON.stringify({ ...(typeof body.user_id === "string" ? { user_id: body.user_id } : {}), relance: true }),
    }).catch(() => {});
    // deno-lint-ignore no-explicit-any
    (globalThis as any).EdgeRuntime?.waitUntil?.(suite);
  }

  const sortie = { comptes: bilan, duree_ms: Date.now() - debut, inacheve };
  console.log("[rapprochement]", JSON.stringify(sortie));
  return json(sortie);
});
