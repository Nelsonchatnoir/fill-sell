// Autotest VERROU : LE TEXTE DU VENDEUR REMIS SUR UNE ANNONCE eBAY EN LIGNE — SEULEMENT UNE FOIS LU (21/11/2026, point 3 de Nico)
//
//     node scripts/texte-vendeur-en-ligne-2111-selftest.mjs
//
// Le cas (compte 8fd44622, lot du 19/11) : lecture d'origine échouée (« illisible »), garde du lot → 4 annonces eBay en ligne
// (API) et 4 Leboncoin avec un texte de l'IA, ce texte posé sur la fiche. Ordre de Nico : vider les fiches (« à relire »),
// faire relire le vrai texte Vinted, PUIS le remettre sur les annonces — eBay par l'API (sur place), Leboncoin à sa prochaine
// republication (get-pending-jobs, contenuAImposer) — et ne toucher à rien tant que le vrai texte n'est pas lu.
// Ce qu'il prouve :
//   1. texteVendeurLuApres : un texte lu, daté, après la copie — jamais « à relire », jamais « $17b », jamais un mot seul ;
//   2. remise-texte-vendeur-ebay : clé de service seulement, simulation par défaut, rien tant que le texte n'est pas lu,
//      jamais une annonce changée par la personne, seule la description réécrite ;
//   3. la republication Leboncoin impose le texte lu après la copie (règle existante, contenuAImposer) ;
//   4. les réparations : 4 fiches de 8fd44622 et le complément « $xx » remplacent le marqueur (la fusion ne retire jamais).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => readFileSync(join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
let ko = 0;
const ok = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}`); } };
const C = await import(pathToFileURL(join(RACINE, "supabase/functions/_shared/contenu-fiche.js")).href);

console.log("1. texteVendeurLuApres");
{
  const copie = "2026-11-19T16:32:29Z";
  const fiche = (description, at, via = "page_publique") => ({ description, attributs: { description_source: { v: "vinted", source: "vinted_detail", at, via } } });
  const vrai = "Doudoune Puma taille M, portée deux fois, très bon état.";
  ok(C.texteVendeurLuApres(fiche(vrai, "2026-11-21T12:00:00Z"), copie) === vrai, "lu le 21/11, après la copie du 19/11 : le texte");
  ok(C.texteVendeurLuApres(fiche(vrai, "2026-11-18T12:00:00Z"), copie) === null, "lu AVANT la copie : rien (la copie l'a déjà vu)");
  ok(C.texteVendeurLuApres(fiche(null, null, "reference_a_relire"), copie) === null, "fiche « à relire » (vidée) : rien tant que le texte n'est pas lu");
  ok(C.texteVendeurLuApres(fiche(vrai, null, "reference_a_relire"), copie) === null, "marqueur « à relire » même avec un texte : rien (pas une lecture)");
  ok(C.texteVendeurLuApres(fiche("$17d", "2026-11-21T12:00:00Z"), copie) === null && C.texteVendeurLuApres(fiche("Neuf", "2026-11-21T12:00:00Z"), copie) === null,
    "une référence « $17d » ou un mot seul : rien");
  ok(C.texteVendeurLuApres({ description: vrai, attributs: {} }, copie) === null, "un texte sans marqueur de lecture (le texte de l'IA d'avant) : rien");
}

console.log("2. remise-texte-vendeur-ebay");
{
  // (21/11 midi) Le cœur vit dans _shared/remise-texte-vendeur-ebay.ts ; la fonction garde la porte (clé de service, simulation).
  const porte = lire("supabase/functions/remise-texte-vendeur-ebay/index.ts");
  const f = porte + lire("supabase/functions/_shared/remise-texte-vendeur-ebay.ts");
  ok(/roleDuJeton\(req\.headers\.get\("Authorization"\) \?\? ""\) !== "service_role"\) return json\(\{ ok: false, motif: "reserve_au_service" \}, 403\)/.test(f), "clé de service seulement (jamais l'app)");
  ok(/const executer = body\.executer === true;/.test(f), "simulation par défaut");
  ok(/j\.voie !== "api"/.test(f) && /pas_une_annonce_api_publiee/.test(f), "seulement une annonce publiée par l'API (une annonce de l'extension ne se modifie pas par l'API)");
  const iTexte = f.indexOf('verdict: "texte_pas_encore_lu"'), iJeton = f.indexOf("obtenirAccessToken(admin");
  ok(iTexte > 0 && iTexte < iJeton, "rien tant que le texte n'est pas lu — avant même le jeton eBay");
  ok(/"different_du_depot"/.test(f) && /copieReprendLeTexte\(enLigne, String\(j\.description \?\? ""\)\) \? "texte_a_remettre"/.test(f), "une annonce qui n'est plus notre copie : jamais touchée");
  ok(/modifierAnnonceEbay\(env, jeton\.token as string, ids, \{ description: texte \}\)/.test(f), "seule la description est réécrite (article et offre), sur place");
}

console.log("3. Leboncoin : la prochaine republication impose le texte lu");
{
  const vrai = "Veste polaire Columbia réversible taille XS, très bon état.";
  const job = { platform: "leboncoin", action: "republish", description: "Veste polaire réversible Columbia en taille XS. Très bon état, prête à porter.", created_at: "2026-11-25T09:00:00Z" };
  const fiche = { origine: "vinted_sync", description: vrai, attributs: { description_source: { v: "vinted", at: "2026-11-21T12:00:00Z" } } };
  const imp = C.contenuAImposer(job, fiche, { contenuLe: "2026-11-19T16:32:29Z", descriptionLueLe: "2026-11-21T12:00:00Z" });
  ok(imp.description === vrai && imp.raisons.includes("description"), "republication d'un dépôt du 19/11, texte lu le 21/11 : le texte du vendeur part");
}

console.log("4. les réparations");
{
  const r = lire("scripts/reparations/20261121_texte_ia_fiches_8fd44622.sql");
  ok(/_backup_2111_texte_ia_8fd44622/.test(r) && /_backup_2111_lecture_8fd44622/.test(r) && /<> 4 THEN RAISE EXCEPTION/.test(r), "4 fiches exactement, sauvegardes");
  ok(/SET description = NULL,\s*\n\s*attributs = jsonb_build_object\('description_source', jsonb_build_object\(/.test(r) && /'via', 'reference_a_relire'/.test(r) && !/attributs - 'description_source'/.test(r),
    "le marqueur est REMPLACÉ par « à relire » (la fusion des attributs ne retire jamais une clé)");
  ok(/SET faite_le = NULL/.test(r), "la lecture d'origine est redemandée");
  const c = lire("scripts/reparations/20261121_description_reference_vinted_marqueur.sql");
  ok(/'via', 'reference_a_relire'/.test(c) && /n <> 6 THEN RAISE EXCEPTION/.test(c), "le complément « $xx » : même geste, 6 fiches");
}

console.log("5. (21/11 midi, point 4 de Nico) la correction part TOUTE SEULE dès que la fiche est lue");
{
  const S = await import(pathToFileURL(join(RACINE, "supabase/functions/_shared/remise-texte-suite.js")).href);
  const T = Date.parse("2026-11-22T10:00:00Z");
  ok(S.suiteRemiseTexte({ demande_le: "2026-11-21T12:00:00Z" }, { ok: true, verdict: "texte_pas_encore_lu" }, T) === null, "texte pas encore lu : AUCUNE écriture (la ligne n'est pas réécrite)");
  ok(S.suiteRemiseTexte({ demande_le: "2026-10-01T12:00:00Z" }, { ok: true, verdict: "texte_pas_encore_lu" }, T)?.verdict?.verdict === "expiree", "plus de 30 jours sans texte lu : « expiree », la marque part");
  for (const v of ["texte_a_remettre", "deja_bon", "different_du_depot"]) {
    const s = S.suiteRemiseTexte({}, { ok: true, verdict: v }, T);
    ok(s?.garder === false && s.verdict.verdict === v, `${v} : la marque part, le verdict est noté`);
  }
  const p1 = S.suiteRemiseTexte({ essais: 0 }, { ok: false, motif: "jeton_absent" }, T);
  ok(p1?.garder === true && p1.marque.essais === 1 && p1.marque.dernier_echec.motif === "jeton_absent", "une panne : un essai de plus, la marque reste");
  ok(S.suiteRemiseTexte({ essais: S.REMISE_TEXTE_ESSAIS_MAX - 1 }, { ok: false, motif: "x" }, T)?.verdict?.verdict === "abandon", "au 6e essai raté : abandon");
  const sh = lire("supabase/functions/_shared/remise-texte-vendeur-ebay.ts");
  ok(/getUTCMinutes\(\) % 10 >= 2\) return \{ lues: 0 \}/.test(sh) && /\.limit\(REMISE_TEXTE_PAR_PASSE\)/.test(sh) && S.REMISE_TEXTE_PAR_PASSE === 3, "bornée : une passe sur cinq, 3 tâches au plus");
  ok(/\.eq\("platform", "ebay"\)\.eq\("voie", "api"\)\.eq\("status", "published"\)/.test(sh) && /\.not\("platform_fields->texte_vendeur_a_remettre", "is", null\)/.test(sh), "seulement les annonces eBay de l'API, en ligne, marquées");
  ok(/remettreTexteVendeurEbay\(admin, j\.id, \{ executer: true/.test(sh), "l'entretien exécute (plus aucune relance à la main)");
  const w = lire("supabase/functions/ebay-api-worker/index.ts");
  ok(/import \{ remettreTextesVendeurEbay \} from "\.\.\/_shared\/remise-texte-vendeur-ebay\.ts";/.test(w) && /try \{ textesVendeur = await remettreTextesVendeurEbay\(admin\); \}\s*\n\s*catch/.test(w), "ebay-api-worker l'appelle à chaque passage, jamais bloquant");
  const m = lire("scripts/reparations/20261121_texte_vendeur_ebay_marque_auto.sql");
  ok(/texte_vendeur_a_remettre/.test(m) && /'reference_a_relire'/.test(m) && /_backup_2111_texte_vendeur_marque/.test(m), "la marque posée par réparation (sauvegarde), sur les fiches « à relire » publiées sur eBay par l'API");
}

console.log(ko ? `\n✗ ${ko} échec(s)` : "\nTout est vert.");
process.exit(ko ? 1 : 0);
