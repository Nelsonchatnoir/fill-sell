// ═══════════════════════════════════════════════════════════════════════════
// VERROU — 21/11/2026, complément de Nico (nouvel inscrit, points B et C) : l'annonce eBay d'origine d'un article est lue
// TOUT DE SUITE (API publique d'eBay, jeton applicatif), jamais au seul passage du relevé
// ═══════════════════════════════════════════════════════════════════════════
// Rouge avant (21/11, compte inscrit à 15:04, 188 articles importés d'eBay) : une préparation a attendu 101 s puis 78 s,
// une autre 302 s pour rien (« reprise_expiree », « lecture_origine_non_aboutie ») ; 4 tâches Vinted + Leboncoin sont
// restées « en file » (attente_lecture_origine eBay) sans partir — le détail eBay n'était lu que par le relevé (cron 5 min,
// une demande par 15 min) : 14 min pour l'une, jamais pour l'autre.
// Ce qu'il prouve (Supabase et eBay simulés) :
//   1. donneesDepuisBrowse : la forme du relevé (état, photos pleine taille dans l'ordre, texte, marque) ;
//   2. lireDetailEbayDeLaFiche : 200 → écrit et « lue » ; 404 → « lue, introuvable » (plus rien n'attend) ; 403 → « lue,
//      illisible » ; 429 → rien n'est conclu, rien écrit ; une ligne déjà lue n'est jamais relue ;
//   3. une fiche dont l'annonce est lue « introuvable » n'est plus retenue (lectureOrigineEnAttente) ;
//   4. le branchement : get-pending-jobs (3 fiches au plus par appel, fiche relue), ebay-account « lire_detail », l'app.
//   deno run --allow-read --allow-env --allow-net=none scripts/ebay-lecture-immediate-2111-selftest.ts
import { donneesDepuisBrowse, lireDetailEbayDeLaFiche, DETAILS_UNITAIRES_PAR_POLL } from "../supabase/functions/_shared/ebay-detail-unitaire.ts";
import { lectureOrigineEnAttente } from "../supabase/functions/_shared/contenu-fiche.js";

let verts = 0, rouges = 0;
const ok = (c: boolean, m: string, d = "") => { if (c) { verts++; console.log(`  ok   ${m}`); } else { rouges++; console.log(`  RATÉ ${m}${d ? `  ← ${d}` : ""}`); } };
const lire = (f: string) => Deno.readTextFileSync(new URL(`../${f}`, import.meta.url)).replace(/\r\n/g, "\n");

console.log("1. Les données lues ont la forme du relevé");
{
  const item = {
    title: "Objectif Canon EF-S 18-55mm", description: "<p>Très bon état, <b>bouchons</b> fournis.</p>", condition: "Occasion",
    brand: "Canon", image: { imageUrl: "https://i.ebayimg.com/images/g/AbCdEf123456/s-l225.jpg" },
    additionalImages: [{ imageUrl: "https://i.ebayimg.com/images/g/ZyXwVu654321/s-l225.jpg" }, { imageUrl: "https://i.ebayimg.com/images/g/AbCdEf123456/s-l500.jpg" }],
    price: { value: "45.00" }, localizedAspects: [{ name: "Couleur", value: "Noir" }],
  };
  const d = donneesDepuisBrowse(item, "2026-11-21T15:00:00Z");
  ok(d.source === "ebay_browse" && d.etat === "Occasion" && d.marque === "Canon" && d.couleur === "Noir", "état, marque, couleur", JSON.stringify(d));
  ok(JSON.stringify(d.photos) === JSON.stringify(["https://i.ebayimg.com/images/g/AbCdEf123456/s-l1600.jpg", "https://i.ebayimg.com/images/g/ZyXwVu654321/s-l1600.jpg"]),
    "photos en pleine taille, dans l'ordre, sans doublon", JSON.stringify(d.photos));
  ok(typeof d.description === "string" && /Très bon état/.test(d.description as string) && !/<p>/.test(d.description as string), "le texte du vendeur, sans balises");
}

// Supabase simulé : une table annonces_plateforme en mémoire.
function monde(lignes: Array<Record<string, unknown>>) {
  const ecrits: Array<Record<string, unknown>> = [];
  const admin = {
    from: (_t: string) => {
      const filtres: Array<(r: Record<string, unknown>) => boolean> = [];
      let maj: Record<string, unknown> | null = null;
      const q: Record<string, unknown> = {};
      const resoudre = () => {
        const sel = lignes.filter((r) => filtres.every((f) => f(r)));
        if (maj) { for (const r of sel) { Object.assign(r, maj); ecrits.push({ id: r.id, ...maj }); } return { data: sel, error: null }; }
        return { data: sel, error: null };
      };
      Object.assign(q, {
        select: () => q, order: () => q, limit: () => q,
        eq: (k: string, v: unknown) => { filtres.push((r) => r[k] === v); return q; },
        is: (k: string, v: unknown) => { filtres.push((r) => (r[k] ?? null) === v); return q; },
        update: (m: Record<string, unknown>) => { maj = m; return q; },
        then: (ok2: (x: unknown) => unknown) => Promise.resolve(resoudre()).then(ok2),
      });
      return q;
    },
  };
  return { admin, ecrits };
}
const reponse = (status: number, corps: unknown = {}) => async () => new Response(JSON.stringify(corps), { status });
const jetonOk = () => {
  // obtenirJetonApplicatif lit ses secrets : on les fournit, et on répond au jeton avant l'annonce.
  Deno.env.set("EBAY_CLIENT_ID", "x"); Deno.env.set("EBAY_CLIENT_SECRET", "y");
};

console.log("2. Lire l'annonce d'UNE fiche, tout de suite");
jetonOk();
const U = "a33d67c5-0000-0000-0000-000000000000";
const ligne = (o: Record<string, unknown> = {}) => ({ id: "L1", user_id: U, platform: "ebay", inventaire_id: 42, listing_id: "287622444723", donnees_index_le: null, disparu_le: null, ...o });
const fetchEbay = (statut: number, corps: unknown = {}) => (async (url: string | URL | Request) => {
  if (String(url).includes("/identity/v1/oauth2/token")) return new Response(JSON.stringify({ access_token: "T", expires_in: 7200 }), { status: 200 });
  return await reponse(statut, corps)();
}) as typeof fetch;
const vraiFetch = globalThis.fetch;
{
  const m = monde([ligne()]);
  globalThis.fetch = fetchEbay(200, { title: "Livre", condition: "Bon état", image: { imageUrl: "https://i.ebayimg.com/images/g/QwErTy123456/s-l225.jpg" } });
  const r = await lireDetailEbayDeLaFiche(m.admin, "production", U, 42, { fetchFn: globalThis.fetch });
  ok(r.lue === true && r.motif === "lue" && r.photos === 1, "200 : lue, une photo", JSON.stringify(r));
  ok(m.ecrits.length === 1 && (m.ecrits[0].donnees_index as Record<string, unknown>)?.etat === "Bon état" && typeof m.ecrits[0].donnees_index_le === "string", "écrite comme le relevé (donnees_index, donnees_index_le)");
}
{
  const m = monde([ligne()]);
  globalThis.fetch = fetchEbay(404);
  const r = await lireDetailEbayDeLaFiche(m.admin, "production", U, 42, { fetchFn: globalThis.fetch });
  ok(r.lue === true && r.introuvable === true && (m.ecrits[0]?.donnees_index as Record<string, unknown>)?.introuvable === true, "404 : lue, introuvable (plus rien n'attend)", JSON.stringify(r));
}
{
  const m = monde([ligne()]);
  globalThis.fetch = fetchEbay(403);
  const r = await lireDetailEbayDeLaFiche(m.admin, "production", U, 42, { fetchFn: globalThis.fetch });
  ok(r.lue === true && (m.ecrits[0]?.donnees_index as Record<string, unknown>)?.illisible === "http_403", "403 : lue, illisible (jamais une attente pour rien)", JSON.stringify(r));
}
{
  const m = monde([ligne()]);
  globalThis.fetch = fetchEbay(429);
  const r = await lireDetailEbayDeLaFiche(m.admin, "production", U, 42, { fetchFn: globalThis.fetch });
  ok(r.lue === false && m.ecrits.length === 0, "429 : rien n'est conclu, rien écrit (le relevé reste)", JSON.stringify(r));
}
{
  const m = monde([ligne({ donnees_index_le: "2026-11-21T14:37:09Z" })]);
  globalThis.fetch = fetchEbay(200, {});
  const r = await lireDetailEbayDeLaFiche(m.admin, "production", U, 42, { fetchFn: globalThis.fetch });
  ok(r.lue === false && r.motif === "rien_a_lire" && m.ecrits.length === 0, "déjà lue : jamais relue");
}
globalThis.fetch = vraiFetch;

console.log("3. Une annonce lue « introuvable » ne retient plus la fiche");
{
  const fiche = { id: 42, origine: "releve_ebay", description: "Un texte assez long pour suffire à la fiche, écrit par le vendeur.", photos: ["https://x/1.jpg"], attributs: {} };
  const avant = lectureOrigineEnAttente(fiche, [{ platform: "ebay", detail_le: null }], {});
  const apres = lectureOrigineEnAttente(fiche, [{ platform: "ebay", detail_le: "2026-11-21T15:00:00Z", photos_origine: 0 }], {});
  ok(avant?.plateforme === "ebay" && apres === null, "avant : retenue (eBay) ; après lecture : partie", JSON.stringify({ avant, apres }));
}

console.log("4. Le branchement");
{
  ok(DETAILS_UNITAIRES_PAR_POLL === 3, "3 fiches au plus par appel de get-pending-jobs");
  const g = lire("supabase/functions/get-pending-jobs/index.ts");
  ok(/if \(at\?\.plateforme === "ebay"\) aLireEbay\.push\(Number\(f\.id\)\);/.test(g) && /const r = await lireDetailEbayDeLaFiche\(adminC, envE, user\.id, id\);/.test(g)
    && /for \(const f of \(\(fraiches \?\? \[\]\) as Array<Record<string, unknown>>\)\) ficheDe\.set\(String\(f\.id\), f\);/.test(g), "get-pending-jobs : lue avant de retenir, fiche relue");
  const e = lire("supabase/functions/ebay-account/index.ts");
  ok(/if \(action === "lire_detail"\) \{/.test(e) && /\.eq\("id", invId\)\.eq\("user_id", user\.id\)\.maybeSingle\(\)/.test(e), "ebay-account : « lire_detail », la fiche de la personne seulement");
  const a = lire("src/publication/lectureOrigine.js");
  ok(/data\.plateforme === "ebay" && data\.reason !== "conclue"/.test(a) && /action: "lire_detail"/.test(a), "l'app : une fiche d'origine eBay se lit tout de suite");
}

console.log(`\n${verts} vertes, ${rouges} rouges — lecture immédiate de l'annonce eBay d'origine (21/11).`);
if (rouges) { console.log("ROUGE"); Deno.exit(1); }
