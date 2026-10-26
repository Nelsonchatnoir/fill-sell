// ═══════════════════════════════════════════════════════════════════════════
// selftest:file-annuler — « Ta file » : Tout annuler et annulation par ligne (26/10, Nico)
// ═══════════════════════════════════════════════════════════════════════════
// src/utils/annulerFile.js et son câblage dans FileDesJobs / StockTab :
//   · s'annule : une publication en attente sans lien ; une republication dont le
//     relevé n'a pas commencé (étape absente ou 'a_capturer') ;
//   · jamais : un job en cours, une republication 'captured' / 'deleted' /
//     suppression envoyée (l'annonce est ou a pu être supprimée), un retrait ;
//   · l'écriture : UNE mise à jour par job, gardée (statut lu, action, étape ou
//     lien), statut + arret_utilisateur ensemble, hors_quota sur les
//     republications (exclues des compteurs de quota) ;
//   · l'écran : « Tout annuler » rouge à côté de la pause, confirmation, croix et
//     glissement par ligne, rien sur les lignes « En cours ».
import { readFileSync } from "node:fs";
import { jobAnnulable, bilanAnnulation, questionAnnulation, annulerJobs, messageAnnule } from "../src/utils/annulerFile.js";

let echecs = 0;
const ok = (cond, titre, detail = "") => {
  if (cond) { console.log(`  ✓ ${titre}`); return; }
  echecs++;
  console.error(`  ✗ ${titre}${detail ? `\n      ${detail}` : ""}`);
};
let n = 0;
const job = (x) => ({ id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`, inventaire_id: n, platform: "leboncoin", action: "publish", status: "pending", listing_url: null, platform_listing_id: null, platform_fields: {}, error: null, ...x });

console.log("1. CE QUI S'ANNULE — et rien d'autre");
ok(jobAnnulable(job({})), "publication en attente, sans lien");
ok(jobAnnulable(job({ status: "needs_user" })), "publication qui attend un geste (rien n'est en ligne)");
ok(!jobAnnulable(job({ listing_url: "https://www.leboncoin.fr/ad/1" })), "publication avec un lien : quelque chose est en ligne → jamais");
ok(!jobAnnulable(job({ platform_listing_id: "3291779198" })), "publication avec un numéro → jamais");
ok(!jobAnnulable(job({ status: "processing" })), "publication en cours → elle va au bout");
ok(jobAnnulable(job({ action: "republish" })), "republication pas commencée (étape absente)");
ok(jobAnnulable(job({ action: "republish", platform_fields: { republish_step: "a_capturer" } })), "republication à capturer");
ok(!jobAnnulable(job({ action: "republish", platform_fields: { republish_step: "captured" } })), "'captured' : la suppression a pu partir → jamais");
ok(!jobAnnulable(job({ action: "republish", platform_fields: { republish_step: "deleted", deleted_at: "2026-10-26T14:49:52Z" } })), "ancienne annonce supprimée → JAMAIS (elle doit revenir en ligne)");
ok(!jobAnnulable(job({ action: "republish", status: "needs_user", platform_fields: { republish_step: "deleted" } })), "supprimée et bloquée → jamais");
ok(!jobAnnulable(job({ action: "republish", platform_fields: { republish_step: "a_capturer", republish_suppression_envoyee: { at: "x" } } })), "suppression envoyée → jamais");
ok(!jobAnnulable(job({ action: "republish", error: "Suppression envoyée à Leboncoin — en attente de confirmation" })), "suppression envoyée (dite dans le message) → jamais");
ok(!jobAnnulable(job({ action: "republish", platform_fields: { republish_step: "inconnue" } })), "étape inconnue = traitée comme avancée → jamais");
ok(!jobAnnulable(job({ action: "republish", status: "processing" })), "republication en cours → jamais");
ok(!jobAnnulable(job({ action: "delete" })), "retrait (après une vente) → JAMAIS (double vente)");
ok(!jobAnnulable(job({ action: "delete", status: "needs_user" })), "retrait qui attend un geste → jamais");
ok(!jobAnnulable(job({ id: "optimistic-1" })), "ligne optimiste (pas encore en base) → rien");
ok(!jobAnnulable(job({ status: "published" })) && !jobAnnulable(job({ status: "cancelled" })), "les finis ne s'annulent pas");

console.log("2. LE BILAN ET LA QUESTION");
{
  const jobs = [
    job({}), job({}), job({ action: "republish" }),
    job({ status: "processing" }), job({ action: "delete" }), job({ action: "republish", platform_fields: { republish_step: "deleted" } }),
    job({ status: "published" }),
  ];
  const b = bilanAnnulation(jobs);
  ok(b.annulables.length === 3 && b.publications === 2 && b.republications === 1, `3 annulables (2 publications, 1 republication) — ${b.annulables.length}`);
  ok(b.restent === 3, `3 continuent (en cours, retrait, retirée) — ${b.restent}`);
  ok(questionAnnulation({ publications: 18, republications: 0 }) === "Annuler les 18 publications en attente ?", "« Annuler les 18 publications en attente ? »");
  ok(questionAnnulation({ publications: 0, republications: 4 }) === "Annuler les 4 republications en attente ?", "republications seules");
  ok(questionAnnulation({ publications: 2, republications: 1 }) === "Annuler les 3 publications et republications en attente ?", "mélange");
  ok(questionAnnulation({ publications: 1, republications: 0 }) === "Annuler la publication en attente ?", "une seule");
  ok(/restée en ligne/.test(messageAnnule({ action: "republish" })) && /rien n'a été publié/.test(messageAnnule({ action: "publish" })), "le message laissé sur le job dit vrai");
}

console.log("3. L'ÉCRITURE GARDÉE (bouchon qui enregistre chaque requête)");
{
  const base = [
    job({ id: "a" }), job({ id: "b", action: "republish", platform_fields: { republish_step: "a_capturer", gardee: 1 } }),
    job({ id: "c", action: "republish", platform_fields: { republish_step: "a_capturer" } }),
    job({ id: "d", action: "delete" }),
  ];
  // Entre la lecture de l'écran et l'écriture : « c » vient de passer à 'captured' (la base dit vrai, l'écran avait du retard).
  const enBase = new Map(base.map((j) => [j.id, structuredClone(j)]));
  enBase.get("c").platform_fields.republish_step = "captured";
  const traces = [];
  const supabase = {
    from(table) {
      const t = { table, filtres: [], patch: null, sel: null };
      const ch = {
        select(c) { t.sel = c; return ch; },
        in(c, v) { t.filtres.push(["in", c, v]); return ch; },
        eq(c, v) { t.filtres.push(["eq", c, v]); return ch; },
        is(c, v) { t.filtres.push(["is", c, v]); return ch; },
        or(v) { t.filtres.push(["or", v]); return ch; },
        update(p) { t.patch = p; return ch; },
        then(res, rej) {
          traces.push(t);
          const ids = t.filtres.find((f) => f[0] === "in" && f[1] === "id")?.[2];
          const id = t.filtres.find((f) => f[0] === "eq" && f[1] === "id")?.[2];
          const lignes = [...enBase.values()].filter((j) => (ids ? ids.includes(j.id) : true) && (id ? j.id === id : true));
          if (!t.patch) return Promise.resolve({ data: lignes.map((j) => structuredClone(j)), error: null }).then(res, rej);
          const j = lignes[0];
          const etape = j?.platform_fields?.republish_step;
          const garde = j && t.filtres.every((f) => f[0] !== "eq" || f[1] === "user_id" || j[f[1]] === f[2])
            && (j.action !== "republish" || etape == null || etape === "a_capturer");
          if (garde) Object.assign(j, t.patch);
          return Promise.resolve({ data: garde ? [{ id: j.id }] : [], error: null }).then(res, rej);
        },
      };
      return ch;
    },
  };
  const r = await annulerJobs(supabase, { userId: "u1", jobs: base, maintenant: new Date("2026-10-26T19:00:00Z") });
  ok(JSON.stringify(r.annules) === JSON.stringify(["a", "b"]), `annulés : a (publication), b (republication) — ${JSON.stringify(r.annules)}`);
  ok(r.refuses === 1, `« c » est partie entre-temps (captured) : refusée, jamais annulée — ${r.refuses}`);
  ok(!traces.some((t) => t.patch && t.filtres.some((f) => f[0] === "eq" && f[1] === "id" && f[2] === "d")), "le retrait « d » n'est jamais touché");
  const ecr = traces.filter((t) => t.patch);
  ok(ecr.every((t) => t.patch.status === "cancelled" && t.patch.platform_fields?.arret_utilisateur), "statut ET arret_utilisateur dans la MÊME écriture (l'extension ne peut plus y écrire)");
  ok(ecr.every((t) => t.filtres.some((f) => f[0] === "eq" && f[1] === "status")), "compare-and-swap sur le statut lu");
  const eB = ecr.find((t) => t.filtres.some((f) => f[1] === "id" && f[2] === "b"));
  ok(eB?.filtres.some((f) => f[0] === "or" && /republish_step\.is\.null,platform_fields->>republish_step\.eq\.a_capturer/.test(f[1])), "republication : l'étape re-vérifiée en base");
  ok(eB?.filtres.some((f) => f[0] === "is" && f[1] === "platform_fields->deleted_at"), "republication : aucune suppression en base");
  ok(eB?.patch.platform_fields.hors_quota === true && eB.patch.platform_fields.gardee === 1, "hors_quota posé (quota non consommé), champs relus conservés");
  const eA = ecr.find((t) => t.filtres.some((f) => f[1] === "id" && f[2] === "a"));
  ok(eA?.filtres.some((f) => f[0] === "is" && f[1] === "listing_url" && f[2] === null) && !("hors_quota" in eA.patch.platform_fields), "publication : aucun lien en base ; pas de hors_quota (le quota d'annonces se compte à la génération)");
  ok(enBase.get("c").status === "pending" && enBase.get("d").status === "pending", "en base : « c » et « d » intacts");
  const vide = await annulerJobs(supabase, { userId: "u1", jobs: [job({ action: "delete" })] });
  ok(vide.annules.length === 0, "rien d'annulable : aucune requête d'écriture");
}

console.log("4. LES COMPTEURS DE QUOTA EXCLUENT DÉJÀ hors_quota (aucune migration)");
{
  const mig = readFileSync(new URL("../supabase/migrations/20261024200000_plus_de_plafond_par_jour.sql", import.meta.url), "utf8");
  ok(/\?\| ARRAY\['opla_sortie', 'hors_quota'\]/.test(mig), "spend_coins_and_republish : hors_quota exclu");
  const q = readFileSync(new URL("../supabase/migrations/20261023120000_republications_hors_quota.sql", import.meta.url), "utf8");
  ok(/hors_quota/.test(q), "quotas_etat / quota_republication_free_etat : hors_quota exclu");
}

console.log("5. L'ÉCRAN");
{
  const f = readFileSync(new URL("../src/components/FileDesJobs.jsx", import.meta.url), "utf8");
  ok(/fr \? "Tout annuler" : "Cancel all"/.test(f) && /background: T\.redInk/.test(f), "« Tout annuler », en rouge");
  const iPause = f.indexOf('(fr ? "Reprendre" : "Resume") : (fr ? "Mettre en pause" : "Pause")');
  const iTout = f.indexOf('{fr ? "Tout annuler" : "Cancel all"}');
  ok(iPause > 0 && iTout > iPause && iTout - iPause < 1200, "à côté de « Mettre en pause / Reprendre »");
  ok(/questionAnnulation\(toutAnnuler, lang\)/.test(f) && /role="alertdialog"/.test(f), "confirmation avant d'écrire");
  ok(/Rien de ce qui est déjà en ligne n'est retiré, et ton quota n'est pas consommé\./.test(f), "la confirmation dit ce qui ne bouge pas");
  ok(/bilanAnnulation\(file \? \[\.\.\.file\.en_file, \.\.\.file\.en_pause, \.\.\.file\.a_toi\]/.test(f), "« Tout annuler » ne vise jamais les lignes « En cours »");
  ok(/restent: b\.restent \+ \(file\?\.en_cours\.length \?\? 0\)/.test(f), "et la confirmation compte les « En cours » parmi ce qui continue");
  ok(/annulable=\{Boolean\(supabase && userId\) && jobAnnulable\(job\)\}/.test(f), "chaque ligne : annulable selon la règle");
  ok(/useGlisserPourAnnuler/.test(f) && /onTouchMove/.test(f) && /touchAction: "pan-y"/.test(f), "glisser vers la gauche (le défilement vertical reste libre)");
  ok(/aria-label=\{fr \? `Annuler \$\{quoi\}`/.test(f) && /<X size=\{15\}/.test(f), "la petite croix, visible, avec son nom accessible");
  ok(/Annuler \$\{quoi\} \? Rien de ce qui est en ligne ne bouge\./.test(f), "la croix demande confirmation dans la ligne");
  ok(/setMasques\(\(prev\) => new Set\(\[\.\.\.prev, \.\.\.r\.annules\.map\(String\)\]\)\)/.test(f) && /onAnnules\?\.\(r\.annules\)/.test(f), "les annulées disparaissent tout de suite, le Stock est prévenu");
  const s = readFileSync(new URL("../src/tabs/StockTab.jsx", import.meta.url), "utf8");
  ok(/onAnnules=\{marquerAnnulesDansLeStock\}/.test(s) && !/Arrêter les \$\{activite\.annulables\.length\} republications en attente/.test(s), "Stock : l'ancien « Arrêter les N republications » est remplacé");
  ok(!/arreterRepublications|repubArretEnCours/.test(s), "plus de code d'arrêt mort dans le Stock");
}

if (echecs) { console.error(`\n✗ file-annuler : ${echecs} rouge(s)`); process.exit(1); }
console.log("\n✓ file-annuler : tout passe");
