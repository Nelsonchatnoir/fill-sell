// ═══════════════════════════════════════════════════════════════════════════
// LE TYPE DE VENDEUR eBAY D'UN COMPTE, LU CHEZ eBAY (06/11, Nico, point 5)
// ═══════════════════════════════════════════════════════════════════════════
// « Pas de retour » n'est permis qu'à un particulier (_shared/ebay-retours.js). La voie API le lit par GetUser
// (ebay-account, checklist → ebay_accounts.seller_state.type_vendeur). La voie EXTENSION n'a pas de connexion API :
// le type se lit sur une annonce eBay EN LIGNE du compte, par l'API Browse (jeton applicatif, aucune donnée du
// compte) : item.seller.sellerAccountType. Rien de lisible → null (« Pas de retour » n'est alors pas proposé).
// deno-lint-ignore-file no-explicit-any
import { hotes, lireEnvEbay } from "./ebay-oauth.ts";
import { obtenirJetonApplicatif } from "./ebay-app-token.ts";
import { typeVendeurEbayDeBrowse } from "./ebay-retours.js";

export async function typeVendeurEbayDuCompte(admin: any, userId: string): Promise<{ type: string | null; source: string }> {
  try {
    const { data: compte } = await admin.from("ebay_accounts").select("seller_state").eq("user_id", userId).maybeSingle();
    const tv = compte?.seller_state?.type_vendeur;
    if (tv === "professionnel" || tv === "particulier") return { type: tv, source: "getuser_api" };
    const { data: annonces } = await admin.from("annonces_plateforme").select("listing_id")
      .eq("user_id", userId).eq("platform", "ebay").is("disparu_le", null).is("retiree_le", null)
      .order("vu_le", { ascending: false }).limit(3);
    const env = lireEnvEbay();
    let token: string | null = null;
    for (const a of (annonces ?? []) as Array<{ listing_id: string }>) {
      const id = String(a.listing_id ?? "").trim();
      if (!/^\d{9,15}$/.test(id)) continue;
      token ??= await obtenirJetonApplicatif(env);
      const r = await fetch(`${hotes(env).api}/buy/browse/v1/item/get_item_by_legacy_id?legacy_item_id=${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_FR", Accept: "application/json" },
      }).catch(() => null);
      if (!r || r.status !== 200) continue;
      const type = typeVendeurEbayDeBrowse(await r.json().catch(() => ({})));
      if (type) return { type, source: `browse:${id}` };
    }
    return { type: null, source: "illisible" };
  } catch (e) {
    return { type: null, source: `erreur:${String((e as Error)?.message ?? e).slice(0, 80)}` };
  }
}
