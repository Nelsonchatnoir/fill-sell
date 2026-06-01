const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export async function trackTikTokEvent(event: string, email?: string, value?: number) {
 try {
   await fetch(`${SUPABASE_URL}/functions/v1/tiktok-event`, {
     method: "POST",
     headers: { "Content-Type": "application/json" },
     body: JSON.stringify({ event, email, value, currency: "EUR" }),
   });
 } catch (e) {
   console.error("TikTok tracking error", e);
 }
}
