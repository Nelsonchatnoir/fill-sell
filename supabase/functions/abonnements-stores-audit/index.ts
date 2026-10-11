// ═══════════════════════════════════════════════════════════════════════════
// AUDIT — LE PALIER PAYÉ CHEZ APPLE / GOOGLE CONTRE LE PALIER CHEZ NOUS (12/10, A8)
// ═══════════════════════════════════════════════════════════════════════════
// Demande de Nico (11/10, après Ciddjy) : « Vérifie à la racine qu'aucun autre
// client n'est dans ce cas, Apple ET Google, depuis le premier abonnement :
// tout passage de palier ou changement d'offre payé sans effet chez nous.
// Donne-moi la liste exacte, même vide. »
// LECTURE SEULE. Pour chaque profil qui porte un abonnement de store :
//   · Apple : l'historique COMPLET de l'abonnement (App Store Server API v2,
//     /inApps/v2/history — depuis le premier achat), chaque transaction
//     décodée ; palier payé EN COURS = la transaction la plus récente non
//     révoquée et non échue ; les passages (isUpgraded) et offres sont listés ;
//   · Google : l'abonnement lu chez Google (subscriptionsv2) — produit, état,
//     échéance, jeton remplacé (linkedPurchaseToken) ;
// puis compare au palier de nos drapeaux (is_business > is_pro > is_premium).
// « paye_sans_effet » = le store encaisse un palier SUPÉRIEUR à celui qu'on
// donne : le cas de Ciddjy, à corriger. Rien n'est écrit, nulle part.
// Garde : x-cron-secret (appel interne seulement). verify_jwt = false.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import { genererJWTApple } from "../_shared/apple-jwt.ts";
import { jetonGooglePlay } from "../_shared/google-play-token.ts";

const BUNDLE_ID = "app.fillsell.app";
const APPLE_PROD_URL = "https://api.storekit.itunes.apple.com";
const PACKAGE_NAME = "app.fillsell.app";
const RANG: Record<string, number> = { aucun: 0, premium: 1, pro: 2, business: 3 };

/** Le palier d'un produit de store (Cloud et packs : aucun palier). */
function palierDuProduit(id: string | null | undefined): string | null {
  const p = String(id ?? "");
  if (/business/.test(p)) return "business";
  if (/\.pro2?\.sub$/.test(p)) return "pro";
  if (/premium\.(sub|standard)$/.test(p)) return "premium";
  return null;
}

function decoder(jws: string): Record<string, unknown> {
  const b64 = jws.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64.padEnd(b64.length + (4 - (b64.length % 4)) % 4, "="));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
}

const iso = (ms: unknown) => (typeof ms === "number" ? new Date(ms).toISOString() : null);

serve(async (req) => {
  const attendu = Deno.env.get("CRON_SECRET");
  if (!attendu || req.headers.get("x-cron-secret") !== attendu) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: profils, error } = await admin.from("profiles")
    .select("id, is_premium, is_pro, is_business, is_comped, apple_original_transaction_id, google_purchase_token, google_product_id")
    .or("apple_original_transaction_id.not.is.null,google_purchase_token.not.is.null");
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  const maintenant = Date.now();
  const lignes: Array<Record<string, unknown>> = [];
  const jwtApple = await genererJWTApple(BUNDLE_ID).catch(() => null);
  const jetonGoogle = await jetonGooglePlay().catch(() => null);

  for (const p of (profils ?? []) as Array<Record<string, unknown>>) {
    const chezNous = p.is_business ? "business" : p.is_pro ? "pro" : (p.is_premium || p.is_comped) ? "premium" : "aucun";
    // ── Apple ──────────────────────────────────────────────────────────────
    if (p.apple_original_transaction_id && jwtApple) {
      const transactions: Array<Record<string, unknown>> = [];
      let revision: string | undefined; let tours = 0; let erreur: string | null = null;
      do {
        const url = new URL(`${APPLE_PROD_URL}/inApps/v2/history/${p.apple_original_transaction_id}`);
        url.searchParams.set("sort", "ASCENDING");
        if (revision) url.searchParams.set("revision", revision);
        const r = await fetch(url, { headers: { Authorization: `Bearer ${jwtApple}` } });
        if (!r.ok) { erreur = `apple_${r.status}`; break; }
        const page = await r.json();
        for (const s of page.signedTransactions ?? []) { try { transactions.push(decoder(s as string)); } catch { /* illisible */ } }
        revision = page.hasMore ? page.revision : undefined; tours++;
      } while (revision && tours < 20);
      const abonnements = transactions.filter((t) => palierDuProduit(t.productId as string) !== null);
      const enCours = abonnements
        .filter((t) => !t.revocationDate && typeof t.expiresDate === "number" && (t.expiresDate as number) > maintenant)
        .sort((a, b) => Number(b.purchaseDate) - Number(a.purchaseDate))[0] ?? null;
      const paye = enCours ? palierDuProduit(enCours.productId as string) ?? "aucun" : "aucun";
      lignes.push({
        canal: "apple", user_id: p.id, original_transaction_id: p.apple_original_transaction_id, erreur,
        palier_paye: paye, palier_chez_nous: chezNous,
        paye_sans_effet: RANG[paye] > RANG[chezNous],
        droit_sans_paiement_store: RANG[chezNous] > RANG[paye],
        en_cours: enCours ? { produit: enCours.productId, achat: iso(enCours.purchaseDate), echeance: iso(enCours.expiresDate), environnement: enCours.environment } : null,
        changements: abonnements.filter((t) => t.isUpgraded || t.offerType || t.revocationDate)
          .map((t) => ({ produit: t.productId, achat: iso(t.purchaseDate), remplace: !!t.isUpgraded, offre: t.offerType ?? null, revoque: iso(t.revocationDate), motif_revocation: t.revocationReason ?? null })),
        transactions: abonnements.map((t) => ({ produit: t.productId, achat: iso(t.purchaseDate), echeance: iso(t.expiresDate), raison: t.transactionReason ?? null, remplace: !!t.isUpgraded })),
      });
    }
    // ── Google ─────────────────────────────────────────────────────────────
    if (p.google_purchase_token && jetonGoogle) {
      const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}/purchases/subscriptionsv2/tokens/${p.google_purchase_token}`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${jetonGoogle}` } });
      if (!r.ok) {
        lignes.push({ canal: "google", user_id: p.id, erreur: `google_${r.status}`, palier_chez_nous: chezNous, produit_chez_nous: p.google_product_id });
        continue;
      }
      const s = await r.json();
      const items = (s.lineItems ?? []) as Array<Record<string, unknown>>;
      const actif = ["SUBSCRIPTION_STATE_ACTIVE", "SUBSCRIPTION_STATE_IN_GRACE_PERIOD"].includes(s.subscriptionState)
        || (s.subscriptionState === "SUBSCRIPTION_STATE_CANCELED" && items.some((i) => Date.parse(String(i.expiryTime ?? "")) > maintenant));
      const meilleur = items.map((i) => palierDuProduit(i.productId as string) ?? "aucun").sort((a, b) => RANG[b] - RANG[a])[0] ?? "aucun";
      const paye = actif ? meilleur : "aucun";
      lignes.push({
        canal: "google", user_id: p.id, palier_paye: paye, palier_chez_nous: chezNous,
        paye_sans_effet: RANG[paye] > RANG[chezNous], droit_sans_paiement_store: RANG[chezNous] > RANG[paye],
        etat: s.subscriptionState, produits: items.map((i) => ({ produit: i.productId, echeance: i.expiryTime ?? null })),
        jeton_remplace: s.linkedPurchaseToken ? true : false, produit_chez_nous: p.google_product_id ?? null,
        debut: s.startTime ?? null,
      });
    }
  }
  const payeSansEffet = lignes.filter((l) => l.paye_sans_effet);
  return new Response(JSON.stringify({
    le: new Date().toISOString(), abonnes_lus: lignes.length,
    apple_lisible: !!jwtApple, google_lisible: !!jetonGoogle,
    paye_sans_effet: payeSansEffet, lignes,
  }), { headers: { "Content-Type": "application/json" } });
});
