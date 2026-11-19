// VERROU (19/11/2026 soir, décision de Nico : « une fiche à vignette seule est relue (photos et texte) avant toute
// publication ou republication : aucune annonce ne part avec une seule photo »).
// Constat (base, 30 jours) : 30 publications parties avec la seule vignette après « lecture d'origine épuisée » (origine
// Beebs, la dernière le 18/11). La publication attendait bien la lecture (get-pending-jobs, attente_lecture_origine) et
// demandait un relevé ; mais le relevé ne lit que 30 annonces, dans l'ordre de la page : avec des centaines de fiches à une
// photo, la fiche attendue manquait les 3 relevés de 24 h, puis la copie partait telle quelle.
//   1. le relevé lit D'ABORD les fiches qu'une publication attend (extension, choisirCapturesARefaire opts.attendues),
//      jamais coupées par le budget de temps ;
//   2. lecture épuisée ET une seule photo (fiche et copie) → la publication ne part pas : la main à la personne
//      (get-pending-jobs, uneSeulePhotoSansLecture, needs_user « photos_origine », message vrai).
// Rouge sur 18e7d19, vert après.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extraireFonctionJs } from "./lib/extraire-fonction-js.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
let echecs = 0, total = 0;
const ok = (c, m) => { total++; if (c) console.log(`  ✓ ${m}`); else { echecs++; console.log(`  ✗ ${m}`); } };

console.log("1. Le relevé lit d'abord les fiches qu'une publication attend");
const bg = lire("chrome-extension/background.js");
const constante = (nom) => bg.match(new RegExp(`^const ${nom} = [^;]+;`, "m"))?.[0] ?? `const ${nom} = undefined;`;
const aides = ["CAPTURE_MAX_PAR_RUN", "CAPTURE_FRAICHEUR_H", "CAPTURE_PERIMEES_PAR_RUN", "CAPTURE_PERIMEES_PLANCHER", "CAPTURE_NOUVELLE_MS",
  "CAPTURE_NOUVELLES_HORS_BUDGET"].map(constante).join("\n");
const ligne = bg.slice(bg.indexOf("const ligneDeListe = "), bg.indexOf("/** Les annonces à (re)capturer"));
const choisir = new Function(`${aides}\n${ligne}\n${extraireFonctionJs(bg, "choisirCapturesARefaire")}\nreturn choisirCapturesARefaire;`)();
const T = Date.parse("2026-11-19T20:00:00Z");
const unePhoto = Array.from({ length: 300 }, (_, i) => ({ listing_id: String(1000 + i), capture_le: null, inventaire_id: 5000 + i,
  created_at: new Date(T - 20 * 86_400_000).toISOString() }));
const annonces = unePhoto.map((r) => ({ listing_id: r.listing_id, url: `https://www.beebs.app/fr/p/${r.listing_id}`, titre: "x", prix: 5 }));
const attendue = String(unePhoto[299].inventaire_id);   // la DERNIÈRE de la page
const r = choisir(annonces, unePhoto, T, { attendues: new Set([attendue]) });
ok(r.pris[0]?.listing_id === unePhoto[299].listing_id, "la fiche attendue par une publication est lue la PREMIÈRE (dernière de la page)");
ok(r.horsBudget?.has?.(unePhoto[299].listing_id) === true, "jamais coupée par le budget de temps");
ok(r.pris.length === 30 && r.pris[1]?.listing_id === unePhoto[0].listing_id, "les autres : l'ordre d'avant, budget inchangé (30)");
const r0 = choisir(annonces, unePhoto, T);
ok(r0.pris[0]?.listing_id === unePhoto[0].listing_id, "sans publication en attente : l'ordre d'avant");
const cap = extraireFonctionJs(bg, "capturerAnnonces");
ok(/status=eq\.pending&platform_fields->attente_lecture_origine->>plateforme=eq\.\$\{platform\}/.test(cap)
  && /choisirCapturesARefaire\(parPage, connues, Date\.now\(\), \{ attendues \}\)/.test(cap), "capturerAnnonces lit les publications en attente de lecture et les passe au choix");

console.log("2. Lecture épuisée et une seule photo : la publication ne part pas");
const C = await import("../supabase/functions/_shared/contenu-fiche.js");
ok(typeof C.uneSeulePhotoSansLecture === "function", "uneSeulePhotoSansLecture existe");
if (typeof C.uneSeulePhotoSansLecture === "function") {
  const vignette = ["https://cdn.beebs.app/a.jpg"];
  ok(C.uneSeulePhotoSansLecture({ photos: [{ url: vignette[0] }] }, { photos: vignette }) === true, "fiche et copie à une photo → retenue");
  ok(C.uneSeulePhotoSansLecture({ photos: [] }, { photos: [] }) === true, "aucune photo → retenue");
  ok(C.uneSeulePhotoSansLecture({ photos: [{ url: "a" }] }, { photos: ["a", "b", "c"] }) === false, "la fiche a ses photos (complétées entre-temps) → elle part");
  ok(C.uneSeulePhotoSansLecture({ photos: [{ url: "a" }, { url: "b" }] }, { photos: vignette }) === false, "la copie a des photos (ajoutées par la personne) → elle part");
  const m = C.messagePhotosOrigineIllisibles("beebs");
  ok(/Beebs/.test(m) && /une seule photo/.test(m) && /Ajoute des photos/.test(m) && !/erreur|error/i.test(m), "message vrai : ce qui manque, quoi faire");
}
const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
const bloc = gpj.slice(gpj.indexOf("if (plateformesEpuisees.size) {"), gpj.indexOf("for (const p of plateformesEpuisees) relevesADemander.delete(p);"));
const iGarde = bloc.indexOf("uneSeulePhotoSansLecture(j, ficheDe.get(String(j.inventaire_id)))");
const iLibere = bloc.indexOf("retenus.delete(String(j.id));");
ok(iGarde > 0 && iLibere > iGarde, "get-pending-jobs : la garde passe AVANT la libération de la copie");
ok(/status: "needs_user"/.test(bloc.slice(iGarde, iLibere)) && /needs_user_source = "photos_origine"/.test(bloc.slice(iGarde, iLibere))
  && /messagePhotosOrigineIllisibles\(pfR\)/.test(bloc.slice(iGarde, iLibere)), "… et rend la main à la personne (needs_user photos_origine, message vrai)");

console.log(echecs ? `✗ une-photo-jamais-publiee-1911 : ${total - echecs}/${total}` : `✓ une-photo-jamais-publiee-1911 : ${total}/${total}`);
process.exit(echecs ? 1 : 0);
