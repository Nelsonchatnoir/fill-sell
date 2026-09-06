// Jeton APPLICATIF eBay (client credentials, scope api_scope) — pour les
// lectures publiques (Browse) qui n'engagent aucun vendeur.
//
// Copie volontaire de obtenirAppToken (ebay-notification.ts, 06/09) : le
// module des notifications appartient à ebay-account-deletion, gelé par
// consigne (« pas touché ») ; l'importer depuis le worker le faisait entrer
// dans le `deno check` du worker, qui trébuche sur un typage BufferSource de
// ce module avec le Deno local. Ici : même mécanique, cache d'une heure.
import { hotes, type EbayEnv } from "./ebay-oauth.ts";

let cache: { token: string; exp: number } | null = null;

export async function obtenirJetonApplicatif(env: EbayEnv): Promise<string> {
  const clientId = Deno.env.get("EBAY_CLIENT_ID") ?? "";
  const clientSecret = Deno.env.get("EBAY_CLIENT_SECRET") ?? "";
  if (!clientId || !clientSecret) throw new Error("EBAY_CLIENT_ID / EBAY_CLIENT_SECRET absents");
  if (cache && cache.exp - Date.now() > 60_000) return cache.token;
  const r = await fetch(`${hotes(env).api}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: "https://api.ebay.com/oauth/api_scope" }).toString(),
  });
  const json = await r.json().catch(() => ({})) as { access_token?: string; expires_in?: number; error?: string };
  if (!r.ok || !json.access_token) throw new Error(`jeton applicatif refusé : HTTP ${r.status} ${json.error ?? ""}`);
  cache = { token: json.access_token, exp: Date.now() + (json.expires_in ?? 7200) * 1000 };
  return json.access_token;
}
