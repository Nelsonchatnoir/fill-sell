// ═══════════════════════════════════════════════════════════════════════════
// FUSION DES DOUBLONS D'UN COMPTE — jouée À BLANC, jamais exécutée d'ici
//   node scripts/fusion-doublons.mjs --user <uuid> [--sans-photos] [--sortie <dossier>]
//
// (2026-09-23, chantier « doublons existants chez Louis ») Le relevé importe
// une annonce comme un NOUVEL article quand il ne trouve pas le sien : deux
// cartes pour un objet. Ce script les trouve, PROUVE chaque paire, décide
// qui garde et qui rejoint, et ÉCRIT le SQL de fusion — il ne l'exécute pas.
//
// LES PREUVES, dans l'ordre (une paire entre par la première qui tient) :
//   · identifiant : la même annonce (plateforme + listing_id) liée à deux
//     articles vivants ;
//   · titre identique (titre_norm, la fonction de la base) ;
//   · même photo (empreinte : dHash ≤ 5 et pHash ≤ 8, la preuve du 23/09) ;
//   · titre proche (≥ 0,6 de jetons communs) ET même prix.
// L'EXCLUSION passe avant tout : deux couleurs ou deux nombres différents
// dans les titres = deux objets, quelles que soient les photos (les kits de
// Louis partagent la même photo entre couleurs). Deux annonces DISTINCTES
// sur la MÊME plateforme = « à trancher », jamais fusionné d'office.
//
// QUI GARDE : l'article qui porte l'identité Vinted (vinted_item_id — la
// fusion ne la déplace pas), sinon le plus ancien. QUI REJOINT : l'autre,
// et SEULEMENT s'il n'a ni job actif (pending/processing/needs_user), ni
// vente, ni fiche d'annonce, ni valeur saisie à la main (source « manuel »),
// ni prix d'achat propre. Sinon la paire va dans « à trancher ». Aucune
// perte : la fusion (inventaire_fusionner) déplace et journalise, elle ne
// supprime rien, et inventaire_defusionner la défait.
//
// LE SQL PRODUIT s'exécute plus tard, EN TANT QUE L'UTILISATEUR (la fonction
// est SECURITY DEFINER et lit auth.uid()) : transaction, rôle authenticated,
// request.jwt.claim.sub posé. Rien ne part sans le feu vert de Nico.
// Lecture seule sur la base : clé de service lue dans .env, requêtes GET.
// ═══════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const opt = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const USER = opt("--user");
const SANS_PHOTOS = args.includes("--sans-photos");
const SORTIE = opt("--sortie", join(ROOT, "build", "fusions"));
if (!USER) { console.error("usage : node scripts/fusion-doublons.mjs --user <uuid> [--sans-photos]"); process.exit(2); }

// ── Base (lecture seule) ───────────────────────────────────────────────────
const env = Object.fromEntries(fs.readFileSync(join(ROOT, ".env"), "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const URL_ = env.SUPABASE_URL?.replace(/\/$/, ""); const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) { console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY absents de .env"); process.exit(2); }
async function get(table, params) {
  const out = []; let offset = 0;
  for (;;) {
    const qs = new URLSearchParams(params); qs.set("limit", "1000"); qs.set("offset", String(offset));
    const r = await fetch(`${URL_}/rest/v1/${table}?${qs}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
    if (!r.ok) throw new Error(`${table} ${r.status} ${await r.text()}`);
    const rows = await r.json(); out.push(...rows); if (rows.length < 1000) break; offset += rows.length;
  }
  return out;
}

const { variantesIncompatibles } = await import(pathToFileURL(join(ROOT, "src/utils/variantesTitre.js")).href);
const { titreNorm } = await import(pathToFileURL(join(ROOT, "src/utils/rapprochementJumeau.js")).href);
const E = await import(pathToFileURL(join(ROOT, "supabase/functions/_shared/empreinte-image.ts")).href);

// ── Empreintes (sharp local, même module que le serveur) ──────────────────
let sharp = null;
try { sharp = SANS_PHOTOS ? null : require("sharp"); } catch { sharp = null; }
const CACHE = join(SORTIE, "cache-img"); fs.mkdirSync(CACHE, { recursive: true });
const memo = new Map();
async function empreinte(url) {
  if (!sharp) return null;
  if (memo.has(url)) return memo.get(url);
  const p = (async () => {
    try {
      const f = join(CACHE, crypto.createHash("md5").update(url).digest("hex"));
      let buf;
      if (fs.existsSync(f)) buf = fs.readFileSync(f);
      else { const r = await fetch(url, { signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); buf = Buffer.from(await r.arrayBuffer()); fs.writeFileSync(f, buf); }
      const { data, info } = await sharp(buf).rotate().removeAlpha().raw().toBuffer({ resolveWithObject: true });
      return E.empreinteDepuisRgba({ data, width: info.width, height: info.height });
    } catch { return null; }
  })();
  memo.set(url, p); return p;
}
const photosDe = (i) => (i.photos || []).map((p) => p?.url || p).filter((u) => typeof u === "string" && /^https?:/.test(u)).slice(0, 3);

// ── Lecture ────────────────────────────────────────────────────────────────
console.log(`\n[fusion-doublons] compte ${USER} — lecture…`);
const inv = await get("inventaire", { select: "*", user_id: `eq.${USER}`, order: "id.asc" });
const ann = await get("annonces_plateforme", { select: "id,platform,listing_id,url,titre,prix,photo_url,statut_plateforme,inventaire_id,job_id,disparu_le,vu_le,capture_le", user_id: `eq.${USER}` });
const jobs = await get("cross_post_jobs", { select: "id,inventaire_id,platform,action,status,platform_listing_id,listing_url,created_at", user_id: `eq.${USER}` });
const ventes = await get("ventes", { select: "id,inventaire_id", user_id: `eq.${USER}` });
const fiches = await get("fiches_annonce", { select: "inventaire_id", user_id: `eq.${USER}` });
const vivants = inv.filter((i) => !i.fusionne_dans);
const stock = vivants.filter((i) => i.statut === "stock");
console.log(`  inventaire ${inv.length} · vivants ${vivants.length} · stock ${stock.length} · annonces ${ann.length} · jobs ${jobs.length} · ventes ${ventes.length}`);

const byId = new Map(vivants.map((i) => [i.id, i]));
const ACTIFS = new Set(["pending", "processing", "needs_user"]);
const jobsActifs = (id) => jobs.filter((j) => j.inventaire_id === id && ACTIFS.has(j.status));
const ventesDe = (id) => ventes.filter((v) => v.inventaire_id === id).length;
const ficheDe = (id) => fiches.some((f) => f.inventaire_id === id);
const manuelDe = (i) => Object.entries(i.attributs || {}).filter(([, v]) => v && typeof v === "object" && v.source === "manuel").map(([k]) => k);
const annoncesDe = (id) => ann.filter((a) => a.inventaire_id === id && !a.disparu_le);
const plateformesEnLigne = (id) => new Set(annoncesDe(id).map((a) => a.platform));

// ── Candidats ──────────────────────────────────────────────────────────────
const STOP = new Set(["de", "du", "des", "le", "la", "les", "et", "pour", "en", "a", "au", "aux", "un", "une", "avec", "sans", "par", "sur", "support", "rangement", "lot", "neuf", "neuve", "tres", "bon", "etat", "taille", "occasion"]);
const jetons = (t) => new Set(titreNorm(t).split(" ").filter((m) => m.length >= 3 && !STOP.has(m)));
const jaccard = (a, b) => { const i = [...a].filter((x) => b.has(x)).length; const u = new Set([...a, ...b]).size; return u ? i / u : 0; };
const memePrix = (a, b) => a.prix_vente != null && b.prix_vente != null && Math.abs(Number(a.prix_vente) - Number(b.prix_vente)) < 0.01;

// (a) la même annonce liée à deux articles vivants
const liens = new Map();
const lier = (pf, lid, invId) => { if (!lid || !invId || !byId.has(invId)) return; const k = `${pf}:${lid}`; if (!liens.has(k)) liens.set(k, new Set()); liens.get(k).add(invId); };
for (const a of ann) lier(a.platform, a.listing_id, a.inventaire_id);
for (const j of jobs) { if (j.status !== "published" && j.status !== "sold") continue; if (j.platform_listing_id) lier(j.platform, j.platform_listing_id, j.inventaire_id); const m = String(j.listing_url ?? "").match(/\/p\/(\d+)|\/items\/(\d+)|\/(\d{8,})(?:[^\d]|$)/); if (m) lier(j.platform, m[1] || m[2] || m[3], j.inventaire_id); }
const pairesParId = new Map();
for (const [k, s] of liens) if (s.size > 1) { const ids = [...s].sort(); for (let x = 0; x < ids.length; x++) for (let y = x + 1; y < ids.length; y++) pairesParId.set(`${ids[x]}|${ids[y]}`, k); }

// (b) titres identiques / proches, parmi les articles VIVANTS (stock ET vendus : un vendu peut être l'article d'origine)
const cands = new Map();
for (let x = 0; x < vivants.length; x++) for (let y = x + 1; y < vivants.length; y++) {
  const A = vivants[x], B = vivants[y];
  const cle = `${Math.min(A.id, B.id)}|${Math.max(A.id, B.id)}`;
  const na = titreNorm(A.titre), nb = titreNorm(B.titre);
  const ja = jetons(A.titre), jb = jetons(B.titre);
  const s = ja.size && jb.size ? jaccard(ja, jb) : 0;
  const parId = pairesParId.get(cle) ?? null;
  if (!parId && !(na && na === nb) && s < 0.6) continue;
  cands.set(cle, { A, B, parId, titreIdentique: !!na && na === nb, jaccard: +s.toFixed(2) });
}
console.log(`  paires candidates : ${cands.size} (par identifiant ${[...cands.values()].filter((c) => c.parId).length}, titre identique ${[...cands.values()].filter((c) => c.titreIdentique).length})`);

// ── Preuves et décision ────────────────────────────────────────────────────
const plan = []; const aTrancher = []; const exclues = [];
for (const c of cands.values()) {
  const { A, B } = c;
  const variantes = variantesIncompatibles(A.titre, B.titre);
  if (variantes.incompatibles) { exclues.push({ ...c, motif: `variante (${variantes.motif}) : ${variantes.couleurs.map((x) => x.join("+")).join(" / ")} ${variantes.nombres.map((x) => x.join("+")).join(" / ")}` }); continue; }
  const photo = SANS_PHOTOS ? null : E.meilleurAppariement(await Promise.all(photosDe(A).map(empreinte)), await Promise.all(photosDe(B).map(empreinte)));
  const preuves = [];
  if (c.parId) preuves.push(`identifiant ${c.parId}`);
  if (c.titreIdentique) preuves.push("titre identique");
  if (photo && photo.verdict === "identique") preuves.push(`même photo (dHash ${photo.dhash}, pHash ${photo.phash})`);
  if (!c.titreIdentique && c.jaccard >= 0.6 && memePrix(A, B)) preuves.push(`titre proche (${c.jaccard}) et même prix`);
  if (!preuves.length) { aTrancher.push({ ...c, motif: `ressemblance sans preuve (jaccard ${c.jaccard}, photo ${photo ? photo.verdict + " d=" + photo.dhash : "non comparée"})` }); continue; }
  // Deux annonces distinctes sur la même plateforme : jamais d'office.
  const pfA = plateformesEnLigne(A.id), pfB = plateformesEnLigne(B.id);
  const communes = [...pfA].filter((p) => pfB.has(p));
  const memeAnnonce = c.parId ? communes.every((p) => c.parId.startsWith(p + ":")) : false;
  if (communes.length && !memeAnnonce) { aTrancher.push({ ...c, preuves, motif: `deux annonces distinctes sur ${communes.join(", ")}` }); continue; }
  // Qui garde ?
  let garde, absorbe;
  if (A.vinted_item_id && !B.vinted_item_id) { garde = A; absorbe = B; }
  else if (B.vinted_item_id && !A.vinted_item_id) { garde = B; absorbe = A; }
  else if (A.vinted_item_id && B.vinted_item_id) { aTrancher.push({ ...c, preuves, motif: "deux identités Vinted (deux annonces Vinted)" }); continue; }
  else { [garde, absorbe] = A.created_at <= B.created_at ? [A, B] : [B, A]; }
  if (garde.statut === "vendu" && absorbe.statut === "stock") { aTrancher.push({ ...c, preuves, motif: "l'article d'origine est VENDU, le doublon en stock (une nouvelle unité ?)" }); continue; }
  const freins = [];
  if (jobsActifs(absorbe.id).length) freins.push(`job actif (${jobsActifs(absorbe.id).map((j) => j.platform + "/" + j.status).join(", ")})`);
  if (ventesDe(absorbe.id)) freins.push(`${ventesDe(absorbe.id)} vente(s)`);
  if (ficheDe(absorbe.id) && ficheDe(garde.id)) freins.push("fiche d'annonce des deux côtés (une seule par article)");
  if (manuelDe(absorbe).length) freins.push(`saisie manuelle (${manuelDe(absorbe).join(", ")})`);
  if (absorbe.prix_achat != null) freins.push("prix d'achat propre");
  if (absorbe.statut === "vendu") freins.push("vendu");
  if (freins.length) { aTrancher.push({ ...c, preuves, motif: `le doublon porte : ${freins.join(" · ")}` }); continue; }
  plan.push({ garde, absorbe, preuves, annoncesDeplacees: annoncesDe(absorbe.id).map((a) => `${a.platform}#${a.listing_id}`), jobsDeplaces: jobs.filter((j) => j.inventaire_id === absorbe.id).length });
}

// ── Sortie ─────────────────────────────────────────────────────────────────
fs.mkdirSync(SORTIE, { recursive: true });
const jour = new Date().toISOString().slice(0, 10);
const resume = (i) => `${i.id} [${i.statut}] ${i.origine ?? "∅"} ${String(i.created_at).slice(0, 10)} ${i.prix_vente ?? "∅"}€${i.vinted_item_id ? " vinted" : ""} « ${i.titre.slice(0, 60)} »`;
console.log(`\n══ PLAN DE FUSION (à blanc) : ${plan.length} paire(s) ══`);
for (const p of plan) { console.log(`\n  GARDE   ${resume(p.garde)}\n  REJOINT ${resume(p.absorbe)}\n  preuves : ${p.preuves.join(" ; ")}\n  déplacé : ${p.annoncesDeplacees.join(" ") || "aucune annonce"} · ${p.jobsDeplaces} job(s)`); }
// « À trancher » se lit par famille : ce qui a une PREUVE mais un frein
// d'abord, les deux annonces distinctes d'une même plateforme (les doublons
// EN LIGNE de la personne, pas ceux de l'import), puis le reste. Une paire
// stock ↔ VENDU sans preuve forte est une unité vendue d'un produit encore en
// stock : ce n'est pas un doublon, on la range à part sans la compter.
const famille = (t) => (t.preuves?.length && /porte|identités|VENDU/.test(t.motif)) ? "preuve_mais_frein"
  : /deux annonces distinctes/.test(t.motif) ? "meme_plateforme"
  : (t.A.statut !== t.B.statut) ? "stock_vs_vendu" : "sans_preuve";
const familles = { preuve_mais_frein: [], meme_plateforme: [], sans_preuve: [], stock_vs_vendu: [] };
for (const t of aTrancher) { t.famille = famille(t); familles[t.famille].push(t); }
console.log(`\n══ À TRANCHER : ${aTrancher.length} paire(s) — preuve mais frein ${familles.preuve_mais_frein.length} · deux annonces sur la même plateforme ${familles.meme_plateforme.length} · ressemblance sans preuve ${familles.sans_preuve.length} · stock ↔ vendu (pas un doublon) ${familles.stock_vs_vendu.length} ══`);
for (const [nom, liste] of Object.entries(familles)) {
  if (!liste.length || nom === "stock_vs_vendu") continue;
  console.log(`\n  ── ${nom} (${liste.length}) ──`);
  for (const t of liste.slice(0, 40)) console.log(`  · ${resume(t.A)}\n    ${resume(t.B)}\n    → ${t.motif}${t.preuves?.length ? ` (preuves : ${t.preuves.join(" ; ")})` : ""}`);
  if (liste.length > 40) console.log(`  … +${liste.length - 40}`);
}
console.log(`\n══ EXCLUES (variantes) : ${exclues.length} ══`);
for (const e of exclues.slice(0, 12)) console.log(`  · « ${e.A.titre.slice(0, 44)} » / « ${e.B.titre.slice(0, 44)} » → ${e.motif}`);
if (exclues.length > 12) console.log(`  … +${exclues.length - 12}`);

// L'état du stock AVANT / APRÈS (ce que la personne verrait : une carte par article en stock)
const absorbes = new Set(plan.map((p) => p.absorbe.id));
const avant = stock.map((i) => i.titre).sort();
const apres = stock.filter((i) => !absorbes.has(i.id)).map((i) => i.titre).sort();
console.log(`\n══ STOCK À L'ÉCRAN : ${avant.length} cartes avant → ${apres.length} après (${avant.length - apres.length} disparaissent, aucune annonce perdue) ══`);

// Le SQL, à exécuter EN TANT QUE L'UTILISATEUR, dans une transaction — jamais d'ici.
const sql = [
  `-- Fusion des doublons de ${USER} — généré le ${new Date().toISOString()} par scripts/fusion-doublons.mjs`,
  `-- ${plan.length} fusion(s). À exécuter dans une transaction, après le feu vert. Chaque appel est journalisé (inventaire_fusions) et réversible (inventaire_defusionner).`,
  `begin;`,
  `set local role authenticated;`,
  `select set_config('request.jwt.claim.sub', '${USER}', true);`,
  `select set_config('request.jwt.claims', '{"sub":"${USER}","role":"authenticated"}', true);`,
  ...plan.map((p) => `select inventaire_fusionner(${p.garde.id}, ${p.absorbe.id}); -- ${p.preuves.join(" ; ").replace(/--/g, "-")}`),
  `-- vérification : autant de lignes que de fusions ci-dessus, ok = true`,
  `select count(*) filter (where defait_le is null) as fusions_vivantes from inventaire_fusions where user_id = '${USER}';`,
  `commit;`,
].join("\n");
const base = join(SORTIE, `fusion-${USER.slice(0, 8)}-${jour}`);
fs.writeFileSync(`${base}.sql`, sql);
fs.writeFileSync(`${base}.json`, JSON.stringify({ user: USER, genere_le: new Date().toISOString(), plan: plan.map((p) => ({ garde: p.garde.id, absorbe: p.absorbe.id, preuves: p.preuves, annonces: p.annoncesDeplacees, jobs: p.jobsDeplaces, titres: [p.garde.titre, p.absorbe.titre] })), a_trancher: aTrancher.map((t) => ({ famille: t.famille, a: t.A.id, b: t.B.id, titres: [t.A.titre, t.B.titre], motif: t.motif, preuves: t.preuves ?? [] })), exclues: exclues.map((e) => ({ a: e.A.id, b: e.B.id, motif: e.motif })), stock_avant: avant.length, stock_apres: apres.length }, null, 1));
console.log(`\nSQL (non exécuté) : ${base}.sql\nDétail : ${base}.json`);
