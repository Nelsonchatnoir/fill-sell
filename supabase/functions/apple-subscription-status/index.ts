import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const BUNDLE_ID       = "app.fillsell.app";
const APPLE_PROD_URL  = "https://api.storekit.itunes.apple.com";
const APPLE_SBX_URL   = "https://api.storekit-sandbox.itunes.apple.com";

// Supabase secrets required:
//   APPLE_API_KEY_ID       — Key ID from App Store Connect → Users & Access → Keys
//   APPLE_ISSUER_ID        — Issuer ID (same page, top of the Keys tab)
//   APPLE_API_PRIVATE_KEY  — Full PEM content of the .p8 file (BEGIN PRIVATE KEY … END PRIVATE KEY)
async function generateAppleJWT(): Promise<string> {
  const keyId    = Deno.env.get("APPLE_API_KEY_ID")!;
  const issuerId = Deno.env.get("APPLE_ISSUER_ID")!;
  const pem      = Deno.env.get("APPLE_API_PRIVATE_KEY")!;

  const pemContent = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");

  const der = Uint8Array.from(atob(pemContent), (c) => c.charCodeAt(0));

  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const now = Math.floor(Date.now() / 1000);

  const b64url = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const headerB64  = b64url({ alg: "ES256", kid: keyId, typ: "JWT" });
  const payloadB64 = b64url({
    iss: issuerId,
    iat: now,
    exp: now + 1200,
    aud: "appstoreconnect-v1",
    bid: BUNDLE_ID,
  });
  const signingInput = `${headerB64}.${payloadB64}`;

  const rawSig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    new TextEncoder().encode(signingInput)
  );

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(rawSig)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  return `${signingInput}.${sigB64}`;
}

async function fetchAppleStatus(originalTransactionId: string, sandbox = false): Promise<Response> {
  const base = sandbox ? APPLE_SBX_URL : APPLE_PROD_URL;
  const jwt  = await generateAppleJWT();
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
    console.error("[apple-subscription-status] Error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
