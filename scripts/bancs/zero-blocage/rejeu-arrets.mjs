// ═══════════════════════════════════════════════════════════════════════════
// REJEU « ZÉRO BLOCAGE » (24/10, lot de Nico, C2) — LECTURE SEULE
// ═══════════════════════════════════════════════════════════════════════════
//   node scripts/bancs/zero-blocage/rejeu-arrets.mjs [--depuis 2026-09-18]
// Chaque arrêt de NOTRE fait depuis --depuis (needs_user / failed, courant ou archivé, y compris ceux que la
// personne a ensuite ABANDONNÉS — un échec, jamais une annulation), classé par cause (_shared/cause-blocage.js),
// puis rejoué contre les règles d'aujourd'hui :
//   · SIMULÉ quand la règle est une fonction pure et que les données sont en base :
//       titre refusé → assagirSymbolesVinted + titreRecevable sur le titre du job ;
//       copie Depop incomplète / frais de port → completerCopieDepop (dépôts, capture, fiche réels) ;
//   · sinon, par la RÈGLE qui couvre la cause (ce lot, ou un lot d'avant dont le dernier cas est antérieur) ;
//   · « vrai choix » : une information que seule la personne a (ISBN illisible, code-barres, mesure) ;
//   · « reste » : rien n'empêche encore la cause — dit tel quel, avec ses chiffres.
// Résultat : docs/enquetes/zero-blocage-2410/rejeu-arrets.json (chiffres + identifiants, aucun texte client).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? d : (process.argv[i + 1] ?? d); };
const DEPUIS = String(arg("depuis", "2026-09-18"));
if (!/^\d{4}-\d{2}-\d{2}$/.test(DEPUIS)) throw new Error("--depuis AAAA-MM-JJ");
const imp = (p) => import(pathToFileURL(path.join(RACINE, p)).href);
const { blocagesDuJob, ORIGINE } = await imp("supabase/functions/_shared/cause-blocage.js");
const { assagirSymbolesVinted } = await imp("supabase/functions/_shared/titre-symboles-vinted.js");
const { titreRecevable } = await imp("supabase/functions/_shared/titre-du-job.js");
const { completerCopieDepop, champsManquantsCopieDepop, slugDepop } = await imp("supabase/functions/_shared/copie-republication-depop.js");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "fillsell-rejeu-"));
let nReq = 0;
function sql(requete) {
  const f = path.join(TMP, `r${++nReq}.sql`);
  fs.writeFileSync(f, requete);
  for (let essai = 1; ; essai++) {
    try {
      const out = execFileSync("npx", ["supabase", "db", "query", "--linked", "-o", "json", "-f", `"${f}"`],
        { cwd: RACINE, encoding: "utf8", shell: true, maxBuffer: 512 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
      return JSON.parse(out.slice(out.indexOf("{"))).rows ?? [];
    } catch (e) { if (essai >= 3) throw e; }
  }
}

const jobs = sql(`
  select j.id, j.user_id, j.inventaire_id, j.platform, j.action, j.status, j.error, j.title, j.description, j.created_at,
         j.platform_listing_id, j.listing_url,
         jsonb_build_object(
           'needs_user_source', j.platform_fields->'needs_user_source', 'abandon_utilisateur', j.platform_fields->'abandon_utilisateur',
           'marque', j.platform_fields->'marque', 'source', j.platform_fields->'source',
           'depopCategoryPath', j.platform_fields->'depopCategoryPath', 'depopEtat', j.platform_fields->'depopEtat',
           'depopPort', j.platform_fields->'depopPort',
           'erreurs_archivees', (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(
              case when jsonb_typeof(j.platform_fields->'erreurs_archivees') = 'array' then j.platform_fields->'erreurs_archivees' else '[]'::jsonb end) x
              where x->>'statut' in ('needs_user', 'failed'))) as platform_fields
    from public.cross_post_jobs j
   where j.created_at >= '${DEPUIS}'
     and (j.status in ('needs_user', 'failed')
          or (jsonb_typeof(j.platform_fields->'erreurs_archivees') = 'array'
              and exists (select 1 from jsonb_array_elements(j.platform_fields->'erreurs_archivees') x where x->>'statut' in ('needs_user', 'failed'))))`);

// Les règles d'aujourd'hui, par cause. `avant` = date du correctif d'un lot précédent : une cause dont le dernier
// cas est ANTÉRIEUR est comptée corrigée ; un cas postérieur la remet « reste ».
const REGLES = {
  capture_depop_incomplete: { statut: "simule", regle: "copie Depop complétée avant le départ (A2, _shared/copie-republication-depop.js)" },
  capture_depop_frais_de_port: { statut: "simule", regle: "port du dépôt FillSell, sinon prix par défaut (A2) — sans eux, une question au vendeur (son prix d'envoi)" },
  titre_refuse: { statut: "simule", regle: "titre nettoyé avant l'envoi : symboles toutes langues, mots sans lettre latine, titre générique (B4)" },
  article_refuse_entre_en_file: { statut: "corrige", regle: "article refusé par la plateforme écarté avant la file, republication close (B7)" },
  marque_hors_menu: { statut: "corrige", regle: "pause marque jamais permanente (gpj) + chaîne de repli de l'extension 0.6.134 (A3)" },
  marque_inconnue: { statut: "corrige", regle: "marque introuvable → même marque autrement écrite, sinon « Sans marque » (A3, extension 0.6.134 ; Depop : liste)" },
  lecture_annonce_echouee: { statut: "corrige", regle: "mémoire « annonce morte » oubliée sur tous les chemins (A4, extension 0.6.134) ; vendue ≠ introuvable" },
  introuvable_a_confirmer: { statut: "corrige", regle: "idem A4 ; relevé disparu/vendu tranché (handler-watch)" },
  introuvable_persistant: { statut: "corrige", regle: "idem A4" },
  capture_incomplete: { statut: "corrige", regle: "erreur passagère réessayée (upload 4 essais, recapture en file espacée) — A5" },
  selecteur_casse: { statut: "corrige", regle: "accident avant retrait = file espacée, jamais un geste (A5, extension 0.6.134)" },
  interruption_repetee: { statut: "corrige", regle: "accident avant retrait = file espacée + sentinelle (A5) — cause du rechargement non prouvée" },
  boutique_a_choisir: { statut: "avant", avant: "2026-10-15T20:00:00+02:00", regle: "boutique Vinted tranchée par l'app (15/10 soir)" },
  categorie: { statut: "avant", avant: "2026-10-18T18:00:00+02:00", regle: "rayon eBay vérifié / moteur Depop / Leboncoin (lots 11-18/10)" },
  valeur_refusee: { statut: "corrige", regle: "valeur refusée → recalculée pour la catégorie qui part : Département, liste à une valeur, MPN (A6)" },
  format_colis_refuse: { statut: "partiel", regle: "correction de rayon jamais vers une autre famille de grille (A5) — une grille changée par Vinted reste une question" },
  champ_demande: { statut: "partiel", regle: "champs déduits (18/10) + stockage/simlock repris de la capture (A5) ; tailles Depop, poids Leboncoin PRO : à finir" },
  isbn: { statut: "choix", regle: "ISBN illisible : seul le livre le dit (« Ce livre n'a pas d'ISBN » proposé)" },
  ean: { statut: "choix", regle: "code-barres : seul l'emballage le dit" },
  site_ebay_non_pris_en_charge: { statut: "reste", regle: "compte eBay d'un autre pays : FillSell ne publie que sur ebay.fr" },
  depot_non_confirme: { statut: "reste", regle: "dépôt jamais vu en ligne : plateforme ou dépôt muet — à instruire cas par cas" },
  demarrage_impossible: { statut: "reste", regle: "publication qui ne démarre pas sur le poste — à instruire" },
  echec_inexplique: { statut: "reste", regle: "échec sans motif lisible — à instruire (la sentinelle les liste)" },
  prevol_negatif: { statut: "partiel", regle: "prévol : voir causes détaillées" },
  autre: { statut: "reste", regle: "non classé — à instruire" },
};

// Données pour la simulation Depop (copies incomplètes encore ouvertes).
const depopOuverts = jobs.filter((j) => j.platform === "depop" && j.action === "republish" && j.status === "needs_user");
const idsInv = [...new Set(depopOuverts.map((j) => j.inventaire_id).filter(Boolean))];
const depots = idsInv.length ? sql(`select id, user_id, inventaire_id, platform, action, status, description, platform_listing_id, listing_url, published_at, created_at, platform_fields from public.cross_post_jobs where platform = 'depop' and action = 'publish' and inventaire_id in (${idsInv.join(",")})`) : [];
const slugs = [...new Set(depopOuverts.map((j) => slugDepop(j.platform_listing_id) || slugDepop(j.listing_url)).filter(Boolean))];
const captures = slugs.length ? sql(`select listing_id, capture from public.annonces_plateforme where platform = 'depop' and listing_id in (${slugs.map((s) => `'${s.replace(/'/g, "''")}'`).join(",")})`) : [];
const fiches = idsInv.length ? sql(`select id, description, attributs->'etat' as etat from public.inventaire where id in (${idsInv.join(",")})`) : [];
const captureDe = new Map(captures.map((c) => [String(c.listing_id).toLowerCase(), c.capture]));
const ficheDe = new Map(fiches.map((f) => [String(f.id), f]));

const parCause = new Map();
const simulations = { titres: { rejoues: 0, passent: 0, restent: [] }, depop: { rejoues: 0, complets: 0, port_seul: 0, restent: [] } };
for (const j of jobs) {
  const vus = new Set();
  for (const b of blocagesDuJob(j)) {
    if (b.origine !== ORIGINE.NOUS || vus.has(b.cause)) continue;
    vus.add(b.cause);
    const le = b.le ?? j.created_at;
    const g = parCause.get(b.cause) ?? { n: 0, abandonnes: 0, comptes: new Set(), dernier: null, apres_correctif: 0, exemples: [] };
    g.n++; if (b.abandonne) g.abandonnes++; g.comptes.add(j.user_id);
    if (!g.dernier || String(le) > g.dernier) g.dernier = String(le);
    const r = REGLES[b.cause];
    if (r?.statut === "avant" && Date.parse(le) > Date.parse(r.avant)) g.apres_correctif++;
    if (g.exemples.length < 4) g.exemples.push(String(j.id).slice(0, 8));
    parCause.set(b.cause, g);
    if (b.cause === "titre_refuse" && j.platform === "vinted") {
      simulations.titres.rejoues++;
      const apres = assagirSymbolesVinted(String(j.title ?? ""), { marque: j.platform_fields?.marque ?? null });
      const symboles = /symbol|simbol|símbol/i.test(b.texte);
      if (titreRecevable(apres) && (symboles ? apres !== String(j.title ?? "") : true)) simulations.titres.passent++;
      else simulations.titres.restent.push({ id: String(j.id).slice(0, 8), motif: b.texte.slice(0, 80) });
    }
  }
}
for (const j of depopOuverts) {
  if (!champsManquantsCopieDepop(j).length) continue;
  simulations.depop.rejoues++;
  const slug = slugDepop(j.platform_listing_id) || slugDepop(j.listing_url);
  const r = completerCopieDepop({ job: j, depots: depots.filter((d) => String(d.inventaire_id) === String(j.inventaire_id)), capture: slug ? captureDe.get(slug) ?? null : null, fiche: ficheDe.get(String(j.inventaire_id)) ?? null });
  const manquants = r ? r.manquants : champsManquantsCopieDepop(j);
  if (!manquants.length) simulations.depop.complets++;
  else if (manquants.length === 1 && manquants[0] === "port") simulations.depop.port_seul++;
  else simulations.depop.restent.push({ id: String(j.id).slice(0, 8), manquants });
}

const lignes = [...parCause.entries()].map(([cause, g]) => {
  const r = REGLES[cause] ?? REGLES.autre;
  let statut = r.statut;
  if (statut === "avant") statut = g.apres_correctif ? "reste" : "corrige_avant";
  if (statut === "simule") statut = "simule";
  return { cause, n: g.n, abandonnes: g.abandonnes, comptes: g.comptes.size, dernier: g.dernier?.slice(0, 16) ?? null, statut, regle: r.regle, exemples: g.exemples };
}).sort((a, b) => b.n - a.n);
const total = lignes.reduce((s, l) => s + l.n, 0);
const somme = (f) => lignes.filter(f).reduce((s, l) => s + l.n, 0);
const resultat = {
  rejeu: "zéro blocage — arrêts de notre fait", depuis: DEPUIS, fait_le: new Date().toISOString(), jobs: jobs.length, arrets_nous: total,
  bilan: {
    corriges_par_ce_lot: somme((l) => l.statut === "corrige"),
    corriges_avant: somme((l) => l.statut === "corrige_avant"),
    simules: somme((l) => l.statut === "simule"),
    partiels: somme((l) => l.statut === "partiel"),
    vrais_choix: somme((l) => l.statut === "choix"),
    restent: somme((l) => l.statut === "reste"),
  },
  simulations, par_cause: lignes,
};
const dir = path.join(RACINE, "docs", "enquetes", "zero-blocage-2410");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "rejeu-arrets.json"), `${JSON.stringify(resultat, null, 1)}\n`);
console.log(`REJEU depuis ${DEPUIS} : ${jobs.length} jobs, ${total} arrêts de notre fait`);
console.table(resultat.bilan);
console.log("Simulations :", JSON.stringify({ titres: { ...simulations.titres, restent: simulations.titres.restent.length }, depop: { ...simulations.depop, restent: simulations.depop.restent.length } }));
console.table(lignes.map(({ exemples, ...l }) => l));
