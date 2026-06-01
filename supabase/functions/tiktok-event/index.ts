import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const TIKTOK_ACCESS_TOKEN = Deno.env.get("TIKTOK_ACCESS_TOKEN");
const TIKTOK_PIXEL_ID = Deno.env.get("TIKTOK_PIXEL_ID");

serve(async (req) => {
 if (req.method === "OPTIONS") {
   return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" } });
 }
 const { event, email, value, currency } = await req.json();
 const payload = {
   pixel_code: TIKTOK_PIXEL_ID,
   events: [{
     event,
     event_time: Math.floor(Date.now() / 1000),
     user: { email: email ? await hashSHA256(email) : undefined },
     properties: { currency: currency || "EUR", value: value || 0, content_id: "fillsell_premium", content_type: "product", content_name: "FillSell Premium" }
   }]
 };
 const res = await fetch("https://business-api.tiktok.com/open_api/v1.3/event/track/", {
   method: "POST",
   headers: { "Access-Token": TIKTOK_ACCESS_TOKEN!, "Content-Type": "application/json" },
   body: JSON.stringify(payload),
 });
 const data = await res.json();
 return new Response(JSON.stringify(data), { headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" } });
});

async function hashSHA256(text: string): Promise<string> {
 const encoder = new TextEncoder();
 const data = encoder.encode(text.toLowerCase().trim());
 const hash = await crypto.subtle.digest("SHA-256", data);
 return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}
