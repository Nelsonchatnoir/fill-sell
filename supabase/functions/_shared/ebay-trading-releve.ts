// ═══════════════════════════════════════════════════════════════════════════
// LE RELEVÉ eBAY PAR L'API TRADING, SUR LE COMPTE RELIÉ (04/10, Louis)
// ═══════════════════════════════════════════════════════════════════════════
// Deux lectures, toutes deux en LECTURE SEULE, avec le jeton du vendeur
// (en-tête X-EBAY-API-IAF-TOKEN, comme GetUser dans ebay-oauth.ts) :
//   · GetMyeBaySelling, liste ACTIVE — toutes les annonces en ligne du compte,
//     celles déposées sur ebay.fr à la main comprises (l'API Inventory ne voit
//     que les siennes), 200 par page ;
//   · GetItem — le détail d'UNE annonce : description, caractéristiques
//     (marque, taille, couleur, matière), catégorie, état, photos, poids du
//     colis, prix, vendeur.
// Le XML est lu par des expressions ciblées (aucun analyseur XML n'est servi
// par le runtime) : chaque bloc <Item> est isolé avant d'y lire ses champs.
// ⛔ Aucune donnée d'acheteur n'est lue.
import { hotes, type EbayEnv } from "./ebay-oauth.ts";

const SITE_FR = "71";
const NIVEAU = "1193";
const PAGE = 200;
const PAGES_MAX = 25;

export async function appelTrading(env: EbayEnv, token: string, appel: string, corps: string): Promise<{ http: number; xml: string }> {
  const r = await fetch(`${hotes(env).api}/ws/api.dll`, {
    method: "POST",
    headers: {
      "X-EBAY-API-IAF-TOKEN": token,
      "X-EBAY-API-CALL-NAME": appel,
      "X-EBAY-API-SITEID": SITE_FR,
      "X-EBAY-API-COMPATIBILITY-LEVEL": NIVEAU,
      "Content-Type": "text/xml",
    },
    body: `<?xml version="1.0" encoding="utf-8"?><${appel}Request xmlns="urn:ebay:apis:eBLBaseComponents">${corps}</${appel}Request>`,
  });
  return { http: r.status, xml: await r.text() };
}

export function decoderXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

/** Contenu du PREMIER élément <tag> (non imbriqué dans un autre du même nom). */
export function valeur(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`));
  return m ? decoderXml(m[1]).trim() : null;
}

/** Tous les blocs <tag>…</tag> (non imbriqués). */
export function blocs(xml: string, tag: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

function attribut(xml: string, tag: string, attr: string): string | null {
  const m = xml.match(new RegExp(`<${tag}\\s[^>]*${attr}="([^"]*)"`));
  return m ? m[1] : null;
}

export function erreurTrading(xml: string): string | null {
  const ack = valeur(xml, "Ack");
  if (ack === "Success" || ack === "Warning") return null;
  const e = blocs(xml, "Errors")[0] ?? "";
  return `${valeur(e, "ErrorCode") ?? "?"} ${valeur(e, "LongMessage") ?? valeur(e, "ShortMessage") ?? ack ?? "réponse illisible"}`.trim();
}

export type AnnonceActive = {
  listing_id: string; url: string; titre: string | null; prix: number | null;
  photo_url: string | null; favoris: number | null; quantite: number | null;
};

export type LectureActive = { annonces: AnnonceActive[]; total: number | null; complet: boolean; motif?: string };

/**
 * Toutes les annonces EN LIGNE du compte relié, page par page.
 * `progres` est appelé après chaque page (le chien de garde voit le relevé avancer).
 */
export async function lireAnnoncesActives(env: EbayEnv, token: string,
  progres?: (lues: number, total: number | null, page: number) => Promise<void>): Promise<LectureActive> {
  const annonces: AnnonceActive[] = [];
  const vus = new Set<string>();
  let total: number | null = null;
  let pages: number | null = null;
  for (let page = 1; page <= PAGES_MAX; page++) {
    const corps = `<ActiveList><Include>true</Include><Pagination><EntriesPerPage>${PAGE}</EntriesPerPage><PageNumber>${page}</PageNumber></Pagination></ActiveList>` +
      "<SoldList><Include>false</Include></SoldList><UnsoldList><Include>false</Include></UnsoldList>" +
      "<ScheduledList><Include>false</Include></ScheduledList><DeletedFromSoldList><Include>false</Include></DeletedFromSoldList>" +
      "<DeletedFromUnsoldList><Include>false</Include></DeletedFromUnsoldList>";
    let r: { http: number; xml: string };
    try {
      r = await appelTrading(env, token, "GetMyeBaySelling", corps);
    } catch (e) {
      return { annonces, total, complet: false, motif: `réseau : ${String((e as Error)?.message ?? e).slice(0, 120)}` };
    }
    if (r.http !== 200) return { annonces, total, complet: false, motif: `HTTP ${r.http}` };
    const err = erreurTrading(r.xml);
    if (err) return { annonces, total, complet: false, motif: `eBay : ${err.slice(0, 160)}` };
    const actif = valeur(r.xml, "ActiveList");
    if (actif == null) {
      // Aucune liste active rendue : un compte sans annonce en ligne.
      return { annonces, total: total ?? 0, complet: true };
    }
    const pag = valeur(actif, "PaginationResult") ?? "";
    total = Number(valeur(pag, "TotalNumberOfEntries") ?? NaN);
    if (!Number.isFinite(total)) total = null;
    pages = Number(valeur(pag, "TotalNumberOfPages") ?? NaN);
    if (!Number.isFinite(pages)) pages = null;
    for (const it of blocs(actif, "Item")) {
      const id = (valeur(it, "ItemID") ?? "").trim();
      if (!/^\d{9,}$/.test(id) || vus.has(id)) continue;
      vus.add(id);
      const statut = valeur(it, "SellingStatus") ?? "";
      const prix = Number(valeur(statut, "CurrentPrice") ?? valeur(it, "BuyItNowPrice") ?? NaN);
      const photo = valeur(valeur(it, "PictureDetails") ?? "", "GalleryURL");
      const q = Number(valeur(it, "QuantityAvailable") ?? NaN);
      const w = Number(valeur(it, "WatchCount") ?? NaN);
      annonces.push({
        listing_id: id,
        url: `https://www.ebay.fr/itm/${id}`,
        titre: valeur(it, "Title"),
        prix: Number.isFinite(prix) && prix > 0 ? prix : null,
        photo_url: photo && /^https?:/.test(photo) ? photo : null,
        favoris: Number.isFinite(w) ? w : null,
        quantite: Number.isFinite(q) ? q : null,
      });
    }
    if (progres) await progres(annonces.length, total, page).catch(() => {});
    if (pages == null || page >= pages) break;
  }
  const complet = total == null ? true : annonces.length >= total;
  return { annonces, total, complet, ...(complet ? {} : { motif: `${annonces.length} lue(s) sur ${total}` }) };
}

function texteDeHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n")
    .trim();
}

const SANS_MARQUE_RE = /^[\s\-–—]*(sans\s*marque(\s*\/\s*g[ée]n[ée]rique)?|g[ée]n[ée]rique|unbranded(\s*\/\s*generic)?|generic|does\s*not\s*apply|ne\s*s['’]applique\s*pas|non\s*applicable|sans\s*objet|n\/?a|non\s*sp[ée]cifi[ée]e?|unspecified)[\s\-–—]*$/i;

function grammes(major: string | null, unitMajor: string | null, minor: string | null, unitMinor: string | null): number | null {
  const a = Number(major ?? 0), b = Number(minor ?? 0);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const um = String(unitMajor ?? "").toLowerCase(), un = String(unitMinor ?? "").toLowerCase();
  let g = 0;
  g += um.startsWith("lb") ? a * 453.592 : a * 1000;
  g += un.startsWith("oz") ? b * 28.3495 : b;
  return g >= 1 && g <= 200000 ? Math.round(g) : null;
}

export type DetailTrading = { ok: true; donnees: Record<string, unknown>; vendeur: string | null } | { ok: false; motif: string };

/** Le détail d'une annonce, normalisé pour annonces_plateforme.donnees_index. */
export async function lireArticleTrading(env: EbayEnv, token: string, itemId: string): Promise<DetailTrading> {
  let r: { http: number; xml: string };
  try {
    r = await appelTrading(env, token, "GetItem",
      `<ItemID>${itemId}</ItemID><DetailLevel>ReturnAll</DetailLevel><IncludeItemSpecifics>true</IncludeItemSpecifics>`);
  } catch (e) {
    return { ok: false, motif: `réseau : ${String((e as Error)?.message ?? e).slice(0, 120)}` };
  }
  if (r.http !== 200) return { ok: false, motif: `HTTP ${r.http}` };
  const err = erreurTrading(r.xml);
  if (err) return { ok: false, motif: err.slice(0, 160) };
  const it = valeur(r.xml, "Item") ?? "";
  const specs: Record<string, string> = {};
  for (const nv of blocs(valeur(it, "ItemSpecifics") ?? "", "NameValueList")) {
    const nom = (valeur(nv, "Name") ?? "").trim();
    const vals = blocs(nv, "Value").map((v) => decoderXml(v).trim()).filter(Boolean);
    if (nom && vals.length) specs[nom] = vals.join(", ");
  }
  const spec = (...noms: string[]) => {
    for (const n of noms) for (const [k, v] of Object.entries(specs)) if (k.toLowerCase() === n.toLowerCase()) return v;
    return null;
  };
  let marque = spec("Marque", "Brand");
  if (marque && SANS_MARQUE_RE.test(marque)) marque = null;
  const pkg = valeur(it, "ShippingPackageDetails") ?? "";
  const poids = grammes(valeur(pkg, "WeightMajor"), attribut(pkg, "WeightMajor", "unit"), valeur(pkg, "WeightMinor"), attribut(pkg, "WeightMinor", "unit"));
  const photos = blocs(valeur(it, "PictureDetails") ?? "", "PictureURL").map((u) => decoderXml(u).trim()).filter((u) => /^https?:/.test(u));
  const cat = valeur(valeur(it, "PrimaryCategory") ?? "", "CategoryName");
  const prix = Number(valeur(valeur(it, "SellingStatus") ?? "", "CurrentPrice") ?? NaN);
  const desc = valeur(it, "Description");
  const vendeur = valeur(valeur(it, "Seller") ?? "", "UserID");
  const donnees: Record<string, unknown> = {
    source: "ebay_trading",
    lu_le: new Date().toISOString(),
    titre: valeur(it, "Title"),
    description: desc ? texteDeHtml(desc).slice(0, 10000) || null : null,
    marque,
    taille: spec("Taille", "Size", "Pointure", "Taille (Homme)", "Taille (Femme)"),
    couleur: spec("Couleur", "Color", "Colour"),
    matiere: spec("Matière", "Matériau", "Material"),
    etat: valeur(it, "ConditionDisplayName"),
    categorie: cat ? cat.split(":").map((s) => s.trim()).filter(Boolean).join(" > ") : null,
    categorie_id: valeur(valeur(it, "PrimaryCategory") ?? "", "CategoryID"),
    photos,
    poids_g: poids,
    prix: Number.isFinite(prix) && prix > 0 ? prix : null,
    caracteristiques: specs,
  };
  for (const k of Object.keys(donnees)) if (donnees[k] == null) delete donnees[k];
  return { ok: true, donnees, vendeur };
}
