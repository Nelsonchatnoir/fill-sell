// VERROU (13/11/2026, lot « zéro problème », point 5a de Nico) : LA PHRASE DE TEST EST ÉCRITE À CHAQUE ENVOI.
//
//     npm run selftest:phrase-test-datee
//
// Compte de63ca45 : « Jeu testé aujourd’hui, le 2 novembre 2026, et fonctionnel. » était FIGÉ dans le texte de la fiche
// et recopié par chaque republication — 70 annonces Vinted en ligne et 80 republications Leboncoin en 12 jours le
// disaient avec 17 jours de retard médian (54 au plus) ; Beebs a refusé les 4 dépôts du 02/11 qui la portaient.
// Décision de Nico : la date est une donnée à part (attributs.teste_le), la phrase est écrite à chaque envoi selon SON
// modèle (« aujourd’hui » le jour même, « le <date> » plus tard), omise là où la plateforme la refuse ; ses 94 fiches à
// date figée sont réparées par script (scripts/reparations/20261113_de63ca45_date_de_test*.sql, non exécuté).
// FILLSELL_RACINE=<dossier> : le code mis à l'épreuve est celui de ce dossier (mesure « rouge avant »).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = process.env.FILLSELL_RACINE ? path.resolve(process.env.FILLSELL_RACINE) : path.resolve(ICI, "..");
const imp = async (p) => { try { return await import(pathToFileURL(path.join(RACINE, p)).href); } catch { return null; } };
const lire = (p) => { try { return fs.readFileSync(path.join(RACINE, p), "utf8"); } catch { return ""; } };
let ko = 0, n = 0;
const ok = (c, m, d) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d === undefined ? "" : `\n      ← ${JSON.stringify(d).slice(0, 400)}`}`); } };

const B = await imp("src/utils/blocsDescription.js");
const P = await imp("src/utils/phraseDeTest.js");
const C = await imp("src/utils/consignesRedaction.js");
const K = await imp("supabase/functions/_shared/capacites-texte.js");
const fx = JSON.parse(fs.readFileSync(path.join(ICI, "fixtures/redaction-de63ca45/sept-fiches.json"), "utf8"));
const lues = C?.lireConsignes?.(fx.consignes) ?? null;
const gta = fx.fiches.find((f) => f.inventaire_id === "1793616052050").texte_publie; // son texte du 02/11, phrase figée
const servir = (texte, plateforme, aujourdhui, testeLe = null) => B?.rendreDescriptionAuService?.(texte, { plateforme, lues, aujourdhui, testeLe }) ?? null;
const FIN = "Vendu comme sur les photos.\n\n📍 Remise en main propre possible.\n\n🚚 Expédition rapide et soignée, généralement sous 12 heures ouvrées.";

console.log("1. Son modèle, lu dans ses consignes");
ok(lues?.modeleTest?.jourMeme === "Jeu testé aujourd’hui, le [date], et fonctionnel." && lues?.modeleTest?.plusTard === "Jeu testé le [date] et fonctionnel."
  && lues?.modeleTest?.sansDate === "Jeu testé et fonctionnel.", "jour même / plus tard / date inconnue", lues?.modeleTest);

console.log("2. La phrase du jour de l'envoi");
{
  const le02 = servir(gta, "vinted", "2026-11-02");
  ok(le02 && le02.texte.includes("Jeu testé aujourd’hui, le 2 novembre 2026, et fonctionnel.") && !le02.modifie, "servi le 02/11 (jour du test) : « aujourd’hui, le 2 novembre 2026 », texte à l'octet près", le02?.texte?.slice(-260));
  const le10 = servir(gta, "vinted", "2026-11-10");
  ok(le10 && le10.texte.includes("Jeu testé le 2 novembre 2026 et fonctionnel.") && !/aujourd’hui/.test(le10.texte), "servi le 10/11 : « Jeu testé le 2 novembre 2026 et fonctionnel. »", le10?.texte?.slice(-260));
  ok(le10 && le10.texte.endsWith(FIN) && le10.texte.indexOf("Jeu testé le") < le10.texte.indexOf("Vendu comme sur les photos."), "à la même place : avant ses phrases finales, qui restent les dernières");
  ok(le10 && le10.texte.replace("Jeu testé le 2 novembre 2026 et fonctionnel.", "Jeu testé aujourd’hui, le 2 novembre 2026, et fonctionnel.") === gta, "rien d'autre ne change dans son texte");
  const lbc = servir(gta, "leboncoin", "2026-11-13");
  ok(lbc && lbc.texte.includes("Jeu testé le 2 novembre 2026 et fonctionnel."), "republication Leboncoin du 13/11 (texte capturé portant l'ancienne phrase) : remise au jour");
}

console.log("3. La date à part (fiche réparée : la phrase n'est plus dans le texte)");
{
  const repare = gta.replace("Jeu testé aujourd’hui, le 2 novembre 2026, et fonctionnel.\n\n", "");
  const r = servir(repare, "vinted", "2026-11-13", "2026-11-02");
  ok(r && r.texte === gta.replace("Jeu testé aujourd’hui, le 2 novembre 2026, et fonctionnel.", "Jeu testé le 2 novembre 2026 et fonctionnel."), "teste_le 02/11, servi le 13/11 : la phrase revient à sa place (avant les phrases finales)", r?.texte?.slice(-260));
  const meme = servir(repare, "ebay", "2026-11-02", "2026-11-02");
  ok(meme && meme.texte.includes("Jeu testé aujourd’hui, le 2 novembre 2026, et fonctionnel."), "servi le jour du test : « aujourd’hui »");
  const premier = servir(repare, "vinted", "2026-11-13", "2026-11-01");
  ok(premier && premier.texte.includes("Jeu testé le 1er novembre 2026 et fonctionnel."), "« 1er novembre » (date formatée par la langue, Intl)");
}

console.log("4. Omise là où la plateforme la refuse (Beebs)");
{
  ok(K && K.capacitesTexte("beebs").description.phraseDeTest === false && K.capacitesTexte("vinted").description.phraseDeTest === true, "table des capacités : Beebs non, Vinted oui");
  const b = servir(gta, "beebs", "2026-11-10");
  ok(b && !/testé/.test(b.texte) && b.texte.endsWith(FIN), "Beebs : aucune phrase de test, ses phrases finales gardées", b?.texte?.slice(-200));
  const b2 = servir(gta.replace("Jeu testé aujourd’hui, le 2 novembre 2026, et fonctionnel.", "Jeu testé et fonctionnel."), "beebs", "2026-11-10");
  ok(b2 && !/testé/.test(b2.texte), "Beebs : même la forme sans date part sans");
}

console.log("5. Pour tous les comptes : rien ne bouge sans modèle ni date");
{
  const t = "Pull en laine bleu.\n\nEnvoi rapide.";
  const r = B?.rendreDescriptionAuService?.(t, { plateforme: "vinted", lues: null, aujourdhui: "2026-11-13" });
  ok(r && r.texte === t && !r.modifie, "texte sans modèle ni date : à l'octet près");
  const autre = gta.replace("Jeu testé aujourd’hui, le 2 novembre 2026, et fonctionnel.", "Jeu testé aujourd’hui, le 20 septembre 2026, et fonctionne parfaitement.");
  const r2 = servir(autre, "vinted", "2026-11-13");
  ok(r2 && r2.texte === autre, "une phrase qui ne suit pas son modèle (« … fonctionne parfaitement. ») : pas touchée");
  ok(P?.lireDateTest?.("samedi 10 octobre 2026") === "2026-10-10" && P?.lireDateTest?.("1er novembre 2026") === "2026-11-01", "dates lues : jour de semaine et « 1er » compris");
  ok(P?.aujourdhuiParis?.(new Date("2026-11-12T23:30:00Z")) === "2026-11-13", "le jour se lit à Paris (00:30 le 13/11 = 13/11)");
}

console.log("6. Le service et la réparation");
{
  const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
  ok(/rendreDescriptionAuService\(j\.description as string, \{/.test(gpj) && /select\("id, teste:attributs->teste_le"\)/.test(gpj), "get-pending-jobs écrit la phrase au service, avec la date de la fiche (attributs.teste_le)");
  ok(/j\.phrase_de_test = \{ phrase: r\.phrase, date: r\.date, omise: r\.omise, motifs: motifsDuCompte \}/.test(gpj), "la phrase du jour et les motifs de son modèle sont servis à la recréation Vinted (extension 0.6.187)");
  {
    // Ce que l'extension fera du texte capturé (recréation Vinted) : la première phrase du modèle → la phrase du jour.
    const motifs = P?.motifsDePhraseDeTest?.(lues?.modeleTest) ?? [];
    let premier = true;
    const uneFois = motifs.length ? new RegExp(motifs.map((m) => `(?:${m})`).join("|"), "giu") : null;
    const capture = uneFois ? gta.replace(uneFois, () => { const r = premier ? "Jeu testé le 2 novembre 2026 et fonctionnel." : ""; premier = false; return r; }).replace(/\n{3,}/g, "\n\n") : gta;
    ok(motifs.length === 3 && capture === gta.replace("Jeu testé aujourd’hui, le 2 novembre 2026, et fonctionnel.", "Jeu testé le 2 novembre 2026 et fonctionnel."),
      "les motifs servis remettent au jour la phrase du texte capturé", capture.slice(-250));
  }
  const rep = lire("scripts/reparations/20261113_de63ca45_date_de_test.sql");
  const inv = lire("scripts/reparations/20261113_de63ca45_date_de_test_INVERSE.sql");
  const pre = lire("scripts/reparations/20261113_de63ca45_date_de_test_PREUVE.sql");
  ok(/CREATE TABLE public\._backup_1113_de63ca45_date_de_test/.test(rep) && /script déjà passé/.test(rep) && /i\.description = b\.description_avant/.test(rep)
    && /'teste_le', jsonb_build_object\(/.test(rep) && /NON EXÉCUTÉE/.test(rep), "réparation : sauvegarde, garde (déjà passé, texte inchangé), date posée à part, non exécutée");
  ok(/session_replication_role = replica/.test(inv) && /i\.description = b\.description_apres/.test(inv), "inverse : rend le texte et retire la date, seulement sur une fiche intacte");
  ok(/--read-only/.test(pre) && !/\b(UPDATE|INSERT|DELETE|CREATE)\b/.test(pre.replace(/^--.*$/gm, "")), "preuve : lecture seule");
}

console.log(`\n${n - ko}/${n} verts${ko ? `, ${ko} rouge(s)` : ""}`);
if (ko) process.exit(1);
