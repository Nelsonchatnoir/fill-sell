// ═══════════════════════════════════════════════════════════════════════════
// REJEU 30 JOURS DES TAILLES (24/10, point 1) — ancien code (HEAD) contre nouveau (copie de travail)
//   node scripts/rejeu-tailles-2410.mjs [--jours 30] [--sortie <dossier>]
// Lit la prod en LECTURE SEULE (npx supabase db query --linked), rien n'est écrit en base.
//   A. Les questions « Taille » affichées (usage_logs champ_requis_bloquant) : la nouvelle lecture les aurait-elle
//      évitées, et avec la valeur que la personne a donnée ?
//   B. Les copies Vinted / Beebs / eBay publiées : une taille que l'ancienne lecture déduisait ne change jamais.
//   C. Les copies IA (fiches_annonce) écrites en tour de taille : celles que l'ancien rapprochement réduisait à un
//      nombre nu (le « 34 » de Johan).
//   D. Depop : les copies de bas en W, et ce que la grille 62 / 24 reçoit désormais.
//   E. eBay : les fiches que la règle des vêtements traditionnels range autrement (point 7).
// Les données personnelles (titres) ne sortent que dans le dossier de sortie (scratchpad), jamais dans le dépôt.
// ═══════════════════════════════════════════════════════════════════════════
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const JOURS = Number(args.includes("--jours") ? args[args.indexOf("--jours") + 1] : 30);
const SORTIE = args.includes("--sortie") ? args[args.indexOf("--sortie") + 1] : mkdtempSync(join(tmpdir(), "rejeu-tailles-"));
mkdirSync(SORTIE, { recursive: true });

let nRequete = 0;
function requete(sql) {
  // La requête passe par un fichier (-f) : sur Windows, l'invite de commande découperait le texte SQL.
  const fichier = join(SORTIE, `requete-${++nRequete}.sql`);
  writeFileSync(fichier, sql);
  const sortie = execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["supabase", "db", "query", "--linked", "-f", fichier],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 512 * 1024 * 1024, shell: process.platform === "win32" });
  const j = JSON.parse(sortie.slice(sortie.indexOf("{")));
  return j.rows ?? [];
}
function versionAncienne(fichier) {
  return execFileSync("git", ["show", `HEAD:${fichier}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}
const dirAncien = mkdtempSync(join(tmpdir(), "tailles-ancien-"));
for (const f of ["taille-du-texte.js", "taille-de-service.js", "tailles.js"]) {
  writeFileSync(join(dirAncien, f), versionAncienne(`supabase/functions/_shared/${f}`));
}
const ANC = await import(pathToFileURL(join(dirAncien, "taille-du-texte.js")).href);
const NOU = await import(pathToFileURL(join(ROOT, "supabase/functions/_shared/taille-du-texte.js")).href);
const TS = await import(pathToFileURL(join(ROOT, "supabase/functions/_shared/taille-de-service.js")).href);
const TL = await import(pathToFileURL(join(ROOT, "supabase/functions/_shared/tailles.js")).href);
const DEP = await import(pathToFileURL(join(ROOT, "src/utils/depopPublication.js")).href);
const TRAD = await import(pathToFileURL(join(ROOT, "src/utils/vetementTraditionnel.js")).href);

const grillesSql = `select platform, category_key, field_key, allowed_values from platform_category_aspects
  where (platform = 'vinted' and field_key = 'size') or (platform = 'beebs' and field_key = 'Taille')`;
const grilles = new Map(requete(grillesSql).map((g) => [`${g.platform}|${g.category_key}`, g.allowed_values]));
const res = { A: [], B: [], C: [], D: [], E: [] };
const cle = (p, c) => `${p}|${c}`;
const val = (r) => (r && r.valeur) ? r.valeur : null;

// ── A. Les questions affichées ────────────────────────────────────────────────
const qs = requete(`select u.created_at, u.user_id, u.metadata->>'platform' pf, u.metadata->>'categorie' cat,
    u.metadata->>'inventaire_id' inv, i.titre, i.description, i.attributs->'taille'->>'v' taille_fiche,
    (i.attributs->'taille'->>'at')::timestamptz taille_le, i.attributs->'taille'->>'source' taille_source
  from usage_logs u left join inventaire i on i.id::text = u.metadata->>'inventaire_id'
  where u.feature = 'champ_requis_bloquant' and u.metadata->>'issue' = 'affiche'
    and u.created_at > now() - interval '${JOURS} days' and (u.metadata->'champs'->>0) ilike 'taille%'
    and u.metadata->>'platform' in ('vinted','beebs')`);
let aRejouables = 0, aEvitees = 0, aDAccord = 0, aSansReponse = 0, aContre = 0;
for (const q of qs) {
  const grille = grilles.get(cle(q.pf, q.cat));
  if (!q.inv || !q.titre || !Array.isArray(grille)) continue;
  aRejouables++;
  // La taille de la fiche AU MOMENT de la question (une réponse donnée après n'existait pas encore).
  const avantQuestion = q.taille_fiche && q.taille_le && Date.parse(q.taille_le) < Date.parse(q.created_at) ? q.taille_fiche : "";
  const p = { valeur: avantQuestion, textes: [q.titre, q.description ?? ""], grille, chemin: q.cat };
  const a = val(ANC.tailleDuTexte(p)), n = val(NOU.tailleDuTexte(p));
  if (!a && n) {
    aEvitees++;
    const reponse = q.taille_source === "manuel" && q.taille_le && Date.parse(q.taille_le) >= Date.parse(q.created_at) ? q.taille_fiche : null;
    const reponseDansGrille = reponse ? (TL.tailleDansGrille(reponse, grille)?.valeur ?? reponse) : null;
    const accord = reponseDansGrille == null ? "sans_reponse" : reponseDansGrille === n ? "d_accord" : "different";
    if (accord === "d_accord") aDAccord++; else if (accord === "sans_reponse") aSansReponse++; else aContre++;
    res.A.push({ quand: q.created_at, compte: String(q.user_id).slice(0, 8), plateforme: q.pf, fiche: q.inv, titre: q.titre, deduite: n, reponse, accord });
  }
}

// ── B. Les copies publiées : ce que l'ancienne lecture déduisait ne change jamais ──
const jobs = requete(`select j.id, j.platform, j.title, j.platform_fields->>'taille' taille,
    coalesce(j.platform_fields->>'categoryPath', array_to_string(array(select jsonb_array_elements_text(j.platform_fields->'categoryPath')), ' > ')) cat_v,
    array_to_string(array(select jsonb_array_elements_text(j.platform_fields->'beebsCategoryPath')), ' > ') cat_b,
    i.titre, i.description
  from cross_post_jobs j left join inventaire i on i.id = j.inventaire_id
  where j.created_at > now() - interval '${JOURS} days' and j.platform in ('vinted','beebs') and j.action in ('publish','republish')
    and j.status in ('published','sold','pending','processing','needs_user')`);
let bRejouees = 0, bAvant = 0, bInchangees = 0, bChangees = 0, bNouvelles = 0;
for (const j of jobs) {
  const cat = j.platform === "vinted" ? j.cat_v : j.cat_b;
  const grille = grilles.get(cle(j.platform, cat));
  if (!Array.isArray(grille)) continue;
  bRejouees++;
  const textes = [j.titre ?? "", j.description ?? "", j.title ?? ""];
  const valeur = String(j.taille ?? "").trim();
  // Le moteur n'appelle la lecture que pour une copie hors grille ou vide.
  if (valeur && TL.tailleDansGrille(valeur, grille)) continue;
  const p = { valeur, textes, grille, chemin: cat };
  const a = val(ANC.tailleDuTexte(p)), n = val(NOU.tailleDuTexte(p));
  if (a) { bAvant++; if (a === n) bInchangees++; else { bChangees++; res.B.push({ job: j.id, plateforme: j.platform, avant: a, apres: n, titre: j.titre }); } }
  else if (n) { bNouvelles++; res.B.push({ job: j.id, plateforme: j.platform, avant: null, apres: n, titre: j.titre, copie: valeur }); }
}

// ── C. Les copies IA en tour de taille ───────────────────────────────────────
const copies = requete(`select f.inventaire_id, f.created_at, e.k plateforme, e.v->'platform_fields'->>'taille' taille_ia
  from fiches_annonce f, jsonb_each(f.fiche->'platformListings'->'platforms') e(k, v)
  where f.created_at > now() - interval '${JOURS} days' and coalesce(e.v->'platform_fields'->>'taille', '') ~ '[0-9]{2}\\s*[/x]\\s*[0-9]{2}|^[wW]\\s*[0-9]{2}'`);
for (const c of copies) {
  const t = TS.lireTourDeTaille(c.taille_ia);
  if (t) res.C.push({ fiche: c.inventaire_id, plateforme: c.plateforme, taille_ia: c.taille_ia, lecture: t.ambigu ? "fourchette possible" : `W${t.w}` });
}
const fichesC = [...new Set(res.C.map((c) => c.fiche))];
if (fichesC.length) {
  const finales = requete(`select inventaire_id, platform, platform_fields->>'taille' taille from cross_post_jobs
    where inventaire_id in (${fichesC.map(Number).join(",")}) and action = 'publish'`);
  for (const c of res.C) {
    const f = finales.find((x) => String(x.inventaire_id) === String(c.fiche) && x.platform === c.plateforme);
    c.taille_partie = f?.taille ?? null;
    c.nombre_nu_fabrique = Boolean(f?.taille && /^\d{2}$/.test(f.taille) && !String(c.taille_ia).includes(f.taille + "") === false && f.taille !== c.taille_ia);
  }
}

// ── D. Depop : les bas en W ────────────────────────────────────────────────────
const depop = requete(`select j.id, j.status, j.platform_fields->>'taille' taille, j.platform_fields->>'depopTaille' depop_taille,
    array(select jsonb_array_elements_text(j.platform_fields->'depopCategoryPath')) chemin
  from cross_post_jobs j where j.platform = 'depop' and j.created_at > now() - interval '${JOURS} days'
    and j.platform_fields->'depopCategoryPath'->>1 = 'bottoms'`);
for (const j of depop) {
  const brut = j.taille ?? j.depop_taille ?? "";
  const nouveau = DEP.tailleDepop(brut, j.chemin);
  if (nouveau !== brut) res.D.push({ job: j.id, statut: j.status, chemin: j.chemin.join("/"), taille: brut, depop_avant: j.depop_taille, depop_apres: nouveau });
}

// ── E. eBay : les vêtements traditionnels ─────────────────────────────────────
const ebay = requete(`select j.id, j.status, j.title, j.platform_fields->>'categorie_icone' icone, j.platform_fields->>'ebayCategoryId' cat,
    i.description from cross_post_jobs j left join inventaire i on i.id = j.inventaire_id
  where j.platform = 'ebay' and j.action = 'publish' and j.created_at > now() - interval '${JOURS} days'`);
let eRejoues = 0;
for (const j of ebay) {
  eRejoues++;
  const t = TRAD.vetementTraditionnel(j.icone || null, j.title ?? "", j.description ?? "");
  if (t && t.id !== String(j.cat ?? "")) res.E.push({ job: j.id, statut: j.status, titre: j.title, avant: j.cat, apres: `${t.id} (${t.region}, « ${t.mot} »)` });
}
const fichesTrad = requete(`select i.id, i.titre, i.description from inventaire i
  where i.created_at > now() - interval '${JOURS} days' and i.titre ~* '(djellaba|jellaba|gandoura|qamis|takchita|abaya|jilbab|thobe|burnous|boubou|dashiki|agbada|saree|salwar|kameez|lehenga|sherwani|dhoti|hanbok|qipao|cheongsam|hanfu|yukata|hakama|dirndl|lederhosen|huipil|caftan|kaftan|kimono|kurta|poncho|kilt)'`);
const fichesE = fichesTrad.map((f) => ({ fiche: f.id, titre: f.titre, regle: TRAD.vetementTraditionnel(null, f.titre ?? "", f.description ?? "") }));

const bilan = {
  jours: JOURS,
  A: { questions_affichees: qs.length, rejouables: aRejouables, evitees: aEvitees, d_accord_avec_la_reponse: aDAccord, sans_reponse: aSansReponse, reponse_differente: aContre },
  B: { copies_rejouees: bRejouees, deduites_avant: bAvant, inchangees: bInchangees, changees: bChangees, nouvelles_deductions: bNouvelles },
  C: { copies_ia_en_tour_de_taille: res.C.length, fiches: fichesC.length },
  D: { depop_bas: depop.length, change: res.D.length },
  E: { ebay_rejoues: eRejoues, change: res.E.length, fiches_au_mot_traditionnel: fichesE.length, fiches_classees: fichesE.filter((f) => f.regle).length },
};
writeFileSync(join(SORTIE, "rejeu-tailles-2410.json"), JSON.stringify({ bilan, ...res, fichesE }, null, 1));
console.log(JSON.stringify(bilan, null, 1));
console.log(`détail : ${join(SORTIE, "rejeu-tailles-2410.json")}`);
