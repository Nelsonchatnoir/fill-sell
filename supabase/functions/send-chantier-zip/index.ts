import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// NEUTRALISÉE le 2026-08-25 après l'acceptation du 0.6.7 au Chrome Web Store.
// C'était un one-shot (24/08) pour envoyer le zip CWS à Nico par mail pendant
// qu'il était à l'étranger sans PC. Elle n'a plus de raison d'exister et ne
// doit plus pouvoir envoyer de pièce jointe arbitraire.
// La suppression DÉFINITIVE se fait depuis le PC :
//   npx supabase functions delete send-chantier-zip
// En attendant, tout appel est refusé.

serve(() =>
  new Response(
    JSON.stringify({ error: "gone", note: "send-chantier-zip neutralisee le 2026-08-25" }),
    { status: 410, headers: { "Content-Type": "application/json" } },
  )
);
