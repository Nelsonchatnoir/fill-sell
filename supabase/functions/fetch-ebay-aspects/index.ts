// Edge function MANUELLE (pas de cron) : récupère les aspects eBay des
// catégories de notre mapping et les upsert dans public.ebay_item_aspects.
//
// Déclenchement (le Bearer doit être la SERVICE_ROLE_KEY — la fonction est
// réservée à l'admin, elle écrit un référentiel) :
//
//   curl -X POST "$SUPABASE_URL/functions/v1/fetch-ebay-aspects" \
//        -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
//        -H "Content-Type: application/json" \
//        -d '{"dry_run": true}'
//
// Corps (tout est optionnel) :
//   { "dry_run": bool           — n'écrit rien, retourne le résumé
//     "strategy": "fetch" | "per_category"   — défaut "fetch" (le dump),
//                                              "per_category" = repli
//     "category_ids": ["123"]   — restreint le lot (défaut : category-ids.json)
//     "marketplace_id": "EBAY_FR" }
//
// Secrets attendus : EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, EBAY_ENV
// (sandbox|production, défaut sandbox — on ne tape jamais la prod par accident).
//
// Déploiement : verify_jwt reste à TRUE (défaut). Ce n'est ni un webhook ni un
// cron : pas de --no-verify-jwt (cf. CLAUDE.md). La service_role key est un JWT
// valide, elle passe verify_jwt ET le contrôle d'égalité ci-dessous.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import categoryIdsFile from "./category-ids.json" with { type: "json" };
import {
  EbayEnv,
  fetchItemAspects,
  getAppToken,
  getDefaultCategoryTreeId,
  getItemAspectsForCategory,
  indexDumpByCategory,
  NormalizedAspect,
} from "./ebay-taxonomy.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, content-type, apikey",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

interface Row {
  category_id: string;
  aspects: NormalizedAspect[];
  aspect_count: number;
  required_count: number;
  status: "ok" | "empty" | "not_found" | "error";
  note: string | null;
  source: "fetch_item_aspects" | "get_item_aspects_for_category";
  category_tree_id: string;
  category_tree_version: string;
  marketplace_id: string;
  ebay_env: EbayEnv;
  fetched_at: string;
}

function makeRow(
  categoryId: string,
  aspects: NormalizedAspect[] | null,
  status: Row["status"],
  note: string | null,
  ctx: { source: Row["source"]; treeId: string; treeVersion: string; marketplace: string; env: EbayEnv },
): Row {
  const list = aspects ?? [];
  return {
    category_id: categoryId,
    aspects: list,
    aspect_count: list.length,
    required_count: list.filter((a) => a.required).length,
    status,
    note,
    source: ctx.source,
    category_tree_id: ctx.treeId,
    category_tree_version: ctx.treeVersion,
    marketplace_id: ctx.marketplace,
    ebay_env: ctx.env,
    fetched_at: new Date().toISOString(),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    // ── Garde admin : seule la service_role key peut déclencher le fetch ────
    // Depuis la migration des clés API (07/2026), la SUPABASE_SERVICE_ROLE_KEY
    // injectée ne correspond plus au JWT legacy que le gateway exige en Bearer :
    // on accepte aussi le secret custom SERVICE_ROLE_KEY (= JWT legacy).
    const injectedKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const customKey = Deno.env.get("SERVICE_ROLE_KEY");
    const auth = req.headers.get("Authorization") ?? "";
    const allowed = [injectedKey, customKey].filter(Boolean).map((k) => `Bearer ${k}`);
    if (!allowed.includes(auth)) {
      return json({ error: "Réservé au service_role (fournir la SERVICE_ROLE_KEY en Bearer)" }, 403);
    }

    const clientId = Deno.env.get("EBAY_CLIENT_ID");
    const clientSecret = Deno.env.get("EBAY_CLIENT_SECRET");
    if (!clientId || !clientSecret) {
      return json(
        {
          error: "EBAY_CLIENT_ID / EBAY_CLIENT_SECRET absents des secrets Supabase",
          hint: "supabase secrets set EBAY_CLIENT_ID=... EBAY_CLIENT_SECRET=... EBAY_ENV=sandbox",
        },
        500,
      );
    }
    // Défaut SANDBOX : on ne tape la production que sur demande explicite.
    const envRaw = Deno.env.get("EBAY_ENV") ?? "sandbox";
    if (envRaw !== "sandbox" && envRaw !== "production") {
      return json({ error: `EBAY_ENV invalide : "${envRaw}" (attendu sandbox|production)` }, 500);
    }
    const env = envRaw as EbayEnv;

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run === true;
    const strategy: "fetch" | "per_category" = body.strategy === "per_category" ? "per_category" : "fetch";
    const marketplace = typeof body.marketplace_id === "string" ? body.marketplace_id : "EBAY_FR";
    const wanted: string[] = Array.isArray(body.category_ids) && body.category_ids.length
      ? body.category_ids.map(String)
      : (categoryIdsFile.categoryIds as string[]);
    const wantedSet = new Set(wanted);

    const token = await getAppToken({ env, clientId, clientSecret });
    const { categoryTreeId, categoryTreeVersion } = await getDefaultCategoryTreeId({
      env,
      token,
      marketplaceId: marketplace,
    });

    const ctxBase = { treeId: categoryTreeId, treeVersion: categoryTreeVersion, marketplace, env };
    const rows: Row[] = [];

    if (strategy === "fetch") {
      // Une seule requête réseau pour tout le marketplace, puis filtrage local.
      const dump = await fetchItemAspects({ env, token, categoryTreeId });
      const byId = indexDumpByCategory(dump, wantedSet);
      const ctx = { ...ctxBase, source: "fetch_item_aspects" as const };

      for (const id of wanted) {
        if (!byId.has(id)) {
          // Silence interdit : la catégorie est explicitement marquée absente
          // du dump plutôt que simplement omise de la table.
          rows.push(makeRow(id, [], "not_found", "categoryId absent du dump fetch_item_aspects", ctx));
          continue;
        }
        const aspects = byId.get(id)!;
        rows.push(
          aspects.length
            ? makeRow(id, aspects, "ok", null, ctx)
            : makeRow(id, [], "empty", "L'API n'a retourné aucun aspect pour cette catégorie", ctx),
        );
      }
    } else {
      // Repli : 1 appel par catégorie, séquentiel et espacé (pas de rafale).
      const ctx = { ...ctxBase, source: "get_item_aspects_for_category" as const };
      for (const id of wanted) {
        try {
          const aspects = await getItemAspectsForCategory({ env, token, categoryTreeId, categoryId: id });
          rows.push(
            aspects.length
              ? makeRow(id, aspects, "ok", null, ctx)
              : makeRow(id, [], "empty", "L'API n'a retourné aucun aspect pour cette catégorie", ctx),
          );
        } catch (e) {
          rows.push(makeRow(id, [], "error", String((e as Error).message).slice(0, 500), ctx));
        }
        await new Promise((r) => setTimeout(r, 250));
      }
    }

    const summary = {
      ebay_env: env,
      marketplace_id: marketplace,
      strategy,
      category_tree_id: categoryTreeId,
      category_tree_version: categoryTreeVersion,
      requested: wanted.length,
      ok: rows.filter((r) => r.status === "ok").length,
      empty: rows.filter((r) => r.status === "empty").length,
      not_found: rows.filter((r) => r.status === "not_found").length,
      error: rows.filter((r) => r.status === "error").length,
      total_aspects: rows.reduce((n, r) => n + r.aspect_count, 0),
      total_required_aspects: rows.reduce((n, r) => n + r.required_count, 0),
      // Les catégories problématiques sont NOMMÉES dans la réponse, pas noyées.
      not_found_ids: rows.filter((r) => r.status === "not_found").map((r) => r.category_id),
      empty_ids: rows.filter((r) => r.status === "empty").map((r) => r.category_id),
      error_ids: rows.filter((r) => r.status === "error").map((r) => r.category_id),
      dry_run: dryRun,
      written: 0,
    };

    if (dryRun) return json(summary);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, (injectedKey ?? customKey)!);
    // Upsert par lots : évite un payload unique énorme (237 lignes × aspects).
    const CHUNK = 50;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await admin
        .from("ebay_item_aspects")
        .upsert(rows.slice(i, i + CHUNK), { onConflict: "category_id" });
      if (error) return json({ error: `upsert ebay_item_aspects : ${error.message}`, summary }, 500);
      summary.written += Math.min(CHUNK, rows.length - i);
    }

    return json(summary);
  } catch (e) {
    console.error("[fetch-ebay-aspects]", e);
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
