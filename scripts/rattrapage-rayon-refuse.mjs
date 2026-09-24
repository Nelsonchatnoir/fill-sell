// ═══════════════════════════════════════════════════════════════════════════
// RATTRAPAGE — UN JOB EN FILE PORTANT UN RAYON REFUSÉ (2026-09-25)
// ═══════════════════════════════════════════════════════════════════════════
// Les jobs créés AVANT le lot « le rayon refusé ne part jamais » gardent sur
// eux le rayon que la vérification avait refusé (ex. d8224311 de Jocabroc,
// « Peinture Baptême Christ… » en « Pinceaux », bloqué en needs_user sur un
// état « neuf seulement »). Ce script leur applique LE MÊME MÉCANISME que
// l'app — rayonApresRefus puis appliquerRayonApresRefus, le code de
// src/utils/rayonApresRefus.js, sans copie — et rend le PATCH à poser sur le
// job. Le rayon est décidé par le mécanisme, jamais à la main.
//
// ⛔ Uniquement un job dont le verdict est dans VERDICTS_REFUS, et qui n'est
//    PAS en ligne (le script refuse les autres).
// ⛔ Il n'écrit rien : il rend le patch, que l'on pose ensuite en SQL avec la
//    remise en file (status pending, error archivée) — la même remise en file
//    que la relance « ✋ Compléter » de l'app.
//
//   FS_CRON_SECRET=… node --import ./scripts/loader-ext.mjs scripts/rattrapage-rayon-refuse.mjs <job.json>
//   <job.json> = { id, platform, status, title, pf, inv: { titre, … } } (relu en base)
import fs from "node:fs";
import {
  VERDICTS_REFUS, cheminsRefuses, familleVetoDe, rayonApresRefus, appliquerRayonApresRefus,
} from "../src/utils/rayonApresRefus.js";
import { candidatsParMot } from "../src/utils/categorieParMot.js";

const job = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const secret = process.env.FS_CRON_SECRET;
if (!secret) throw new Error("FS_CRON_SECRET absent");
const verdict = job.pf?.categorie_verification?.verdict;
if (!VERDICTS_REFUS.has(verdict)) { console.log(JSON.stringify({ hors_perimetre: verdict ?? null })); process.exit(0); }
if (!["pending", "needs_user", "failed", "paused"].includes(job.status)) { console.log(JSON.stringify({ refuse: `statut ${job.status}` })); process.exit(0); }

const appelerResolve = async (corps) => {
  for (let essai = 0; essai < 2; essai++) {
    try {
      const r = await fetch("https://tojihnuawsoohlolangc.supabase.co/functions/v1/resolve-categorie", {
        method: "POST",
        headers: { "content-type": "application/json", "x-cron-secret": secret },
        body: JSON.stringify(corps),
      });
      const data = await r.json().catch(() => null);
      if (r.ok && data && data.motif !== "ia_indisponible") return { data, injoignable: false };
    } catch { /* retenté une fois, comme dans l'app */ }
    if (essai === 0) await new Promise((ok) => setTimeout(ok, 1200));
  }
  return { data: null, injoignable: true };
};

const platform = job.platform;
const pf = structuredClone(job.pf);
const titre = String(job.inv?.titre || job.title || "");
const objet = String(pf.categorie_objet_ia || pf.categorie_verification?.objet || titre);
const genre = String(pf.genre || pf.univers || "");
const refuses = cheminsRefuses(platform, pf);
const plaus = pf.categorie_plausibilite ?? null;
const familleVeto = familleVetoDe(plaus ? { famille: plaus.famille_objet, source: plaus.source_famille } : null);
// Les candidates que l'étape 3 de l'app aurait ratissées pour ce mot.
const connus = await candidatsParMot(objet, platform, { genre, titre });
const res = await rayonApresRefus({
  platform, objet, titre,
  attributs: { genre: genre === "Mixte" ? "" : genre, taille: String(pf.taille ?? ""), marque: String(pf.marque ?? "") },
  genre, refuses, familleVeto, pf, appelerResolve, candidatsConnus: connus,
});
const avant = Array.isArray(pf.categoryPath ?? pf.lbcCategoryPath ?? pf.beebsCategoryPath ?? pf.ebayCategoryPath ?? pf.oplaCategoryPath)
  ? (pf.categoryPath ?? pf.lbcCategoryPath ?? pf.beebsCategoryPath ?? pf.ebayCategoryPath ?? pf.oplaCategoryPath) : null;
appliquerRayonApresRefus(platform, pf, res, { objet, motSource: "ia", refuses });
pf.rattrapage_rayon_refuse = {
  le: new Date().toISOString(),
  par: "scripts/rattrapage-rayon-refuse.mjs (même mécanisme que l'app)",
  rayon_avant: avant,
  issue: res.issue,
};
console.log(JSON.stringify({
  job: job.id, platform, issue: res.issue,
  rayon_avant: avant, rayon_apres: res.chemin ?? null, id_apres: res.id ?? null,
  paliers: res.paliers, appels: res.appels,
  question: res.issue === "question" ? { motif: res.motif, candidats: (res.candidats ?? []).map((c) => c.chemin.join(" > ")) } : null,
  // Les clés de rayon telles que le mécanisme les a écrites : c'est le patch.
  patch: Object.fromEntries(Object.entries(pf).filter(([k]) => [
    "categoryPath", "lbcCategoryPath", "beebsCategoryPath", "ebayCategoryPath", "ebayCategoryId", "oplaCategoryPath", "oplaCategoryCode",
    "categorie_source", "categorie_par_mot", "categorie_verification", "rayon_a_choisir", "rayon_a_reessayer", "rattrapage_rayon_refuse",
  ].includes(k))),
  retirees: ["categorie_incertaine", "lbcCategorieIncertaine", "categorie_a_choisir", "categorie_plausibilite"].filter((k) => k in job.pf && !(k in pf)),
}, null, 1));
