import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = ["https://fillsell.app", "capacitor://localhost"];

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const BUNDLE_ID = "app.fillsell.app";
const PREMIUM_PRODUCT_ID = "app.fillsell.premium.monthly";

async function verifyWithApple(receipt: string, url: string): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      "receipt-data": receipt,
      "password": Deno.env.get("APPLE_SHARED_SECRET")!,
      "exclude-old-transactions": true,
    }),
  });
  return res.json();
}

serve(async (req) => {
  const origin = req.headers.get("origin") || "";
  const corsOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : "https://fillsell.app";
  const CORS = {
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "").trim();

    if (!jwt) {
      return new Response(JSON.stringify({ error: "JWT manquant" }), {
        status: 401,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const { data: { user: authUser }, error: authError } = await supabaseAdmin.auth.getUser(jwt);
    if (authError || !authUser) {
      return new Response(JSON.stringify({ error: "Token invalide ou expiré" }), {
        status: 401,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const { receipt, userId } = await req.json();

    if (!receipt || !userId) {
      return new Response(JSON.stringify({ error: "receipt et userId requis" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    if (userId !== authUser.id) {
      return new Response(JSON.stringify({ error: "userId ne correspond pas au JWT" }), {
        status: 403,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    let appleData = await verifyWithApple(receipt, "https://buy.itunes.apple.com/verifyReceipt");

    // status 21007 = sandbox receipt sent to production → retry on sandbox
    if (appleData.status === 21007) {
      appleData = await verifyWithApple(receipt, "https://sandbox.itunes.apple.com/verifyReceipt");
    }

    if (appleData.status !== 0) {
      console.error("[validate-apple-receipt] Apple status:", appleData.status);
      await supabaseAdmin.from("profiles").update({ is_premium: false }).eq("id", userId);
      return new Response(JSON.stringify({ success: true, is_premium: false }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const bundleId = appleData.receipt?.bundle_id;
    if (bundleId !== BUNDLE_ID) {
      console.error("[validate-apple-receipt] bundle_id mismatch:", bundleId);
      return new Response(JSON.stringify({ error: "bundle_id invalide" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const inApp: any[] = appleData.latest_receipt_info ?? appleData.receipt?.in_app ?? [];
    const now = Date.now();

    const activeSub = inApp.find((tx: any) => {
      if (tx.product_id !== PREMIUM_PRODUCT_ID) return false;
      const expires = tx.expires_date_ms ? parseInt(tx.expires_date_ms) : 0;
      return expires > now;
    });

    const isPremium = !!activeSub;

    await supabaseAdmin.from("profiles").update({ is_premium: isPremium }).eq("id", userId);

    console.log(`[validate-apple-receipt] userId=${userId} is_premium=${isPremium}`);

    return new Response(JSON.stringify({ success: true, is_premium: isPremium }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("[validate-apple-receipt] Erreur inattendue:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
