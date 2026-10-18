// ═══════════════════════════════════════════════════════════════════════════
// BANC D'ESSAI DES LEVIERS IA — chantier « zéro friction » (18/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
//   node scripts/bancs/zero-friction/banc-ia.mjs [--leviers L0,L1,L2,L4] [--max 700] [--relecture]
//                                                [--reprendre] [--seulement vendeurs|questions]
// Lecture seule. VÉRITÉ = ce que la plateforme a accepté et qu'un HUMAIN a choisi :
//   · « vendeurs »  : annonces créées par les vendeurs eux-mêmes sur Leboncoin et
//     Beebs, relevées par FillSell (job « releve-annonces ») — la valeur de
//     Leboncoin (Univers, Produit, Genre…) ou l'âge Beebs QU'ILS ont choisis ;
//   · « questions » : les questions posées à l'écran Publier (45 j), levées par
//     la personne (> 20 s après l'affichage), la valeur partie dans le job publié.
// Pour chaque cas : la RÈGLE (texte → option, Univers de la fiche, paire du
// titre — le moteur de l'app, sans IA), puis les leviers (ia-banc-deduction v3,
// mode « leviers », appelée par la base avec le secret de cron — jamais écrit) :
//   L0 existant (Haiku 4.5, texte, liste ≤ 120) · L1 Haiku 5.5 texte, liste entière
//   · L2 L1 + photos · L3 Sonnet 5.5 texte + photos, SEULEMENT où L2 n'a rien rendu
//   (--relecture) · L4 lecture des photos versée au contexte, puis L1.
// Données brutes (textes, photos) : dossier temporaire du poste, jamais dans le dépôt.
// Résultat (chiffres + identifiants) : docs/enquetes/zero-friction-1810/banc-ia.json.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const ICI = path.join(RACINE, "scripts", "bancs", "zero-friction");
const TMP = path.join(os.tmpdir(), "fillsell-banc-zero-friction");
fs.mkdirSync(TMP, { recursive: true });
const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? d : (process.argv[i + 1] ?? true); };
const LEVIERS = String(arg("leviers", "L0,L1,L2,L4")).split(",").map((s) => s.trim()).filter(Boolean);
const MAX = Number(arg("max", 700));
const RELECTURE = process.argv.includes("--relecture");
const REPRENDRE = process.argv.includes("--reprendre");
const SEULEMENT = arg("seulement", null);
const imp = (p) => import(pathToFileURL(path.join(RACINE, p)).href);
const { deduireOptionDuTexte } = await imp("src/publication/moteur/listes.js");
const { universLbcDeLaFiche, pairesMaisonJardin } = await imp("src/publication/moteur/champsLbcAuto.js");
const { lbcListePlate, lbcPaireDepuisTextes } = await imp("src/utils/lbcMaisonJardin.js");
const { textesDeLAnnonce, optionDepuisTextes } = await imp("supabase/functions/_shared/option-du-texte.js");

function sqlFichier(f) {
  const out = execFileSync("npx", ["supabase", "db", "query", "--linked", "-f", f, "-o", "json"], { cwd: RACINE, encoding: "utf8", shell: true, maxBuffer: 512 * 1024 * 1024 });
  return JSON.parse(out.slice(out.indexOf("{"))).rows ?? [];
}
function sqlTexte(texte) {
  const f = path.join(TMP, `q-${process.pid}-${Math.random().toString(36).slice(2)}.sql`);
  fs.writeFileSync(f, texte);
  try { return sqlFichier(f); } finally { fs.unlinkSync(f); }
}
function donnees(nom) {
  const cache = path.join(TMP, `${nom}.json`);
  if (REPRENDRE && fs.existsSync(cache)) return JSON.parse(fs.readFileSync(cache, "utf8"));
  const rows = sqlFichier(path.join(ICI, `${nom}.sql`));
  fs.writeFileSync(cache, JSON.stringify(rows));
  return rows;
}

const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, "'").replace(/\s+/g, " ").trim().toLowerCase();
const egal = (a, b) => Boolean(a) && Boolean(b) && norm(a) === norm(b);

// ── 1. Les données (lecture seule) ───────────────────────────────────────────
const CAT = donnees("catalogue");
const VENDEURS = SEULEMENT === "questions" ? [] : donnees("cas-vendeurs");
const QUESTIONS = SEULEMENT === "vendeurs" ? [] : donnees("cas-questions");
const EBAY = SEULEMENT === "vendeurs" ? [] : donnees("ebay-aspects");
const catLbc = [...new Set(CAT.filter((r) => r.platform === "leboncoin").map((r) => r.category_key))];
const cheminLbc = (feuille) => catLbc.find((k) => k.endsWith(` > ${feuille}`)) ?? null;
const lignesCat = (platform, cat) => CAT.filter((r) => r.platform === platform && r.category_key === cat);
const JAMAIS = /^(taille|pointure|marque|couleur|mati[eè]re|[ée]tat|poids|format|colis|quantit[ée]|prix|titre|description|photos?)/i;

function contexteDe(r, typeLigne) {
  const chemin = Array.isArray(r.chemin_vinted) ? r.chemin_vinted : null;
  return {
    titre: r.titre ?? "", description: r.description ?? null, marque: r.marque ?? null,
    genre: r.genre ?? null, taille: r.taille ?? null,
    type: [chemin ? `catégorie Vinted : ${chemin.join(" > ")}` : null, typeLigne].filter(Boolean).join(" ; ") || null,
    attributs: r.attributs_visibles && typeof r.attributs_visibles === "object" ? r.attributs_visibles : null,
  };
}
const photosDe = (r) => (Array.isArray(r.photos) ? r.photos : []).map((p) => (typeof p === "string" ? p : p?.url)).filter((u) => typeof u === "string" && /^https:\/\//.test(u)).slice(0, 2);

// La RÈGLE de l'app (sans IA) : ce que le moteur pose avant toute IA.
function regle(platform, cat, demande, r) {
  const textes = textesDeLAnnonce({ titre: r.titre, description: r.description, platformFields: {} });
  if (demande.paire) {
    const x = lbcPaireDepuisTextes(cat, ({ options }) => optionDepuisTextes({ options, textes, identite: true }));
    return x?.univers ? `${x.univers} › ${x.produit}` : null;
  }
  if (platform === "leboncoin" && demande.dedicated === "univers") {
    const u = universLbcDeLaFiche({ genres: [r.genre].filter(Boolean), cheminVinted: r.chemin_vinted, taille: r.taille ?? "", titre: r.titre ?? "", allowedValues: demande.allowedValues });
    if (u?.valeur) return u.valeur;
  }
  const d = deduireOptionDuTexte({ platform, key: demande.key, label: demande.name, allowedValues: demande.allowedValues, textes });
  return d?.valeur ?? null;
}

// ── 2. Les cas ───────────────────────────────────────────────────────────────
const cas = [];
const ajouter = (c) => { if (c.demande.allowedValues.length >= 2 && c.verite) cas.push(c); };
for (const r of VENDEURS) {
  const valeurs = r.valeurs ?? {};
  if (r.platform === "leboncoin") {
    const cat = cheminLbc(r.feuille);
    if (!cat) continue;
    const typeLigne = `catégorie Leboncoin : ${cat}`;
    const mj = pairesMaisonJardin(cat);
    if (mj) {
      const v = valeurs[mj.typeKey] && valeurs[mj.produitKey] ? `${valeurs[mj.typeKey]} › ${valeurs[mj.produitKey]}` : null;
      const opts = mj.paires.map((x) => x.libelle);
      const exacte = opts.find((o) => egal(o, v));
      if (exacte) ajouter({ id: `v:${r.id}:paire`, jeu: "vendeurs", platform: "leboncoin", categorie: cat, champ: "Univers et produit", user_id: r.user_id, inventaire_id: r.inventaire_id,
        demande: { name: "Univers et produit", key: "paire", paire: true, mode: "SELECTION_ONLY", allowedValues: opts.slice(0, 200) }, verite: exacte, contexte: contexteDe(r, typeLigne), photos: photosDe(r), r });
      continue;
    }
    for (const l of lignesCat("leboncoin", cat)) {
      if (JAMAIS.test(String(l.field_label ?? l.field_key)) || /_(size|brand|condition|material|color)$/.test(l.field_key)) continue;
      const liste = (lbcListePlate(cat, l.field_key) ?? l.allowed_values ?? []).map(String).filter(Boolean);
      const exacte = liste.find((o) => egal(o, valeurs[l.field_key]));
      if (!exacte) continue;
      const dedicated = (l.field_key === "clothing_type" || l.field_key === "shoe_type" || /_univers$|_universe$/.test(l.field_key)) ? "univers" : null;
      ajouter({ id: `v:${r.id}:${l.field_key}`, jeu: "vendeurs", platform: "leboncoin", categorie: cat, champ: l.field_label ?? l.field_key, user_id: r.user_id, inventaire_id: r.inventaire_id,
        demande: { name: l.field_label ?? l.field_key, key: l.field_key, dedicated, mode: "SELECTION_ONLY", allowedValues: liste.slice(0, 200) }, verite: exacte, contexte: contexteDe(r, typeLigne), photos: photosDe(r), r });
    }
  } else if (r.platform === "beebs") {
    const l = lignesCat("beebs", r.feuille).find((x) => x.field_key === "Âge");
    const liste = (l?.allowed_values ?? []).map(String).filter(Boolean);
    const exacte = liste.find((o) => egal(o, valeurs["Âge"]));
    if (!exacte) continue;
    ajouter({ id: `v:${r.id}:age`, jeu: "vendeurs", platform: "beebs", categorie: r.feuille, champ: "Âge", user_id: r.user_id, inventaire_id: r.inventaire_id,
      demande: { name: "Âge", key: "Âge", mode: "SELECTION_ONLY", allowedValues: liste.slice(0, 200) }, verite: exacte, contexte: contexteDe(r, `catégorie Beebs : ${r.feuille}`), photos: photosDe(r), r });
  }
}
const DIMENSIONS = /^(longueur|largeur|hauteur|profondeur|diam[eè]tre|[ée]paisseur)$/i;
for (const r of QUESTIONS) {
  const id = `q:${r.user_id}:${r.inventaire_id}:${r.platform}:${r.champ}`;
  if (r.platform === "leboncoin") {
    const cat = r.cat;
    const mj = pairesMaisonJardin(cat);
    const lbc = r.lbc ?? {};
    if (mj && (r.champ === "Univers" || r.champ === "Produit" || r.champ === "Type")) {
      const v = lbc[mj.typeKey] && lbc[mj.produitKey] ? `${lbc[mj.typeKey]} › ${lbc[mj.produitKey]}` : null;
      const opts = mj.paires.map((x) => x.libelle);
      const exacte = opts.find((o) => egal(o, v));
      if (exacte && !cas.some((c) => c.id === `${id}:paire`)) ajouter({ id: `${id}:paire`, jeu: "questions", platform: "leboncoin", categorie: cat, champ: "Univers et produit", user_id: r.user_id, inventaire_id: r.inventaire_id,
        demande: { name: "Univers et produit", key: "paire", paire: true, mode: "SELECTION_ONLY", allowedValues: opts.slice(0, 200) }, verite: exacte, contexte: contexteDe(r, `catégorie Leboncoin : ${cat}`), photos: photosDe(r), r });
      continue;
    }
    const l = lignesCat("leboncoin", cat).find((x) => (x.field_label ?? x.field_key) === r.champ);
    if (!l || JAMAIS.test(r.champ)) continue;
    const liste = (lbcListePlate(cat, l.field_key) ?? l.allowed_values ?? []).map(String).filter(Boolean);
    const dedicated = (l.field_key === "clothing_type" || l.field_key === "shoe_type" || /_univers$|_universe$/.test(l.field_key)) ? "univers" : null;
    const vraie = lbc[l.field_key] ?? (dedicated ? r.univers : null) ?? (/clothing_category|baby_clothing_category/.test(l.field_key) ? r.lbcproduit : null);
    const exacte = liste.find((o) => egal(o, vraie));
    if (exacte) ajouter({ id, jeu: "questions", platform: "leboncoin", categorie: cat, champ: r.champ, user_id: r.user_id, inventaire_id: r.inventaire_id,
      demande: { name: r.champ, key: l.field_key, dedicated, mode: "SELECTION_ONLY", allowedValues: liste.slice(0, 200) }, verite: exacte, contexte: contexteDe(r, `catégorie Leboncoin : ${cat}`), photos: photosDe(r), r });
  } else if (r.platform === "beebs" && r.champ === "Âge") {
    const l = lignesCat("beebs", r.cat).find((x) => x.field_key === "Âge");
    const liste = (l?.allowed_values ?? []).map(String).filter(Boolean);
    const exacte = liste.find((o) => egal(o, r.age ?? r.bba?.["Âge"]));
    if (exacte) ajouter({ id, jeu: "questions", platform: "beebs", categorie: r.cat, champ: "Âge", user_id: r.user_id, inventaire_id: r.inventaire_id,
      demande: { name: "Âge", key: "Âge", mode: "SELECTION_ONLY", allowedValues: liste.slice(0, 200) }, verite: exacte, contexte: contexteDe(r, `catégorie Beebs : ${r.cat}`), photos: photosDe(r), r });
  } else if (r.platform === "ebay" && !DIMENSIONS.test(r.champ)) {
    const catEbay = String(r.ebaycat ?? r.cat ?? "");
    const asp = (EBAY.find((x) => String(x.category_id) === catEbay)?.aspects ?? []).find((a) => a.name === r.champ);
    const vraie = r.eba?.[r.champ];
    if (!asp || !vraie) continue;
    const liste = (asp.allowedValues ?? []).map(String).filter(Boolean);
    const verite = asp.mode === "SELECTION_ONLY" ? liste.find((o) => egal(o, vraie)) : String(vraie);
    if (!verite) continue;
    cas.push({ id: id.replace(/^q:/, "q2:"), jeu: "questions", platform: "ebay", voie: "ebay", categorie: catEbay, champ: r.champ, user_id: r.user_id, inventaire_id: r.inventaire_id,
      demande: { name: r.champ, key: r.champ, mode: asp.mode ?? "FREE_TEXT", allowedValues: liste.slice(0, 200) }, verite, contexte: contexteDe(r, null), photos: photosDe(r), r });
  }
}
// ── Jeu « annonces eBay » : de VRAIES annonces eBay France d'occasion (API Browse,
// mode ebay_annonces de ia-banc-deduction) — la valeur choisie par le vendeur et
// acceptée par eBay est la vérité. Catégories et champs : les questions eBay des
// 30 derniers jours (hors dimensions, marque, couleur — vraies questions ou
// chemins à part). Contexte : titre, description, marque et taille (ce qu'une
// fiche porte) — jamais les autres caractéristiques de l'annonce.
const EBAY_CIBLES = { "63861": ["Longueur de la robe", "Style", "Matière"], "63862": ["Style", "Type", "Matière de la couche extérieure"],
  "55793": ["Style", "Matière de la couche extérieure"], "9355": ["Capacité de stockage", "Modèle"], "139973": ["Plateforme", "Nom du jeu vidéo"],
  "15709": ["Style"], "53159": ["Type"], "53557": ["Style", "Matière de la couche extérieure"] };
if (SEULEMENT !== "vendeurs" && SEULEMENT !== "questions") {
  const fichier = path.join(TMP, "annonces-ebay.json");
  let annonces = REPRENDRE && fs.existsSync(fichier) ? JSON.parse(fs.readFileSync(fichier, "utf8")) : null;
  if (!annonces) {
    annonces = {};
    const cats = Object.keys(EBAY_CIBLES);
    for (let i = 0; i < cats.length; i += 2) {
      const corps = JSON.stringify({ mode: "ebay_annonces", categories: cats.slice(i, i + 2), par_categorie: 40 });
      const [{ id }] = sqlTexte(`select net.http_post(url := '${"https://tojihnuawsoohlolangc.supabase.co/functions/v1/ia-banc-deduction"}', body := $banc$${corps}$banc$::jsonb, headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', public.cron_secret()), timeout_milliseconds := 150000) as id;`);
      for (let essai = 0; essai < 40; essai++) {
        await new Promise((r) => setTimeout(r, 4000));
        const rep = sqlTexte(`select status_code, content from net._http_response where id = ${Number(id)};`);
        if (!rep.length) continue;
        if (rep[0].status_code === 200) Object.assign(annonces, JSON.parse(rep[0].content).categories ?? {});
        else console.warn(`  annonces eBay ${cats.slice(i, i + 2)} : ${rep[0].status_code}`);
        break;
      }
    }
    fs.writeFileSync(fichier, JSON.stringify(annonces));
  }
  for (const [cat, items] of Object.entries(annonces)) {
    const aspectsCat = EBAY.find((x) => String(x.category_id) === cat)?.aspects ?? [];
    for (const it of items ?? []) {
      if (!it?.id) continue;
      const valeur = (n) => (it.aspects ?? []).find((a) => a.name === n)?.value ?? null;
      for (const champ of EBAY_CIBLES[cat] ?? []) {
        const asp = aspectsCat.find((a) => a.name === champ);
        const vraie = valeur(champ);
        if (!asp || !vraie || /,/.test(vraie)) continue; // plusieurs valeurs : pas un cas net
        const liste = (asp.allowedValues ?? []).map(String).filter(Boolean);
        const verite = asp.mode === "SELECTION_ONLY" ? liste.find((o) => egal(o, vraie)) : String(vraie);
        if (!verite) continue;
        cas.push({ id: `e:${it.id}:${champ}`, jeu: "annonces-ebay", platform: "ebay", voie: "ebay", categorie: cat, champ, user_id: "ebay", inventaire_id: null,
          demande: { name: champ, key: champ, mode: asp.mode ?? "FREE_TEXT", allowedValues: liste.slice(0, 200) }, verite,
          contexte: { titre: it.titre ?? "", description: it.description || null, marque: valeur("Marque"), taille: valeur("Taille"), type: null, attributs: null },
          photos: it.photo ? [it.photo] : [], r: { titre: it.titre, description: it.description } });
      }
    }
  }
}
const choisis = cas.slice(0, MAX);
console.log(`${choisis.length} cas (${choisis.filter((c) => c.jeu === "vendeurs").length} vendeurs, ${choisis.filter((c) => c.jeu === "questions").length} questions), ${new Set(choisis.map((c) => c.user_id)).size} comptes`);

// ── 3. Les leviers, par la base (net.http_post + secret de cron jamais écrit) ──
const URL_BANC = "https://tojihnuawsoohlolangc.supabase.co/functions/v1/ia-banc-deduction";
const RESULTATS_F = path.join(TMP, "resultats.json");
const resultats = REPRENDRE && fs.existsSync(RESULTATS_F) ? JSON.parse(fs.readFileSync(RESULTATS_F, "utf8")) : {};
async function vague(lot, leviers) {
  const corpsDe = (paquet) => JSON.stringify({ mode: "leviers", leviers, cas: paquet.map((c) => ({ id: c.id, ...(c.voie ? { voie: c.voie } : {}), demandes: [{ name: c.demande.name, mode: c.demande.mode, allowedValues: c.demande.allowedValues }], contexte: c.contexte, photos: c.photos })) });
  const paquets = [];
  for (let i = 0; i < lot.length; i += 6) paquets.push(lot.slice(i, i + 6));
  const corps = paquets.map(corpsDe);
  if (corps.some((b) => b.includes("$banc$"))) throw new Error("corps illisible pour la base");
  // UNE instruction (la CLI ne rend que la dernière) : tous les identifiants d'un coup.
  const appels = corps.map((b) => `net.http_post(url := '${URL_BANC}', body := $banc$${b}$banc$::jsonb, headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', public.cron_secret()), timeout_milliseconds := 150000)`);
  const attendus = sqlTexte(`select unnest(array[${appels.join(",\n")}]) as id;`).map((x) => Number(x.id)).sort((a, b) => a - b);
  if (attendus.length !== paquets.length) throw new Error(`identifiants de requêtes : ${attendus.length} pour ${paquets.length}`);
  for (let essai = 0; essai < 60; essai++) {
    await new Promise((r) => setTimeout(r, 5000));
    const rep = sqlTexte(`select id, status_code, content, timed_out, error_msg from net._http_response where id in (${attendus.join(",")});`);
    if (rep.length < attendus.length) continue;
    for (const x of rep) {
      if (x.status_code !== 200) { console.warn(`  réponse ${x.id} : ${x.status_code} ${x.error_msg ?? ""} ${String(x.content ?? "").slice(0, 120)}`); continue; }
      for (const res of JSON.parse(x.content).resultats ?? []) {
        resultats[res.id] = { ...(resultats[res.id] ?? {}), photos: res.photos, photos_ecartees: res.photos_ecartees, ...(res.erreur ? { erreur: res.erreur } : {}),
          sorties: { ...(resultats[res.id]?.sorties ?? {}), ...(res.sorties ?? {}) } };
      }
    }
    fs.writeFileSync(RESULTATS_F, JSON.stringify(resultats));
    return;
  }
  console.warn("  vague sans réponse complète (5 min)");
}
const aFaire = (c, l) => !resultats[c.id]?.sorties?.[l];
for (const leviers of [LEVIERS]) {
  const reste = choisis.filter((c) => leviers.some((l) => aFaire(c, l)));
  for (let i = 0; i < reste.length; i += 24) {
    await vague(reste.slice(i, i + 24), leviers.filter((l) => reste.slice(i, i + 24).some((c) => aFaire(c, l))));
    console.log(`  ${Math.min(i + 24, reste.length)}/${reste.length}`);
  }
}
// L3 — la relecture : seulement là où L2 n'a rien rendu.
if (RELECTURE) {
  const vide = (c) => !String(resultats[c.id]?.sorties?.L2?.aspects?.[c.demande.name] ?? "").trim();
  const reste = choisis.filter((c) => resultats[c.id]?.sorties?.L2 && vide(c) && aFaire(c, "L3"));
  for (let i = 0; i < reste.length; i += 24) { await vague(reste.slice(i, i + 24), ["L3"]); console.log(`  L3 ${Math.min(i + 24, reste.length)}/${reste.length}`); }
}

// ── 4. Les chiffres, par plateforme et champ ─────────────────────────────────
const groupe = (c) => `${c.platform} · ${c.champ}`;
const lignes = {};
const ajoute = (g, k, v = 1) => { lignes[g] ??= {}; lignes[g][k] = (lignes[g][k] ?? 0) + v; };
const tous = [...LEVIERS, ...(RELECTURE ? ["L3", "L2+L3"] : []), "R", "R+L0", "R+L2"];
const reponse = (c, l) => {
  const s = resultats[c.id]?.sorties ?? {};
  if (l === "R") return regle(c.platform, c.categorie, c.demande, c.r);
  if (l === "R+L0") return reponse(c, "R") ?? reponse(c, "L0");
  if (l === "R+L2") return reponse(c, "R") ?? reponse(c, "L2");
  if (l === "L2+L3") return reponse(c, "L2") ?? reponse(c, "L3");
  return String(s[l]?.aspects?.[c.demande.name] ?? "").trim() || null;
};
const cout = {};
const parCas = [];
for (const c of choisis) {
  const g = groupe(c);
  ajoute(g, "n");
  // L'identifiant d'un compte ne sort jamais du poste : « q:<compte>:… » devient « q:… ».
  const ligne = { id: c.id.replace(/^(q2?):[0-9a-f-]{36}:/, "$1:"), jeu: c.jeu, groupe: g, inventaire_id: c.inventaire_id, photos: resultats[c.id]?.photos ?? 0 };
  for (const l of tous) {
    const v = reponse(c, l);
    if (v) { ajoute(g, `${l}:rendu`); ajoute(g, egal(v, c.verite) ? `${l}:juste` : `${l}:faux`); }
    ligne[l] = v ? (egal(v, c.verite) ? "juste" : "faux") : "rien";
  }
  for (const [l, s] of Object.entries(resultats[c.id]?.sorties ?? {})) { cout[l] ??= { appels: 0, usd: 0, cas: 0 }; cout[l].appels += s.mesure?.appels ?? 0; cout[l].usd += s.mesure?.cout_usd ?? 0; cout[l].cas++; }
  parCas.push(ligne);
}
const tableau = Object.entries(lignes).sort((a, b) => b[1].n - a[1].n).map(([g, o]) => {
  const row = { groupe: g, n: o.n };
  for (const l of tous) row[l] = `${o[`${l}:juste`] ?? 0}/${o[`${l}:rendu`] ?? 0}`;
  return row;
});
console.table(tableau);
for (const [l, x] of Object.entries(cout)) console.log(`${l} : ${x.cas} cas, ${x.appels} appels, ${x.usd.toFixed(3)} $ (${(x.usd / Math.max(1, x.cas)).toFixed(5)} $/cas)`);
const dest = path.join(RACINE, "docs", "enquetes", "zero-friction-1810", "banc-ia.json");
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, `${JSON.stringify({
  banc: "leviers IA (zéro friction)", fait_le: new Date().toISOString(),
  verite: "valeur choisie par un humain et acceptée en ligne (relevés d'annonces créées par les vendeurs ; réponses aux questions de l'écran Publier, 45 j)",
  lecture: "juste/rendu par levier ; « rien » = la question resterait ; R = règle de l'app sans IA",
  leviers: { L0: "existant (Haiku 4.5, texte, liste ≤ 120)", L1: "Haiku 5.5, texte, liste entière", L2: "L1 + photos", L3: "Sonnet 5.5 texte + photos, seulement si L2 vide", L4: "lecture des photos versée au contexte, puis L1" },
  comptes: new Set(choisis.map((c) => c.user_id)).size, cas: choisis.length, tableau, cout, par_cas: "__PAR_CAS__",
}, null, 1).replace('"__PAR_CAS__"', `[\n${parCas.map((x) => `  ${JSON.stringify(x)}`).join(",\n")}\n ]`)}\n`); // un cas par ligne
console.log(`→ ${path.relative(RACINE, dest)}`);
