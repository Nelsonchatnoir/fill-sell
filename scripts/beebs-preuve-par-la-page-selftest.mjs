// Autotest : RETRAITS ET REPUBLICATIONS BEEBS — LA PREUVE PASSE PAR LE FETCH DE LA PAGE ; UNE SUPPRESSION ENVOYÉE
// RETIENT COMME UNE ANNONCE RETIRÉE (28/10, thecloset72000, louis-seller, sebastien64310).
//
//     npm run selftest:beebs-preuve-par-la-page
//
// Ce qu'il prouve, sans réseau :
//   A. beebs.js : un fetch d'ici refusé (403, vérification anti-robot, lecture impossible) est relu par le
//      background (BEEBS_LIRE_PAGE → fetchListingHtml), réponse lue par les MÊMES fonctions ; une lecture d'ici qui
//      a répondu (200 avec fiche, 404) n'est jamais relue ; rien de lisible des deux côtés = la lecture d'ici ;
//   B. « en vérification » : <main> fait foi quand il porte des cartes, les segments sinon ; le refus clés ≠ cartes reste ;
//   C. background : BEEBS_LIRE_PAGE n'accepte que trois formes d'adresse beebs.app, depuis un onglet beebs.app ;
//   D. « une seule annonce hors ligne » : une suppression ENVOYÉE (captured + republish_suppression_envoyee) retient,
//      côté serveur (get-pending-jobs, deux gardes) et côté extension ; le job dont la suppression est partie va au bout.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
let ko = 0;
const ok = (c, m, detail) => { if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`); } };
const extraire = (src, entete) => {
  const d = src.indexOf(entete);
  if (d < 0) throw new Error(`${entete} absent`);
  return src.slice(d, src.indexOf("\n}\n", d) + 2);
};

const bj = lire("chrome-extension/content-scripts/beebs.js");
const bg = lire("chrome-extension/background.js");
const gpj = lire("supabase/functions/get-pending-jobs/index.ts");

console.log("A. La page de l'annonce : relue par la page quand le fetch d'ici est refusé");
{
  const refusee = new Function(`${extraire(bj, "function pageAnnonceRefuseeBeebs(")}; return pageAnnonceRefuseeBeebs;`)();
  ok(refusee({ http: 403, produit: false }, "<html>Forbidden</html>") === true, "403 : refusée → relue par la page");
  ok(refusee({ http: null, produit: false }, "") === true, "lecture impossible : relue par la page");
  ok(refusee({ http: 200, produit: false }, '<script src="https://ct.captcha-delivery.com/c.js"></script>') === true,
    "vérification anti-robot servie en 200 : relue par la page");
  ok(refusee({ http: 404, produit: false }, "<html>404 - Oups, page perdue !</html>") === false, "404 lue d'ici : jamais relue (c'est une lecture)");
  ok(refusee({ http: 200, produit: true, sku: "34151633", disponibilite: "SoldOut" }, "<html></html>") === false, "200 avec fiche : jamais relue");
  const page = extraire(bj, "async function pageAnnonceBeebs(");
  ok(/if \(!pageAnnonceRefuseeBeebs\(lue, html\) \|\| !\/\^\\d\{6,\}\$\/\.test\(String\(id \?\? ""\)\)\) return lue;/.test(page),
    "une lecture d'ici qui a répondu est rendue telle quelle ; un numéro invalide n'est jamais demandé ailleurs");
  ok(/const parPage = lireDocumentAnnonceBeebs\(viaPage\.http, viaPage\.html, id\);/.test(page), "la réponse de la page passe par la MÊME lecture (fiche Product du numéro exact)");
  ok(/return pageAnnonceRefuseeBeebs\(parPage, viaPage\.html\) \? lue : \{ \.\.\.parPage, par: "page" \};/.test(page),
    "rien de lisible côté page non plus : la lecture d'ici, jamais une preuve inventée");
  // lirePageParLaPageBeebs, exécutée avec un background simulé.
  const fabrique = (reponse) => new Function("chrome", "location", "setTimeout",
    `const BEEBS_LECTURE_PAGE_DELAI_MS = 25_000; ${extraire(bj, "async function lirePageParLaPageBeebs(")}; return lirePageParLaPageBeebs;`)(
    { runtime: { sendMessage: async (m) => (m.type === "BEEBS_LIRE_PAGE" ? reponse : null) } },
    { origin: "https://www.beebs.app" }, (f) => 0);
  const lu = await fabrique({ ok: true, status: 404, finalUrl: "https://www.beebs.app/fr/p/34151633", html: "" })("/fr/p/34151633");
  ok(lu && lu.http === 404 && lu.url === "https://www.beebs.app/fr/p/34151633", "réponse du background rendue brute (statut, adresse finale)", lu);
  ok(await fabrique({ ok: false, reason: "BEEBS_LIRE_PAGE refusé" })("/fr/p/34151633") === null, "refus du background → null (rien conclu)");
  ok(await fabrique(null)("/fr/p/34151633") === null, "background muet (ancienne version) → null");
  const lireIds = extraire(bj, "async function lireIdsMesAnnoncesBeebs(");
  ok(lireIds.indexOf("lirePageParLaPageBeebs(chemin)") > 0 && lireIds.indexOf("lirePageParLaPageBeebs(chemin)") < lireIds.indexOf("lirePageParCadreBeebs(page, chemin)"),
    "« Mes annonces » : la page d'abord, le cadre ensuite");
  ok(/lirePageIdentifiantsBeebs\(page, chemin, viaPage\.url, viaPage\.http, viaPage\.html\)/.test(lireIds), "… lue par lirePageIdentifiantsBeebs (mêmes clés, même compteur, mêmes refus)");
}

console.log("B. « En vérification » : une carte comptée une fois");
{
  const lecteur = extraire(bj, "function lirePageIdentifiantsBeebs(");
  ok(/const dansMain = zones\.filter\(\(z\) => z\.tagName === "MAIN"\)\.flatMap\(cartesDe\)\.filter\(\(el\) => !el\.closest\("\[hidden\]"\)\);/.test(lecteur), "<main> (hors parties cachées)");
  ok(/const brutes = \[\.\.\.new Set\(dansMain\.length \? dansMain : dansSegments\)\];/.test(lecteur), "<main> fait foi quand il porte des cartes, sinon les segments");
  ok(/brutes\.filter\(\(el\) => !brutes\.some\(\(o\) => o !== el && el\.contains\(o\)\)\)/.test(lecteur), "une carte qui en contient une autre ne compte qu'une fois");
  ok(/if \(ids\.length !== cartes\.size\) \{/.test(lecteur), "le refus au moindre écart clés / cartes reste entier");
  // Le choix, rejoué sur des éléments simulés : le cas du cadre (liste dans <main> ET dans son segment).
  const carte = (n) => ({ n, closest: () => null, contains: () => false, textContent: "Vérification en cours" });
  const choisir = (dansMain, dansSegments) => {
    const brutes = [...new Set(dansMain.length ? dansMain : dansSegments)];
    return new Set(brutes.filter((el) => !brutes.some((o) => o !== el && el.contains(o)))).size;
  };
  ok(choisir([carte(1)], [carte(2)]) === 1, "cadre : la liste vue deux fois (main + segment) → 1 carte pour 1 clé");
  ok(choisir([], [carte(2)]) === 1, "fetch : rien dans <main>, la carte du segment compte (comme avant)");
  ok(choisir([carte(1), carte(3)], []) === 2, "deux annonces en vérification → 2 cartes");
}

console.log("C. Le background ne lit que trois adresses beebs.app");
{
  const i = bg.indexOf('if (msg?.type === "BEEBS_LIRE_PAGE") {');
  const bloc = bg.slice(i, bg.indexOf("return true;", i));
  ok(i > 0, "BEEBS_LIRE_PAGE servi par le background");
  ok(/const permis = \/\^\\\/fr\\\/p\\\/\\d\{6,\}\$\/\.test\(chemin\) \|\| \/\^\\\/fr\\\/account\\\/my-adverts\(\?:\\\/creating\)\?\$\/\.test\(chemin\);/.test(bloc),
    "seulement /fr/p/<numéro>, /fr/account/my-adverts et …/creating");
  ok(/\(\^\|\\\.\)beebs\\\.app\$\/\.test\(hote\)/.test(bloc), "seulement depuis un onglet beebs.app");
  ok(/fetchListingHtml\(`https:\/\/www\.beebs\.app\$\{chemin\}`, "beebs"\)/.test(bloc), "lu par fetchListingHtml (le chemin des vérifications d'annonce)");
  const permis = (c) => /^\/fr\/p\/\d{6,}$/.test(c) || /^\/fr\/account\/my-adverts(?:\/creating)?$/.test(c);
  ok(permis("/fr/p/34151633") && permis("/fr/account/my-adverts") && permis("/fr/account/my-adverts/creating"), "les trois formes passent");
  ok(!permis("/fr/p/34151633/../../account") && !permis("/fr/account/settings") && !permis("https://evil.example/fr/p/34151633") && !permis("/fr/p/123"),
    "aucune autre adresse");
}

console.log("D. Une suppression envoyée retient comme une annonce retirée");
{
  const iRet = gpj.indexOf("// ══ (11/10, A3) UNE TÂCHE SERVIE EST DÉMARRABLE");
  const regle = gpj.slice(iRet, gpj.indexOf("// Point C : seule la file d'exécution réserve."));
  ok(/\.eq\("platform_fields->>republish_step", "captured"\)\s*\.not\("platform_fields->republish_suppression_envoyee", "is", null\)/.test(regle),
    "get-pending-jobs (retenue) : les republications à suppression envoyée sont lues");
  ok(/\.\.\.\(\(horsLigneEnvoyees \?\? \[\]\) as Array<Record<string, unknown>>\)\.filter\(\(h\) => retraitEngage\(h\)\)/.test(regle), "… et comptent hors ligne");
  ok(/!== "captured"\) continue;\n\s+\/\/ \(28\/10\)[^\n]*\n\s+if \(retraitEngage\(j\)\) continue;/.test(regle), "le job dont la suppression est partie n'est jamais retenu");
  ok(/if \(retraitEngage\(a\)\) continue;/.test(regle), "… ni marqué « retenu »");
  const iVol = gpj.indexOf("const vaRetirerMaintenant = out.filter((j) =>");
  const vol = gpj.slice(iVol, iVol + 2500);
  ok(/=== "captured" && !retraitEngage\(j\)\);/.test(vol), "garde « un seul retrait en vol » : un retrait engagé va au bout");
  ok(/\.not\("platform_fields->republish_suppression_envoyee", "is", null\)/.test(vol) && /\.\.\.\(envoyees \?\? \[\]\)\.filter\(\(e\) => retraitEngage\(e as Record<string, unknown>\)\)/.test(vol),
    "… et les suppressions envoyées comptent hors ligne");
  const iInv = bg.indexOf("// Invariant « une seule annonce hors ligne à la fois », par plateforme");
  const inv = bg.slice(iInv, bg.indexOf("delete pf.retenue_hors_ligne;", iInv));
  ok(/let horsLigne = suppressionDejaEnvoyee\(job, pf\) \? \[\] : await restRequest\(/.test(inv), "extension : le job dont la suppression est partie va au bout");
  ok(/&platform_fields->>republish_step=eq\.captured` \+\n\s+`&platform_fields->republish_suppression_envoyee=not\.is\.null&select=id,title&limit=1`/.test(inv),
    "extension : une suppression envoyée d'un autre job retient");
  ok((bg.match(/await retenirDerriereAnnonceHorsLigne\(accessToken, job, pf, horsLigne\[0\]\)/g) ?? []).length === 2, "retenue toujours écrite (jamais un « skipped » muet)");
}

console.log(ko ? `\n✗ ${ko} échec(s)` : "\n✓ tout est vert");
process.exit(ko ? 1 : 0);
