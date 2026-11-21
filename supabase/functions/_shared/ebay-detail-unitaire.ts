// ═══════════════════════════════════════════════════════════════════════════
// L'ANNONCE eBAY D'ORIGINE D'UN ARTICLE, LUE TOUT DE SUITE (21/11/2026, complément de Nico — nouvel inscrit, points B et C)
// ═══════════════════════════════════════════════════════════════════════════
// Cas (21/11, compte inscrit à 15:04, 188 articles importés d'eBay) : une fiche importée d'eBay attend la lecture de son
// annonce d'origine (son état, toutes ses photos : lectureOrigineEnAttente, _shared/contenu-fiche.js). Cette lecture
// n'était faite QUE par le relevé eBay (ebay-releve-api, cron toutes les 5 min, au plus une demande par 15 min, 60
// détails par passage) : 14 minutes d'attente pour une fiche, jamais pour une autre — la personne a tout annulé, et deux
// tâches Vinted + Leboncoin sont restées « en file » sans partir.
// RÈGLE : quand une publication (ou l'écran de préparation) attend l'annonce eBay d'UN article, elle est lue tout de
// suite, seule, par l'API publique d'eBay (Browse, jeton APPLICATIF : ni extension, ni connexion du compte eBay, aucune
// page ouverte, aucun anti-robot). Les données sont écrites comme le relevé les écrit (annonces_plateforme.donnees_index,
// donnees_index_le) : la base complète la fiche (déclencheur annonce_capture_complete_fiche : toutes les photos, dans
// l'ordre, en pleine taille) et la file la laisse partir. Une annonce terminée (404/410) est notée lue, « introuvable » :
// plus rien à attendre, la copie part avec ce que la fiche porte. 429 / 5xx / réseau : rien n'est conclu (le relevé reste).
import { obtenirJetonApplicatif } from "./ebay-app-token.ts";
import { hotes, type EbayEnv } from "./ebay-oauth.ts";
import { texteDepuisHtml } from "./texte-depuis-html.js";
import { photosEbayPleineTaille } from "./ebay-photos.js";

/** Au plus tant d'annonces lues ainsi par appel de get-pending-jobs (borne : ~1 s chacune). */
export const DETAILS_UNITAIRES_PAR_POLL = 3;
const MARKETPLACE_FR = "EBAY_FR";

type Admin = { from: (t: string) => any };

/** Les données d'une annonce lue par l'API Browse, à la forme de celles du relevé (ebay-trading-releve.ts) — pur. */
export function donneesDepuisBrowse(item: Record<string, unknown>, maintenantIso: string): Record<string, unknown> {
  const image = (item.image as Record<string, unknown> | undefined)?.imageUrl;
  const autres = Array.isArray(item.additionalImages) ? (item.additionalImages as Array<Record<string, unknown>>).map((x) => x?.imageUrl) : [];
  const photos = photosEbayPleineTaille([image, ...autres].filter((u) => typeof u === "string"));
  const aspects: Record<string, string> = {};
  for (const a of Array.isArray(item.localizedAspects) ? (item.localizedAspects as Array<Record<string, unknown>>) : []) {
    const n = String(a?.name ?? "").trim(); const v = String(a?.value ?? "").trim();
    if (n && v) aspects[n] = v;
  }
  const aspect = (...noms: string[]) => { for (const n of noms) for (const [k, v] of Object.entries(aspects)) if (k.toLowerCase() === n.toLowerCase()) return v; return null; };
  const prix = Number((item.price as Record<string, unknown> | undefined)?.value ?? NaN);
  const desc = typeof item.description === "string" ? texteDepuisHtml(item.description).slice(0, 10000) : "";
  const donnees: Record<string, unknown> = {
    source: "ebay_browse",
    lu_le: maintenantIso,
    titre: typeof item.title === "string" ? item.title : null,
    description: desc || null,
    marque: typeof item.brand === "string" && item.brand.trim() ? item.brand.trim() : aspect("Marque", "Brand"),
    taille: aspect("Taille", "Size", "Pointure"),
    couleur: typeof item.color === "string" && item.color.trim() ? item.color.trim() : aspect("Couleur", "Color", "Colour"),
    matiere: typeof item.material === "string" && item.material.trim() ? item.material.trim() : aspect("Matière", "Matériau", "Material"),
    etat: typeof item.condition === "string" && item.condition.trim() ? item.condition.trim() : null,
    categorie: typeof item.categoryPath === "string" ? item.categoryPath.split("|").map((s) => s.trim()).filter(Boolean).join(" > ") : null,
    categorie_id: typeof item.categoryId === "string" ? item.categoryId : null,
    photos,
    prix: Number.isFinite(prix) && prix > 0 ? prix : null,
    caracteristiques: aspects,
  };
  for (const k of Object.keys(donnees)) if (donnees[k] == null) delete donnees[k];
  return donnees;
}

export type LectureUnitaire = { lue: boolean; introuvable?: boolean; motif: string; listing_id?: string; photos?: number };

/**
 * Lit tout de suite l'annonce eBay d'origine d'UNE fiche (celles de ses lignes eBay en ligne dont le détail n'a jamais été
 * lu). `admin` : un client de service. Jamais une ligne déjà lue, jamais plus de 2 appels à eBay.
 */
export async function lireDetailEbayDeLaFiche(admin: Admin, env: EbayEnv, userId: string, inventaireId: number | string,
  { fetchFn = fetch }: { fetchFn?: typeof fetch } = {}): Promise<LectureUnitaire> {
  const { data: lignes, error } = await admin.from("annonces_plateforme")
    .select("id, listing_id, donnees_index_le")
    .eq("user_id", userId).eq("platform", "ebay").eq("inventaire_id", Number(inventaireId)).is("disparu_le", null)
    .order("vu_le", { ascending: false }).limit(2);
  if (error) return { lue: false, motif: `lecture des annonces : ${String(error.message ?? error).slice(0, 80)}` };
  const aLire = ((lignes ?? []) as Array<{ id: string; listing_id: string; donnees_index_le: string | null }>)
    .filter((l) => !l.donnees_index_le && /^\d{9,15}$/.test(String(l.listing_id ?? "")));
  if (!aLire.length) return { lue: false, motif: "rien_a_lire" };
  let jeton: string;
  try { jeton = await obtenirJetonApplicatif(env); }
  catch (e) { return { lue: false, motif: `jeton_applicatif : ${String((e as Error)?.message ?? e).slice(0, 80)}` }; }
  let motif = "illisible";
  for (const l of aLire) {
    const r = await fetchFn(`${hotes(env).api}/buy/browse/v1/item/get_item_by_legacy_id?legacy_item_id=${encodeURIComponent(l.listing_id)}`, {
      headers: { Authorization: `Bearer ${jeton}`, "X-EBAY-C-MARKETPLACE-ID": MARKETPLACE_FR, "Accept-Language": "fr-FR", Accept: "application/json" },
    }).catch(() => null);
    if (!r) { motif = "reseau"; continue; }
    if (r.status === 429 || r.status >= 500) return { lue: false, motif: `ebay_${r.status}` };
    const maintenant = new Date().toISOString();
    if (r.status === 404 || r.status === 410) {
      // Terminée chez eBay : plus rien à lire — la lecture est faite (rien n'attend plus), « introuvable ».
      await admin.from("annonces_plateforme").update({ donnees_index: { source: "ebay_browse", lu_le: maintenant, introuvable: true }, donnees_index_le: maintenant })
        .eq("id", l.id).is("donnees_index_le", null);
      return { lue: true, introuvable: true, motif: "annonce_terminee", listing_id: l.listing_id, photos: 0 };
    }
    if (r.status !== 200) {
      // Un refus DÉFINITIF d'eBay (400, 403…) : l'annonce ne se lira pas — notée lue, « illisible » : jamais une attente
      // pour rien ; la copie part avec ce que la fiche porte (la personne le voit, la tâche ne dort pas).
      await admin.from("annonces_plateforme").update({ donnees_index: { source: "ebay_browse", lu_le: maintenant, illisible: `http_${r.status}` }, donnees_index_le: maintenant })
        .eq("id", l.id).is("donnees_index_le", null);
      return { lue: true, introuvable: true, motif: `ebay_${r.status}`, listing_id: l.listing_id, photos: 0 };
    }
    const item = await r.json().catch(() => ({})) as Record<string, unknown>;
    const donnees = donneesDepuisBrowse(item, maintenant);
    const { error: e2 } = await admin.from("annonces_plateforme").update({ donnees_index: donnees, donnees_index_le: maintenant })
      .eq("id", l.id).is("donnees_index_le", null);
    if (e2) return { lue: false, motif: `écriture : ${String(e2.message ?? e2).slice(0, 80)}` };
    return { lue: true, motif: "lue", listing_id: l.listing_id, photos: Array.isArray(donnees.photos) ? (donnees.photos as unknown[]).length : 0 };
  }
  return { lue: false, motif };
}
