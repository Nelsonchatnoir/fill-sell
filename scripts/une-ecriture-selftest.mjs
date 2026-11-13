// VERROU (13/11/2026, étape 4 « comptes hors France », L1) — UNE LECTURE, UNE ÉCRITURE : JAMAIS UNE LIGNE INCHANGÉE RÉÉCRITE
//   npm run selftest:une-ecriture
//   (rouge avant : VERROU_RACINE=<copie de main d73cd9d> node scripts/une-ecriture-selftest.mjs)
//
// Plan § 2 (comptes_plateformes) : « inconnu = pas de ligne ; jamais une ligne inchangée réécrite ». CLAUDE.md : « aucune
// ligne inchangée réécrite » ; facture Supabase du 02/11 : aucune lecture de plus à chaque poll. Les écrivains (callback
// eBay, siteDuCompteEbay, get-pending-jobs, sonde Depop) passent par UNE porte, _shared/comptes-plateformes.js :
//   · une ligne identique (site, pays, langue, devise, domaine, source, brut) → AUCUNE écriture ;
//   · une ligne qui change → UN update des seuls champs changés (+ lu_le), jamais `pilote` (posé par Nico, L6) ;
//   · une ligne nouvelle → UN insert ; une course (23505) → rien de plus ;
//   · la table absente (migration M1 pas encore appliquée) → rien, sans erreur, et plus aucune tentative pendant 10 min ;
//   · une sonde muette (identité null, pays absent) → aucune requête, et jamais une ligne effacée ;
//   · la même ligne revue dans le même isolat (30 min) → aucune requête.
// En base (M1) : suppress_redundant_updates_trigger — un UPDATE identique n'écrit pas de nouvelle version (banc, xmin).
// Cas RÉELS (id8) : c7c382b7 (eBay UK), 9ea76b27 (eBay US), 9324a9b7 (eBay Belgique), 04699046 (eBay France, Vinted FR),
// ac19c8c9 (Vinted IT « it-fr »). Identifiants de comptes inventés.
import fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = process.env.VERROU_RACINE || join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => { try { return fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n"); } catch { return ""; } };
const charger = async (p) => { try { return await import(pathToFileURL(join(ROOT, p)).href); } catch (e) { return { __erreur: String(e?.message ?? e).slice(0, 160) }; } };

let n = 0, ko = 0;
const ok = (c, nom, d) => { n++; if (c) console.log(`  ✓ ${nom}`); else { ko++; console.log(`  ✗ ${nom}${d === undefined ? "" : `\n      ← ${typeof d === "string" ? d : JSON.stringify(d).slice(0, 400)}`}`); } };

const S = await charger("supabase/functions/_shared/sites-plateformes.js");
const C = await charger("supabase/functions/_shared/comptes-plateformes.js");
ok(!S.__erreur && !C.__erreur, "la porte d'écriture _shared/comptes-plateformes.js et la règle pure existent", S.__erreur ?? C.__erreur);
const fS = (nom) => (typeof S[nom] === "function" ? S[nom] : () => ({}));
const fC = (nom) => (typeof C[nom] === "function" ? C[nom] : async () => ({}));

const U_UK = "c7c382b7-0000-4000-8000-000000000001", U_US = "9ea76b27-0000-4000-8000-000000000002";
const U_BE = "9324a9b7-0000-4000-8000-000000000003", U_FR = "04699046-0000-4000-8000-000000000004", U_IT = "ac19c8c9-0000-4000-8000-000000000005";
const T0 = Date.parse("2026-11-13T10:00:00Z");

console.log("1. La règle pure (ecritureComptePlateforme)");
const lUK = fS("ligneCompteEbay")({ userId: U_UK, compte: "eias-essai-c7c382b7", siteGetUser: "UK" });
const dNeuve = fS("ecritureComptePlateforme")(null, lUK, { maintenant: T0 });
ok(dNeuve.ecrire === true && dNeuve.motif === "nouvelle" && dNeuve.insert?.site === "EBAY_GB" && dNeuve.insert?.lu_le === new Date(T0).toISOString() && !("pilote" in (dNeuve.insert ?? {})),
  "c7c382b7 : ligne absente → UN insert (lu_le = l'heure de la lecture ; pilote laissé à la base)", dNeuve);
const enBase = { ...lUK, lu_le: "2026-11-12T17:30:00.000Z", pilote: true };
ok(fS("ecritureComptePlateforme")(enBase, lUK, { maintenant: T0 }).ecrire === false && fS("ecritureComptePlateforme")(enBase, lUK, { maintenant: T0 }).motif === "inchangee",
  "c7c382b7 : la même ligne relue → AUCUNE écriture (ni lu_le, ni pilote)");
const lIT = fS("ligneCompteVinted")({ userId: U_IT, identite: { user_id: "100000001", pays: "IT", langue: "it-fr" } });
const enBaseIT = { ...lIT, brut: { locale: "it-fr", pays: "IT" }, lu_le: "2026-11-01T08:00:00.000Z", pilote: false };
ok(fS("ecritureComptePlateforme")(enBaseIT, lIT, { maintenant: T0 }).ecrire === false, "ac19c8c9 : brut identique dans un autre ordre de clés (jsonb) → aucune écriture");
const lIT2 = fS("ligneCompteVinted")({ userId: U_IT, identite: { user_id: "100000001", pays: "IT", langue: "en-fr" } });
const dCh = fS("ecritureComptePlateforme")(enBaseIT, lIT2, { maintenant: T0 });
ok(dCh.ecrire === true && dCh.motif === "changee" && JSON.stringify(Object.keys(dCh.champs ?? {}).sort()) === JSON.stringify(["brut", "langue", "lu_le"]),
  "ac19c8c9 passe son Vinted en anglais → UN update des seuls champs changés (langue, brut, lu_le)", dCh);
ok(dCh.ecrire === true && !("pilote" in (dCh.champs ?? {})) && !("user_id" in (dCh.champs ?? {})) && !("compte" in (dCh.champs ?? {})), "l'update ne touche jamais pilote ni la clé");
ok(fS("ecritureComptePlateforme")(enBase, null, { maintenant: T0 }).ecrire === false, "rien de lu (sonde muette) → aucune écriture, jamais une ligne effacée");

console.log("2. La porte (noterComptePlateforme) — un faux client qui compte les requêtes");
function client({ absente = false, lignes = new Map(), conflit = false } = {}) {
  const req = [];
  const cle = (o) => `${o.user_id}|${o.plateforme}|${o.compte}`;
  const from = (table) => {
    const etat = { table, filtres: {}, op: null, val: null };
    const b = {
      select() { etat.op = etat.op ?? "select"; return b; },
      eq(k, v) { etat.filtres[k] = v; return b; },
      insert(v) { etat.op = "insert"; etat.val = v; return b; },
      update(v) { etat.op = "update"; etat.val = v; return b; },
      upsert(v) { etat.op = "upsert"; etat.val = v; return b; },
      delete() { etat.op = "delete"; return b; },
      maybeSingle() { return b.then((x) => x); },
      then(res, rej) {
        req.push({ table: etat.table, op: etat.op, filtres: { ...etat.filtres }, val: etat.val });
        const absent = { data: null, error: { code: "PGRST205", message: "Could not find the table 'public.comptes_plateformes' in the schema cache" } };
        let r;
        if (absente) r = absent;
        else if (etat.op === "select") r = { data: lignes.get(cle(etat.filtres)) ?? null, error: null };
        else if (etat.op === "insert") {
          if (conflit || lignes.has(cle(etat.val))) r = { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
          else { lignes.set(cle(etat.val), { pilote: false, ...etat.val }); r = { data: null, error: null }; }
        } else if (etat.op === "update") { const k = cle(etat.filtres); lignes.set(k, { ...lignes.get(k), ...etat.val }); r = { data: null, error: null }; }
        else r = { data: null, error: { code: "XX", message: `opération interdite ${etat.op}` } };
        return Promise.resolve(r).then(res, rej);
      },
    };
    return b;
  };
  return { from, req, lignes };
}
const ecritures = (c) => c.req.filter((r) => r.op !== "select");

fC("_reinitialiserMemo")();
{ // AVANT la migration
  const c = client({ absente: true });
  const r1 = await fC("noterComptePlateforme")(c, lUK, { maintenant: T0 });
  const r2 = await fC("noterComptePlateforme")(c, fS("ligneCompteEbay")({ userId: U_US, compte: "eias-essai-9ea76b27", siteGetUser: "US" }), { maintenant: T0 + 60_000 });
  ok(r1.ecrit === false && r1.motif === "table_absente" && ecritures(c).length === 0, "AVANT M1 : table absente → aucune écriture, aucune erreur levée", { r1, req: c.req });
  ok(r2.motif === "table_absente" && c.req.length === 1, "AVANT M1 : plus aucune tentative pendant 10 min (une seule requête pour deux comptes)", c.req.length);
  const r3 = await fC("noterComptePlateforme")(c, lUK, { maintenant: T0 + 11 * 60_000 });
  ok(r3.motif === "table_absente" && c.req.length === 2, "AVANT M1 : une nouvelle tentative après 10 min (la migration a pu être appliquée)", c.req.length);
}
fC("_reinitialiserMemo")();
{ // APRÈS la migration
  const c = client();
  const r1 = await fC("noterComptePlateforme")(c, lUK, { maintenant: T0 });
  ok(r1.ecrit === true && r1.motif === "inseree" && ecritures(c).length === 1 && ecritures(c)[0].op === "insert", "APRÈS M1 : c7c382b7 lu pour la 1re fois → UN insert (jamais un upsert aveugle)", c.req);
  const r2 = await fC("noterComptePlateforme")(c, lUK, { maintenant: T0 + 60_000 });
  ok(r2.ecrit === false && r2.motif === "deja_vue" && c.req.length === 2, "la même lecture dans le même isolat → AUCUNE requête (mémoire 30 min)", { r2, n: c.req.length });
  fC("_reinitialiserMemo")();
  const r3 = await fC("noterComptePlateforme")(c, lUK, { maintenant: T0 + 120_000 });
  ok(r3.ecrit === false && r3.motif === "inchangee" && ecritures(c).length === 1, "un autre isolat, la même ligne → UNE lecture, AUCUNE écriture", { r3, req: c.req });
  c.lignes.set(`${U_UK}|ebay|eias-essai-c7c382b7`, { ...c.lignes.get(`${U_UK}|ebay|eias-essai-c7c382b7`), pilote: true });
  fC("_reinitialiserMemo")();
  const lUKbis = fS("ligneCompteEbay")({ userId: U_UK, compte: "eias-essai-c7c382b7", siteGetUser: "Belgium_French" });
  const r4 = await fC("noterComptePlateforme")(c, lUKbis, { maintenant: T0 + 180_000 });
  const up = ecritures(c).at(-1);
  ok(r4.ecrit === true && r4.motif === "modifiee" && up?.op === "update" && up.filtres.user_id === U_UK && up.filtres.plateforme === "ebay" && up.filtres.compte === "eias-essai-c7c382b7"
    && !("pilote" in (up.val ?? {})) && c.lignes.get(`${U_UK}|ebay|eias-essai-c7c382b7`).pilote === true,
  "un site qui change → UN update ciblé sur la clé, pilote gardé", { r4, up });
}
fC("_reinitialiserMemo")();
{ // course et sonde muette
  const c = client({ conflit: true });
  const r = await fC("noterComptePlateforme")(c, fS("ligneCompteEbay")({ userId: U_BE, compte: "eias-essai-9324a9b7", siteGetUser: "Belgium_French" }), { maintenant: T0 });
  ok(r.ecrit === false && r.motif === "course" && ecritures(c).length === 1, "9324a9b7 : un insert concurrent (23505) → rien de plus, aucune erreur levée", { r, req: c.req });
  const c2 = client();
  const rs = await fC("noterComptesDesSessions")(c2, U_FR, { vinted: null, vinted_identite: null });
  const rn = await fC("noterComptePlateforme")(c2, null, { maintenant: T0 });
  ok(Array.isArray(rs) && rs.length === 0 && rn.motif === "sans_ligne" && c2.req.length === 0, "sonde muette / identité inconnue → AUCUNE requête", { rs, rn, req: c2.req });
}
fC("_reinitialiserMemo")();
{ // les sessions de l'extension (get-pending-jobs)
  const c = client();
  const rs = await fC("noterComptesDesSessions")(c, U_IT, { vinted: true, vinted_identite: { user_id: "100000001", login: "vendeur-essai-1", pays: "IT", langue: "it-fr" } }, { maintenant: T0 });
  ok(rs.length === 1 && rs[0].motif === "inseree" && c.lignes.get(`${U_IT}|vinted|100000001`)?.site === "VINTED_IT", "ac19c8c9 : la sonde Vinted (IT, « it-fr ») → UNE ligne VINTED_IT", { rs, l: [...c.lignes.values()] });
  const avant = c.req.length;
  const rs2 = await fC("noterComptesDesSessions")(c, U_IT, { vinted: true, vinted_identite: { user_id: "100000001", login: "vendeur-essai-1", pays: "IT", langue: "it-fr" } }, { maintenant: T0 + 120_000 });
  ok(rs2[0]?.motif === "deja_vue" && c.req.length === avant, "le poll suivant (même isolat) : AUCUNE requête", { rs2, n: c.req.length - avant });
  const rs3 = await fC("noterComptesDesSessions")(c, U_FR, { vinted: true, vinted_identite: { user_id: "100000005", pays: "FR", langue: "fr" } }, { maintenant: T0 });
  ok(rs3[0]?.motif === "inseree" && c.lignes.get(`${U_FR}|vinted|100000005`)?.site === "VINTED_FR", "04699046 : un compte Vinted français → VINTED_FR (le cas français a aussi sa ligne)");
}

console.log("3. Lecture : jamais une panne (avant comme après M1)");
fC("_reinitialiserMemo")();
{
  const cA = client({ absente: true });
  const lu = await fC("lireComptePlateforme")(cA, { userId: U_UK, plateforme: "ebay", compte: "eias-essai-c7c382b7" });
  ok(lu === null, "AVANT M1 : lireComptePlateforme → null (etatPublic retombe sur le site GetUser)", lu);
  const nA = cA.req.length;
  ok(await fC("lireComptePlateforme")(cA, { userId: U_UK, plateforme: "ebay", compte: "eias-essai-c7c382b7" }) === null && cA.req.length === nA,
    "AVANT M1 : la 2e lecture dans les 10 min ne fait aucune requête", cA.req.length - nA);
  fC("_reinitialiserMemo")(); // un autre isolat, ou 10 min plus tard
  const cB = client({ lignes: new Map([[`${U_UK}|ebay|eias-essai-c7c382b7`, { ...lUK, lu_le: "2026-11-13T10:00:00Z", pilote: false }]]) });
  const lu2 = await fC("lireComptePlateforme")(cB, { userId: U_UK, plateforme: "ebay", compte: "eias-essai-c7c382b7" });
  ok(lu2?.site === "EBAY_GB" && cB.req.length === 1 && cB.req[0].op === "select", "APRÈS M1 : une lecture par la clé", { lu2, req: cB.req });
  const cC = client();
  ok(await fC("lireComptePlateforme")(cC, { userId: U_UK, plateforme: "ebay", compte: null }) === null && cC.req.length === 0, "compte inconnu → aucune requête");
}

console.log("4. Coût (CPU) : la décision est négligeable");
{
  const t = performance.now();
  for (let i = 0; i < 20_000; i++) fS("ecritureComptePlateforme")(enBaseIT, lIT, { maintenant: T0 });
  const ms = performance.now() - t;
  ok(S.ecritureComptePlateforme && ms < 400, `20 000 décisions en ${ms.toFixed(0)} ms (< 400 ms)`);
}

console.log("5. En base : la migration et le script ne réécrivent jamais une ligne inchangée");
const mig = fs.existsSync(join(ROOT, "supabase/migrations")) ? fs.readdirSync(join(ROOT, "supabase/migrations")).find((x) => /_comptes_plateformes\.sql$/.test(x)) : null;
const m = mig ? lire(`supabase/migrations/${mig}`) : "";
ok(/BEFORE UPDATE ON public\.comptes_plateformes\s+FOR EACH ROW EXECUTE FUNCTION suppress_redundant_updates_trigger\(\)/.test(m), "M1 : suppress_redundant_updates_trigger (un UPDATE identique n'écrit rien)");
const script = lire("scripts/reparations/20261113_comptes_plateformes_remplissage.sql");
ok(/ON CONFLICT \(user_id, plateforme, compte\) DO NOTHING/.test(script) && !/ON CONFLICT[^;]*DO UPDATE/.test(script), "remplissage : ON CONFLICT DO NOTHING — une ligne déjà écrite par une fonction n'est jamais réécrite");
const porte = lire("supabase/functions/_shared/comptes-plateformes.js");
ok(porte && !/\.upsert\(/.test(porte) && !/\.delete\(/.test(porte), "la porte n'a ni upsert aveugle ni effacement");
for (const [fichier, nom] of [["supabase/functions/ebay-oauth-callback/index.ts", "callback"], ["supabase/functions/_shared/ebay-site.ts", "siteDuCompteEbay"], ["supabase/functions/get-pending-jobs/index.ts", "get-pending-jobs"]]) {
  const s = lire(fichier);
  ok(/comptes-plateformes\.js/.test(s) && !/from\("comptes_plateformes"\)/.test(s), `${nom} : passe par la porte, jamais une écriture directe dans la table`);
}
const pkg = lire("package.json");
ok(/"selftest:une-ecriture": "node scripts\/une-ecriture-selftest\.mjs"/.test(pkg), "le verrou est inscrit dans package.json");

console.log(`\n${n - ko}/${n} contrôles verts${ko ? ` — ${ko} ROUGE(S)` : ""}`);
process.exit(ko ? 1 : 0);
