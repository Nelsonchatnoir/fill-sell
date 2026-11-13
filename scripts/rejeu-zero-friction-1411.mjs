// REJEU — lot « zéro friction » du 14/11/2026 (A4, demande de Nico) : les nouvelles règles rejouées sur les vraies
// questions des 7 derniers jours, SANS RIEN PUBLIER (lecture seule : `supabase db query --read-only`).
//   node scripts/rejeu-zero-friction-1411.mjs [--debut 2026-11-07] [--fin 2026-11-14]
// Rend des CHIFFRES seulement (aucun titre, aucun compte) : combien de questions et d'abandons auraient été évités, et
// combien de valeurs posées sont certaines / probables. Règles rejouées : rangement Beebs du livre adulte, âge Beebs
// certain puis probable (champs-requis-auto.js), valeur probable des autres champs (publication/moteur/valeursProbables.js),
// clic eBay qui ne refuse plus un champ jamais montré, et « le dernier écran laisse partir ce qui est prêt ».
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ageBeebsAuto, ageBeebsProbable, rayonBeebsDuLivre } from "../supabase/functions/_shared/champs-requis-auto.js";
import { valeurProbable } from "../src/publication/moteur/valeursProbables.js";
import { plateformeDuJeuPourLaListe } from "../src/utils/jeuxVideo.js";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const DEBUT = arg("--debut", "2026-11-07"), FIN = arg("--fin", "2026-11-14");
const lire = (sql) => {
  const fichier = path.join(os.tmpdir(), `rejeu-zf-${process.pid}.sql`);
  fs.writeFileSync(fichier, sql);
  try {
    const out = execSync(`npx supabase db query --linked --read-only -f "${fichier}" -o json`, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
    return JSON.parse(out.slice(out.indexOf("{"))).rows ?? [];
  } finally { fs.rmSync(fichier, { force: true }); }
};
const fenetre = `l.created_at >= ('${DEBUT} 00:00'::timestamp at time zone 'Europe/Paris') and l.created_at < ('${FIN} 00:00'::timestamp at time zone 'Europe/Paris')`;

const lignes = lire(`select l.user_id::text u, l.metadata->>'platform' pf, coalesce(l.metadata->>'champ_cle', l.metadata->>'champ') champ,
  l.metadata->>'categorie' cat, l.metadata->>'inventaire_id' inv, l.metadata->>'issue' issue, l.metadata->'champs' champs,
  l.metadata->>'partage' partage, extract(epoch from l.created_at)::bigint t, i.titre, i.description
  from usage_logs l left join inventaire i on i.id::text = l.metadata->>'inventaire_id'
  where l.feature = 'champ_requis_bloquant' and ${fenetre} and l.metadata->>'issue' in ('affiche','abandonne','bloque_au_clic')`);
const fermetures = lire(`select l.user_id::text u, extract(epoch from l.created_at)::bigint t, l.metadata->>'etape' etape, l.metadata->>'plateformes' pfs
  from usage_logs l where l.feature = 'action_app_ratee' and l.metadata->>'action' = 'stepper_ferme' and ${fenetre}`);
const catalogue = lire(`select platform, category_key, field_key, field_label, allowed_values from platform_category_aspects where required`);
const cats = [...new Set(lignes.filter((x) => x.pf === "ebay" && x.issue === "bloque_au_clic" && x.cat).map((x) => x.cat))];
const ebay = cats.length ? lire(`select category_id, a->>'name' nom, a->'allowedValues' vals from ebay_item_aspects, jsonb_array_elements(aspects) a
  where category_id in (${cats.map((c) => `'${String(c).replace(/'/g, "")}'`).join(",")}) and (a->>'required')::boolean`) : [];

const listeDe = (pf, cat, champ) => {
  const r = catalogue.find((x) => x.platform === pf && x.category_key === cat && (x.field_key === champ || x.field_label === champ));
  return r ? { valeurs: Array.isArray(r.allowed_values) ? r.allowed_values : [], label: r.field_label || champ } : null;
};
const textes = (x) => [x.titre ?? "", x.description ?? ""];

// ── Les questions affichées, une par (compte, article, plateforme, champ) ──
const questions = new Map();
for (const x of lignes.filter((l) => l.issue === "affiche" || l.issue === "abandonne")) {
  const k = [x.u, x.inv, x.pf, x.champ].join("|");
  const q = questions.get(k) ?? { ...x, affiche: false, abandon: false };
  if (x.issue === "affiche") q.affiche = true;
  if (x.issue === "abandonne") { q.abandon = true; q.tAbandon = x.t; }
  questions.set(k, q);
}
const verdict = (q) => {
  const chemin = q.cat ? String(q.cat).split(" > ") : null;
  if (q.pf === "beebs" && /^[aâ]ge$/i.test(q.champ ?? "")) {
    const liste = listeDe("beebs", q.cat, "Âge")?.valeurs ?? [];
    const r = rayonBeebsDuLivre({ chemin, textes: textes(q) });
    if (r) return { sorte: "certaine", regle: "rayon_beebs_sans_age" };
    if (ageBeebsAuto({ chemin, textes: textes(q), allowedValues: liste })?.valeur) return { sorte: "certaine", regle: "age_certain" };
    if (ageBeebsProbable({ chemin, textes: textes(q), allowedValues: liste })?.valeur) return { sorte: "probable", regle: "age_probable" };
    return { sorte: "question", regle: "age_sans_indice" };
  }
  // La machine d'un jeu : règle EN SERVICE depuis le 13/11 01:00 (1e) — comptée à part, jamais comme un gain de ce lot.
  if (/^(Console|video_game_platform)$/.test(q.champ ?? "")) {
    const lj = listeDe(q.pf, q.cat, q.champ);
    if (lj && plateformeDuJeuPourLaListe({ plateforme: q.pf, cle: q.champ, titres: [q.titre ?? ""], descriptions: [q.description ?? ""], allowedValues: lj.valeurs })) return { sorte: "deja_regle", regle: "machine_du_jeu_1311" };
  }
  if (q.partage || ["taille", "matiere", "couleur", "marque", "genre"].includes(q.champ)) return { sorte: "question", regle: `partage_${q.partage || q.champ}` };
  const l = listeDe(q.pf, q.cat, q.champ);
  const p = l ? valeurProbable({ platform: q.pf, key: q.champ, label: l.label, allowedValues: l.valeurs, chemin, textes: textes(q) }) : null;
  if (p) return { sorte: p.certitude, regle: p.source };
  return { sorte: "question", regle: l ? "aucune_valeur_sure" : "liste_inconnue" };
};
const compte = {};
const ajoute = (cle, champ) => { compte[cle] = compte[cle] ?? {}; compte[cle][champ] = (compte[cle][champ] ?? 0) + 1; };
const restantsParChamp = {};
let qDeja = 0, qTot = 0, qCert = 0, qProb = 0, qRest = 0, abTot = 0, abDeja = 0, abParValeur = 0, abParAutres = 0, abRestent = 0;
for (const q of questions.values()) {
  const v = verdict(q);
  const champ = `${q.pf}:${q.champ}`;
  qTot++;
  if (v.sorte === "certaine") qCert++; else if (v.sorte === "probable") qProb++; else if (v.sorte === "deja_regle") qDeja++; else qRest++;
  ajoute(v.sorte, champ);
  if (!q.abandon) continue;
  abTot++;
  if (v.sorte === "deja_regle") { abDeja++; continue; }
  if (v.sorte !== "question") { abParValeur++; continue; }
  // La question reste : les AUTRES plateformes cochées seraient-elles parties ? (fermeture du même compte à ±10 s)
  const f = fermetures.find((x) => x.u === q.u && Math.abs(Number(x.t) - Number(q.tAbandon)) <= 10);
  const autres = String(f?.pfs ?? "").split(",").filter((p) => p && p !== q.pf);
  if (autres.length) abParAutres++; else { abRestent++; restantsParChamp[champ] = (restantsParChamp[champ] ?? 0) + 1; }
}
// ── Les clics eBay refusés : jamais plus sur un champ que l'écran n'a pas montré ──
let clics = 0, clicsValeur = 0, clicsDepot = 0;
for (const x of lignes.filter((l) => l.pf === "ebay" && l.issue === "bloque_au_clic")) {
  clics++;
  const noms = Array.isArray(x.champs) ? x.champs : [];
  const poses = noms.filter((n) => {
    const a = ebay.find((e) => e.category_id === x.cat && e.nom === n);
    return a && valeurProbable({ platform: "ebay", key: n, label: n, allowedValues: Array.isArray(a.vals) ? a.vals : [] });
  });
  if (noms.length && poses.length === noms.length) clicsValeur++; else clicsDepot++;
}
console.log(JSON.stringify({
  fenetre: `${DEBUT} → ${FIN} (Paris)`,
  questions_affichees: qTot, devenues_certaines: qCert, devenues_probables: qProb, deja_reglees_13_11: qDeja, restent_questions: qRest,
  abandons: abTot, abandons_evites_par_une_valeur: abParValeur, abandons_deja_regles_13_11: abDeja, abandons_ou_les_autres_partent: abParAutres, abandons_sans_autre_plateforme: abRestent, abandons_restants_par_champ: restantsParChamp,
  clics_ebay_refuses: clics, clics_ebay_valeur_posee: clicsValeur, clics_ebay_laisses_au_depot: clicsDepot,
  detail: compte,
}, null, 2));
