// VERROU (12/11/2026, point 8 de Nico) : UNE RÉDACTION N'EST JAMAIS COUPÉE — une photo pas prête à temps part telle qu'elle
// est (la photo d'origine), jamais un 504.
//
//     npm run selftest:redaction-jamais-coupee
//
// Preuve (journaux du 12/11, compte ebdf29f0, 15:25 et 15:28) : generate-listing coupé à 150 s ; « rehost photo N (1/3) :
// upload — Gateway Timeout » toutes les ~60 s, puis (2/3), puis la coupure — l'envoi Storage n'avait aucun délai
// (REHOST_TIMEOUT_MS ne bornait que le téléchargement), 3 essais par photo, photo après photo, avant la rédaction.
//   A. Les échéances (_shared/delai-etape.js) : re-hébergement fini à +45 s, retouche à +100 s, envoi Storage 12 s ;
//      l'attente bornée rend la main à temps, même si Storage ne répond jamais.
//   B. Le rejeu du 12/11 : Storage qui répond en 60 s, 3 essais, 4 photos → avant ≥ 720 s (coupé à 150 s) ; après, le
//      re-hébergement rend la main avant 45 s et laisse ≥ 45 s à la rédaction.
//   C. generate-listing applique les échéances partout où Storage ou OpenAI peuvent traîner, et une photo en retard
//      part telle qu'elle est ; aucun appel en plus.
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
let ko = 0, n = 0;
const ok = (c, m, d) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d === undefined ? "" : `\n      ← ${JSON.stringify(d).slice(0, 400)}`}`); } };

let D = null;
try { D = await import(pathToFileURL(join(ROOT, "supabase/functions/_shared/delai-etape.js")).href); } catch { /* absent avant */ }

console.log("A. Les échéances");
ok(!!D, "_shared/delai-etape.js existe");
if (D) {
  ok(D.FIN_PHOTOS_EXTERNES_MS === 45_000 && D.FIN_RETOUCHE_MS === 100_000 && D.DELAI_ENVOI_STORAGE_MS === 12_000 && D.LIMITE_EDGE_MS === 150_000,
    "re-hébergement fini à +45 s, retouche à +100 s, envoi Storage 12 s (limite edge 150 s)");
  ok(D.LIMITE_EDGE_MS - D.FIN_RETOUCHE_MS >= 45_000, "la rédaction garde toujours ≥ 45 s (mesuré le 12/11 : 3 à 26 s)");
  ok(D.resteAvant(0, 45_000, 40_000) === 5_000 && D.resteAvant(0, 45_000, 60_000) === 0, "le reste avant l'échéance, jamais négatif");
  ok(D.delaiBorne(12_000, 0, 45_000, 40_000) === 5_000 && D.delaiBorne(12_000, 0, 45_000, 10_000) === 12_000, "une attente bornée par son plafond ET par l'échéance");
  const jamais = new Promise(() => {});
  const t0 = Date.now();
  const r = await D.attendreAuPlus(jamais, 60);
  ok(r === D.DELAI_DEPASSE && Date.now() - t0 < 1_000, "Storage qui ne répond jamais : la main est rendue au délai");
  ok(await D.attendreAuPlus(Promise.resolve({ error: null }), 1_000).then((x) => x && x.error === null), "une réponse à temps est rendue telle quelle");
}

console.log("B. Le rejeu du 12/11 (Storage à 60 s, 3 essais, 4 photos)");
if (D) {
  // Le temps du re-hébergement, essai par essai, avec et sans les échéances (horloge simulée, en ms).
  const STORAGE_MS = 60_000, ESSAIS = 3, PHOTOS = 4, TELECHARGEMENT_MS = 800, DEBUT_REHOST_MS = 20_000;
  const avant = () => { let t = DEBUT_REHOST_MS; for (let p = 0; p < PHOTOS; p++) for (let e = 1; e <= ESSAIS; e++) { t += TELECHARGEMENT_MS + STORAGE_MS; if (e < ESSAIS) t += 400 * e; } return t; };
  const apres = () => {
    let t = DEBUT_REHOST_MS;
    for (let p = 0; p < PHOTOS; p++) for (let e = 1; e <= ESSAIS; e++) {
      if (D.resteAvant(0, D.FIN_PHOTOS_EXTERNES_MS, t) < 2_000) return t;
      t += TELECHARGEMENT_MS;
      t += Math.min(STORAGE_MS, D.delaiBorne(D.DELAI_ENVOI_STORAGE_MS, 0, D.FIN_PHOTOS_EXTERNES_MS, t));
      if (e < ESSAIS) t += 400 * e;
    }
    return t;
  };
  const a = avant(), b = apres();
  ok(a > D.LIMITE_EDGE_MS, `AVANT : ${Math.round(a / 1000)} s de re-hébergement — coupé à 150 s, rédaction jamais faite (le 504 du 12/11)`);
  ok(b <= D.FIN_PHOTOS_EXTERNES_MS + 1_000, `APRÈS : le re-hébergement rend la main à ${Math.round(b / 1000)} s ; les photos restantes gardent leur URL d'origine`);
  ok(D.LIMITE_EDGE_MS - Math.max(b, D.FIN_RETOUCHE_MS) >= 45_000, "il reste ≥ 45 s à la rédaction, même si la retouche va jusqu'à son échéance");
}

console.log("C. generate-listing applique les échéances");
const gl = lire("supabase/functions/generate-listing/index.ts");
ok(/const debutRequete = Date\.now\(\);/.test(gl) && /from "\.\.\/_shared\/delai-etape\.js"/.test(gl), "l'horloge de la requête et les échéances partagées");
const iRehost = gl.indexOf("rehost: for (let i = 0; i < externes.length; i++)");
const blocRehost = iRehost > 0 ? gl.slice(iRehost, gl.indexOf("if (remplacements.size) {", iRehost)) : "";
ok(/break rehost;/.test(blocRehost) && /resteAvant\(debutRequete, FIN_PHOTOS_EXTERNES_MS\)/.test(blocRehost), "re-hébergement : arrêt à l'échéance, les photos restantes gardent leur URL");
ok(/attendreAuPlus\(adminClient\.storage\s*\.from\(BUCKET\)\s*\.upload\(path, bytes/.test(blocRehost) && /delaiBorne\(DELAI_ENVOI_STORAGE_MS, debutRequete, FIN_PHOTOS_EXTERNES_MS\)/.test(blocRehost),
  "re-hébergement : l'ENVOI Storage est borné (le trou du 12/11)");
ok(/delaiBorne\(REHOST_TIMEOUT_MS, debutRequete, FIN_PHOTOS_EXTERNES_MS\)/.test(blocRehost), "re-hébergement : le téléchargement aussi, jamais au-delà de l'échéance");
const iRet = gl.indexOf("const MAX_RETOUCHED = 5;");
const blocRet = iRet > 0 ? gl.slice(iRet, gl.indexOf("processedPhotos = results.map", iRet)) : "";
ok(/resteAvant\(debutRequete, FIN_RETOUCHE_MS\) >= RETOUCHE_MINIMUM_MS/.test(blocRet) && /if \(!retoucheLancee\) return false;/.test(blocRet), "retouche : pas lancée s'il ne reste pas 25 s (photos d'origine, rien facturé)");
ok(/signal: ctlRetouche\.signal/.test(blocRet) && /fetch\(photoUrl, \{ signal: ctlRetouche\.signal \}\)/.test(blocRet), "retouche : téléchargement et appel OpenAI s'arrêtent à l'échéance");
ok(/attendreAuPlus\(adminClient\.storage\s*\.from\(BUCKET\)\s*\.upload\(path, outBlob/.test(blocRet) && /return origine;/.test(blocRet), "retouche : l'envoi Storage est borné ; en retard, la photo d'origine part");
ok((gl.match(/api\.openai\.com\/v1\/images\/edits/g) ?? []).length === 1 && /const MAX_RETOUCHED = 5;/.test(gl), "aucun appel en plus : une retouche par photo, 5 au plus (coût inchangé)");

console.log("D. La rédaction elle-même finit à +140 s : texte de repli, la fiche part");
ok(D && D.FIN_REDACTION_MS === 140_000 && D.LIMITE_EDGE_MS - D.FIN_REDACTION_MS >= 10_000, "échéance de la rédaction à +140 s : 10 s pour enregistrer la fiche et répondre");
ok(/signal: ctlRedaction\.signal,\s*\}\)\.finally\(\(\) => clearTimeout\(minuteurRedaction\)\)/.test(gl) && /ctlRedaction\.abort\(\);\s*\}, resteAvant\(debutRequete, FIN_REDACTION_MS\)\)/.test(gl),
  "generate-listing passe l'échéance aux appels de rédaction");
ok(/attendreAuPlus\(categoryIconPromise, resteAvant\(debutRequete, FIN_REDACTION_MS\)\)/.test(gl), "l'icône de catégorie est attendue au plus jusqu'à l'échéance (null = le repli d'aujourd'hui)");
const rp = lire("supabase/functions/_shared/redaction-plateformes.ts");
ok((rp.match(/fetch\("https:\/\/api\.anthropic\.com\/v1\/messages", \{\s*method: "POST",\s*signal,/g) ?? []).length === 1, "le module de rédaction transmet l'échéance à l'appel IA (Lens sans échéance : comme avant)");
const essai = spawnSync("deno", ["run", "--allow-read", "--allow-env", "--no-prompt", "scripts/redaction-jamais-coupee-essai.ts"], { cwd: ROOT, encoding: "utf8", timeout: 60_000, shell: process.platform === "win32" });
let E = null;
try { E = JSON.parse((essai.stdout || "").trim().split("\n").pop()); } catch { /* sortie illisible */ }
ok(E && !E.pendu && E.ms < 1_500 && E.appels === 2, "ESSAI (vrai module, IA qui ne répond jamais) : la rédaction rend la main à l'échéance", E ?? (essai.stderr || "").slice(0, 300));
ok(E && E.titres && E.titres.vinted === "Essai Pull en laine" && E.titres.leboncoin === "Essai Pull en laine" && E.descriptions.every((d) => d === "Pull porté deux fois."),
  "chaque plateforme part avec le texte de repli (titre et description de la fiche), jamais rien", E);

console.log(`\n${n - ko}/${n} contrôles verts${ko ? ` — ${ko} ROUGE(S)` : ""}`);
process.exit(ko ? 1 : 0);
