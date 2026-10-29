// Selftest — (29/10, lot C partie 1) RÉCUPÉRATION DE LA DESCRIPTION D'ORIGINE : ZÉRO FRICTION.
//
//     npm run selftest:recuperation-description
//
// Les règles pures de l'écran (attenteLectureRegles.js) et leur câblage (StockTab, AttenteLectureOrigine, lectureOrigine,
// migration 20261030090000). Ce qui est prouvé :
//   · l'étape vraie d'après la demande que l'extension tient à jour (envoyée, prise, occupée, échec, conclue, lue) ;
//   · un échec → ses issues TOUT DE SUITE (réessayer d'abord quand il a un sens) ; une conclusion → écrire / faire
//     rédiger ; une attente sans échec → aucune issue avant 45 s, en discret ensuite ;
//   · un échec d'une demande PRÉCÉDENTE (avant « Réessayer ») ne s'affiche plus ;
//   · l'écran s'ouvre au clic (la règle d'abord), « Réessayer » relance, chaque écran laisse sa mesure.
import { readFileSync } from "node:fs";
import {
  etatDeLaDemande, phraseEtatDemande, issuesDeLEtat, travailDuPoste, messageEchecLecture, ISSUES_EN_ATTENTE_APRES_MS,
} from "../src/publication/attenteLectureRegles.js";

let verts = 0, rouges = 0;
const ok = (c, m, d = "") => { if (c) { verts++; console.log(`  ok   ${m}`); } else { rouges++; console.log(`  RATÉ ${m}${d ? `  ← ${d}` : ""}`); } };
const lire = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const T = "2026-10-29T10:00:00.000Z";
const apres = (s) => new Date(Date.parse(T) + s * 1000).toISOString();

console.log("1. L'étape vraie, d'après la demande");
ok(etatDeLaDemande(null).etat === "envoyee", "aucune demande lue : « envoyée »");
ok(etatDeLaDemande({ demandee_le: T }).etat === "envoyee", "demande posée, rien d'autre : « envoyée »");
ok(etatDeLaDemande({ demandee_le: T, prise_le: apres(4) }).etat === "prise", "l'ordinateur a commencé : « prise »");
ok(etatDeLaDemande({ demandee_le: apres(10), prise_le: T }).etat === "envoyee", "une prise d'une demande PRÉCÉDENTE ne compte pas");
ok(etatDeLaDemande({ demandee_le: T, faite_le: apres(9) }).etat === "lue", "faite sans motif : « lue » (le stepper s'ouvre)");
const ech = etatDeLaDemande({ demandee_le: T, prise_le: apres(3), essai_le: apres(23), motif: "onglet_indisponible" });
ok(ech.etat === "echec" && ech.motif === "onglet_indisponible" && ech.reessayable, "échec écrit après la demande : « échec », réessayable");
ok(etatDeLaDemande({ demandee_le: apres(60), essai_le: apres(23), motif: "page_sans_annonce" }).etat === "envoyee", "« Réessayer » : l'échec d'avant la nouvelle demande ne s'affiche plus");
const ar = etatDeLaDemande({ demandee_le: T, essai_le: apres(2), motif: "antirobot_pause" });
ok(ar.etat === "echec" && ar.reessayable === false, "anti-robot : échec NON réessayable (les lectures sont en pause)");
ok(etatDeLaDemande({ demandee_le: T, faite_le: apres(5), motif: "introuvable" }).etat === "conclue", "annonce supprimée : « conclue introuvable »");
ok(etatDeLaDemande({ demandee_le: T, faite_le: apres(5), motif: "sans_texte" }).motif === "sans_texte", "annonce sans texte : « conclue sans_texte »");
ok(etatDeLaDemande(null, { note: "vinted_echec", motif: "antirobot" }).etat === "echec", "lecture faite ICI (même ordinateur) : son échec compte tout de suite");
ok(etatDeLaDemande(null, { note: "vinted_echec", motif: null, occupee: true }).etat === "occupee", "extension d'ici occupée (sans réponse en 12 s) : « occupée », jamais une erreur");
ok(etatDeLaDemande(null, { note: "sans_description" }).motif === "sans_texte", "lue ici sans texte : « conclue sans_texte »");
ok(etatDeLaDemande(null, { note: "vinted_echec", motif: "introuvable" }).motif === "introuvable", "lue ici, annonce supprimée : « conclue introuvable »");

console.log("2. Les issues : tout de suite sur un échec, jamais un écran figé");
ok(issuesDeLEtat(ech).map((x) => x.cle).join() === "reessayer,ecrire,rediger" && issuesDeLEtat(ech)[0].principal, "échec réessayable : Réessayer (principal), Écrire, Faire rédiger — dès l'échec");
ok(issuesDeLEtat(ar).map((x) => x.cle).join() === "ecrire,rediger", "anti-robot : écrire / faire rédiger (réessayer n'aurait pas de sens)");
ok(issuesDeLEtat({ etat: "conclue", motif: "introuvable" }).map((x) => x.cle).join() === "ecrire,rediger", "annonce supprimée : écrire / faire rédiger");
ok(issuesDeLEtat({ etat: "envoyee" }, 10_000).length === 0, "lecture qui avance (10 s) : aucune issue, l'étape seule");
ok(issuesDeLEtat({ etat: "prise" }, ISSUES_EN_ATTENTE_APRES_MS).every((x) => x.discret) && issuesDeLEtat({ etat: "prise" }, ISSUES_EN_ATTENTE_APRES_MS).length === 2, "après 45 s sans lecture : écrire / faire rédiger en discret");
ok(issuesDeLEtat({ etat: "lue" }, 999_999).length === 0, "lue : aucune issue, le stepper s'ouvre");

console.log("3. Les phrases : un fait, jamais une heure promise");
ok(/il la lit dès qu'il la reçoit/.test(phraseEtatDemande({ etat: "envoyee" }, { lecteur: { ou: "poste", version: "0.6.159" } })), "demande envoyée : la condition, jamais une durée promise (règle du 16/10)");
ok(/qui publie en ce moment : ta lecture passe en premier/.test(phraseEtatDemande({ etat: "envoyee" }, { lecteur: { ou: "poste" }, travail: { quoi: "publication" } })), "ordinateur occupé (battement) : il le dit, et que la lecture passe en premier");
ok(/n'existe plus \(vendue ou supprimée\)/.test(phraseEtatDemande({ etat: "conclue", motif: "introuvable" })), "supprimée : dite comme telle");
ok(/pas pu ouvrir Vinted/.test(messageEchecLecture("onglet_indisponible")) && /vérification/.test(messageEchecLecture("antirobot")), "chaque motif en clair");
ok(!/\d{1,2}:\d{2}/.test(phraseEtatDemande({ etat: "prise" }, { lecteur: { ou: "poste" } })), "jamais une heure promise");
const now = Date.parse(T);
ok(travailDuPoste({ a: { travail: { flux: "sync-dressing", le: apres(-60) } } }, now)?.quoi === "synchro", "le travail du poste vu il y a 1 min : « synchro »");
ok(travailDuPoste({ a: { travail: { flux: "poll", le: apres(-600) } } }, now) === null, "un battement de plus de 6 min ne dit plus rien");

console.log("4. Câblage");
const stock = lire("src/tabs/StockTab.jsx");
const ix = stock.indexOf("ZÉRO FRICTION : L'ÉCRAN DE RÉCUPÉRATION S'OUVRE AU CLIC");
const avantLecture = stock.indexOf("r = await completerTexteDuVendeur(item, {", ix);
ok(ix > 0 && avantLecture > ix && stock.slice(ix, avantLecture).includes("setAttenteStepper({ item, attente: attenteVite });"), "Stock : la règle d'abord, l'écran au clic — AVANT toute lecture de 12 s");
ok(/if \(!attenteVite\.conclusion\) demanderLectureOrigine\(supabase, item\.id\);/.test(stock), "Stock : une conclusion ne redemande rien");
const e = lire("src/publication/AttenteLectureOrigine.jsx");
ok(/demanderLectureOrigine\(supabase, item\?\.id, \{ relancer: true \}\)/.test(e) && /setRelance\(\(n\) => n \+ 1\)/.test(e), "« Réessayer » relance la demande (p_relancer) et la relecture");
ok(/\(extensionVinted \|\| tours === 1\) && !enLecture\.current && !echecIci\.current/.test(e), "le premier tour lit toujours (relevé, capture, eBay) ; un échec d'ici arrête la lecture d'ici jusqu'à « Réessayer »");
ok(/mesurerRef\.current\?\.\("lue"\)/.test(e) && /mesurer\("abandon"\)/.test(e) && /mesurer\("redigee"\)/.test(e) && /mesurer\("ecrite"\)/.test(e), "chaque écran laisse sa mesure : lue, écrite, rédigée, abandon");
const lo = lire("src/publication/lectureOrigine.js");
ok(/feature: "recuperation_description"/.test(lo), "la mesure va dans usage_logs « recuperation_description »");
ok(/select\("demandee_le, prise_le, essai_le, motif, faite_le"\)/.test(lo) && /select\("faite_le"\)/.test(lo), "la demande est relue en entier (avant la migration : la date de fin seule, comme avant)");
const mig = lire("supabase/migrations/20261030090000_lecture_origine_suivie.sql");
ok(/p_relancer boolean default false/.test(mig) && /lecture_origine_essai/.test(mig) && /lecture_origine_conclure/.test(mig) && /lecture_origine_signal/.test(mig), "migration : relance, essai, conclusion, signal");
ok(/revoke all on function public\.lecture_origine_signal\(\) from public, anon;/.test(mig), "migration : jamais exécutable par anon");

console.log(rouges ? `\n✗ recuperation-description : ${rouges} rouge(s), ${verts} verts` : `\n✓ recuperation-description : ${verts} contrôles verts, 0 rouges`);
process.exit(rouges ? 1 : 0);
