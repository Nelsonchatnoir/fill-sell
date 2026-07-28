import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AppleKeyError, genererJWTApple } from "../_shared/apple-jwt.ts";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const BUNDLE_ID       = "app.fillsell.app";
const APPLE_PROD_URL  = "https://api.storekit.itunes.apple.com";
const APPLE_SBX_URL   = "https://api.storekit-sandbox.itunes.apple.com";

// Secrets Supabase requis :
//   APPLE_API_KEY_ID       — Key ID de la clé « Achat intégré » (App Store
//                            Connect → Utilisateurs et accès → Intégrations →
//                            Achat intégré). PAS une clé d'équipe : celles-ci
//                            ne peuvent pas signer un JWT à claim `bid` pour
//                            l'App Store Server API (401). Constaté le 28/07 :
//                            la section était vide, aucune clé n'existait, et
//                            cette fonction n'a donc JAMAIS pu répondre.
//   APPLE_ISSUER_ID        — Issuer ID de la même page
//   APPLE_API_PRIVATE_KEY  — contenu du .p8 (le chargeur partagé tolère les
//                            formats mangés, cf. ../_shared/apple-jwt.ts)

async function fetchAppleStatus(originalTransactionId: string, sandbox = false): Promise<Response> {
  const base = sandbox ? APPLE_SBX_URL : APPLE_PROD_URL;
  const jwt  = await genererJWTApple(BUNDLE_ID);
  return fetch(`${base}/inApps/v1/subscriptions/${originalTransactionId}`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
}

serve(async (req) => {
  const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, content-type, apikey, x-admin-key",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const url        = new URL(req.url);
    const adminKey   = req.headers.get("x-admin-key") ?? "";
    const serviceKey = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const isAdmin    = adminKey && serviceKey && adminKey === serviceKey;

    let targetUserId: string;

    if (isAdmin) {
      // Mode admin : userId ou email en query param
      const email = url.searchParams.get("email");
      const uid   = url.searchParams.get("userId");

      if (email) {
        const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
        const found = users?.find((u) => u.email === email);
        if (!found) {
          return new Response(JSON.stringify({ error: `No user found for email ${email}` }), {
            status: 404,
            headers: { ...CORS, "Content-Type": "application/json" },
          });
        }
        targetUserId = found.id;
      } else if (uid) {
        targetUserId = uid;
      } else {
        return new Response(JSON.stringify({ error: "Admin mode: provide ?userId= or ?email=" }), {
          status: 400,
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      }
    } else {
      const authHeader = req.headers.get("Authorization") ?? "";
      const jwt = authHeader.replace("Bearer ", "").trim();
      const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(jwt);
      if (authError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      }
      targetUserId = url.searchParams.get("userId") ?? user.id;
    }

    const { data: profile, error: dbErr } = await supabaseAdmin
      .from("profiles")
      .select("username, is_premium, is_founder, apple_original_transaction_id")
      .eq("id", targetUserId)
      .single();

    if (dbErr || !profile) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    if (!profile.apple_original_transaction_id) {
      return new Response(JSON.stringify({
        error: "No originalTransactionId stored yet for this user",
        hint: "It will be populated automatically when Apple sends the next SUBSCRIBED/DID_RENEW webhook",
        db: {
          username: profile.username,
          is_premium: profile.is_premium,
          is_founder: profile.is_founder,
        },
      }), {
        status: 422,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    let appleRes = await fetchAppleStatus(profile.apple_original_transaction_id, false);

    // 404 in production = sandbox transaction
    if (appleRes.status === 404) {
      appleRes = await fetchAppleStatus(profile.apple_original_transaction_id, true);
    }

    const appleData = await appleRes.json();

    return new Response(JSON.stringify({
      db: {
        username: profile.username,
        is_premium: profile.is_premium,
        is_founder: profile.is_founder,
      },
      apple: appleData,
    }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const diag = err instanceof AppleKeyError ? err.diag : undefined;
    console.error("[apple-subscription-status] Error:", msg, diag ? JSON.stringify(diag) : "");
    return new Response(JSON.stringify({ error: msg, ...(diag ? { diag } : {}) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
