// ── AUTOTEST : LA LIMITE DU JOUR EST DITE AU CLIC (05/10, point 11) ─────────
// Décision de Nico : une republication manuelle n'est JAMAIS bloquée par la
// limite quotidienne (le serveur retient et relâche seul le lendemain), mais
// la feuille de republication dit, AVANT le clic, combien partent aujourd'hui
// et que le reste suivra seul (src/utils/plafondRepublication.js).
// Ce qu'il garantit :
//   1. limite pas atteinte → silence ; dépassée en partie → « N partent
//      aujourd'hui, les M autres … » ; atteinte → « dès demain » ;
//   2. ce qui est DÉJÀ en file prend la place avant les nouvelles ;
//   3. Business (limite hors d'atteinte) et état inconnu → silence ;
//   4. accords (1 republication / 2 republications), « demain » seulement si
//      tout tient demain ;
//   5. la feuille reçoit l'état serveur et le nombre en file, et rend la
//      phrase AU-DESSUS du bouton de confirmation.
//
//   node scripts/republication-plafond-message-selftest.mjs
import { readFileSync } from "node:fs";
import { partageRepublicationsDuJour, LIMITE_HORS_D_ATTEINTE, ecoulementFile, phraseLimiteAtteinte } from "../src/utils/plafondRepublication.js";

// Les nombres sont collés à leur mot par une espace insécable (jamais « 5 »
// seul en fin de ligne, relu au harnais à 360 px) : le texte se compare lisible.
const lisible = (t) => String(t ?? "").replace(/\u00a0/g, " ");

let echecs = 0;
const ok = (titre, condition, detail) => {
  if (condition) console.log(`  ok   ${titre}`);
  else { echecs += 1; console.log(`  KO   ${titre}${detail !== undefined ? ` — vu : ${JSON.stringify(detail)}` : ""}`); }
};
const etat = (extra = {}) => ({ limite: 50, faits: 0, palier: "premium", retenue: false, motif: null, ...extra });
const p = (nbEnvois, e, dejaEnFile = 0, lang = "fr") => partageRepublicationsDuJour({ nbEnvois, etat: e, dejaEnFile, lang });

console.log("\n── 1. Limite pas atteinte : silence ───────────────────────────");
ok("10 republications, 0 faites sur 50 → rien à dire", p(10, etat()) === null, p(10, etat()));
ok("pile la limite (50 sur 50 restantes) → rien à dire", p(50, etat()) === null);
ok("20 faites + 30 nouvelles = 50 → rien à dire", p(30, etat({ faits: 20 })) === null);

console.log("\n── 1. Dépassée en partie ─────────────────────────────────────");
{
  const r = p(40, etat({ faits: 30 }));
  ok("30 faites + 40 nouvelles → 20 aujourd'hui, 20 plus tard", r && r.aujourdhui === 20 && r.plusTard === 20, r);
  ok("le surplus tient demain → « demain »", r?.demain === true, r);
  ok("texte exact (17/10 : minuit, heure de Paris)", lisible(r?.texte) === "Ta limite est de 50 republications par jour (toutes plateformes) : 20 partent aujourd'hui, les 20 autres demain, dès minuit (heure de Paris). Elles partent toutes seules, rien n'est perdu.", r?.texte);
}
{
  const r = p(2, etat({ faits: 49 }));
  ok("1 place restante, 2 nouvelles → 1 part, l'autre suit", r && r.aujourdhui === 1 && r.plusTard === 1, r);
  ok("accords au singulier", lisible(r?.texte) === "Ta limite est de 50 republications par jour (toutes plateformes) : 1 part aujourd'hui, l'autre demain, dès minuit (heure de Paris). Elle part toute seule, rien n'est perdu.", r?.texte);
}
{
  const r = p(140, etat({ faits: 0 }));
  ok("140 nouvelles sur 50 par jour → 50 aujourd'hui, 90 plus tard", r && r.aujourdhui === 50 && r.plusTard === 90, r);
  ok("90 ne tiennent pas en un jour → « à partir de minuit, 50 par jour », « environ 3 jours », jamais « demain »",
    r && !r.demain && r.jours === 3 && /à partir de minuit \(heure de Paris\), 50 par jour\. Pour toute ta file, ça prendra environ 3 jours\./.test(lisible(r.texte)) && !/ demain/.test(lisible(r.texte)), r?.texte);
}
{
  // (17/10) Le cas de Nico : 685 lancées d'un coup, Premium (50 par jour), rien fait aujourd'hui.
  const r = p(685, etat());
  ok("685 lancées → « environ 14 jours » dit AVANT le clic", lisible(r?.texte) === "Ta limite est de 50 republications par jour (toutes plateformes) : 50 partent aujourd'hui, les 635 autres à partir de minuit (heure de Paris), 50 par jour. Pour toute ta file, ça prendra environ 14 jours. Elles partent toutes seules, rien n'est perdu.", r?.texte);
}

console.log("\n── 1. Atteinte ───────────────────────────────────────────────");
{
  const r = p(5, etat({ faits: 50, retenue: true, motif: "plafond" }));
  ok("50 faites sur 50 → 0 aujourd'hui, 5 plus tard", r && r.aujourdhui === 0 && r.plusTard === 5, r);
  ok("texte « atteinte … demain, dès minuit »", lisible(r?.texte) === "Ta limite du jour (50 republications, toutes plateformes) est atteinte : ces 5 republications partiront demain, dès minuit (heure de Paris). Elles partent toutes seules, rien n'est perdu.", r?.texte);
}
{
  const r = p(1, etat({ faits: 62 }));
  ok("au-delà de la limite (62/50), 1 nouvelle → singulier", lisible(r?.texte) === "Ta limite du jour (50 republications, toutes plateformes) est atteinte : cette republication partira demain, dès minuit (heure de Paris). Elle part toute seule, rien n'est perdu.", r?.texte);
}
{
  const r = p(80, etat({ faits: 50 }));
  ok("80 de plus, limite atteinte → « à partir de minuit », « environ 2 jours » (pas tout demain)", r && !r.demain && r.jours === 2 && /à partir de minuit/.test(lisible(r.texte)) && /environ 2 jours/.test(lisible(r.texte)), r?.texte);
}

console.log("\n── 2. Ce qui est déjà en file passe avant ─────────────────────");
{
  const r = p(10, etat({ faits: 30 }), 15);
  ok("30 faites + 15 en file + 10 nouvelles → 5 aujourd'hui, 5 plus tard", r && r.aujourdhui === 5 && r.plusTard === 5, r);
}
{
  const r = p(10, etat({ faits: 30 }), 25);
  ok("30 faites + 25 en file → plus de place : 0 aujourd'hui", r && r.aujourdhui === 0 && r.plusTard === 10, r);
  ok("limite pas encore ATTEINTE : on ne le prétend pas, la file la remplit", r && /^Les republications déjà en file remplissent ta limite du jour \(50 republications, toutes plateformes\) : ces 10 republications partiront demain, dès minuit/.test(lisible(r.texte)) && !/atteinte/.test(lisible(r.texte)), r?.texte);
}
{
  const r = p(10, etat({ faits: 0 }), 45);
  ok("45 en file + 10 nouvelles → 5 aujourd'hui", r && r.aujourdhui === 5 && r.plusTard === 5, r);
}
{
  const r = p(30, etat({ faits: 40 }), 40);
  ok("surplus total (file comprise) 60 > 50 → « à partir de demain »", r && r.aujourdhui === 0 && !r.demain, r);
}

console.log("\n── 3. Business et état inconnu : silence ──────────────────────");
ok("Business (palier) → rien", p(500, etat({ palier: "business", limite: 100000, faits: 0 })) === null);
ok("Business même si la file est énorme → rien", p(10, etat({ palier: "business", limite: 100000, faits: 99999 }), 50) === null);
ok(`limite hors d'atteinte (>= ${LIMITE_HORS_D_ATTEINTE}) sans palier lu → rien`, p(500, etat({ palier: null, limite: 100000 })) === null);
ok("état null (panne, pas encore lu) → rien", p(500, null) === null);
ok("état sans limite → rien", p(500, { faits: 3 }) === null);
ok("état sans faits → rien", p(500, { limite: 50 }) === null);
ok("limite 0 (clé mal posée) → rien", p(500, etat({ limite: 0 })) === null);
ok("0 envoi (aucune plateforme cochée) → rien", p(0, etat({ faits: 50 })) === null);

console.log("\n── 4. Anglais ─────────────────────────────────────────────────");
{
  const r = p(40, etat({ faits: 30 }), 0, "en");
  ok("anglais, dépassement partiel", lisible(r?.texte) === "Your limit is 50 reposts a day (all platforms): 20 go out today, the other 20 tomorrow, from midnight (Paris time). They go out on their own, nothing is lost.", r?.texte);
  const r1 = p(1, etat({ faits: 50 }), 0, "en");
  ok("anglais, atteinte, singulier", lisible(r1?.texte) === "Your daily limit (50 reposts, all platforms) is reached: this repost will go out tomorrow, from midnight (Paris time). It goes out on its own, nothing is lost.", r1?.texte);
}

console.log("\n── 5. La feuille de republication ─────────────────────────────");
{
  const src = readFileSync(new URL("../src/tabs/StockTab.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const debut = src.indexOf("function RepublishSheet(");
  const fin = src.indexOf("\n}\n", debut);
  const feuille = src.slice(debut, fin);
  ok("RepublishSheet reçoit plafond et dejaEnFile", /function RepublishSheet\(\{[^}]*plafond = null, dejaEnFile = 0/.test(feuille));
  ok("le partage est calculé sur nbEnvois et l'état serveur", /partageRepublicationsDuJour\(\{ nbEnvois, etat: plafond, dejaEnFile, lang \}\)/.test(feuille));
  const iPhrase = feuille.indexOf("{partageDuJour.texte}");
  const iBouton = feuille.indexOf("<button onClick={confirmer}");
  ok("la phrase est rendue AU-DESSUS du bouton de confirmation", iPhrase > 0 && iBouton > iPhrase);
  ok("le bouton n'est jamais désactivé par la limite (rien n'est bloqué)", /<button onClick=\{confirmer\} disabled=\{!nbEnvois\}/.test(feuille));
  ok("l'appel passe l'état serveur et la file vivante", /plafond=\{repubPlafondEtat\}\s*\n\s*dejaEnFile=\{repubJobsVivants\.length\}/.test(src));
}

console.log("\n── 5. Espaces insécables ──────────────────────────────────────");
{
  const r = partageRepublicationsDuJour({ nbEnvois: 8, etat: { limite: 50, faits: 45, palier: "premium" }, dejaEnFile: 0 });
  ok("nombre et mot collés par une espace insécable : jamais un nombre seul en fin de ligne",
    /5\u00a0partent/.test(r?.texte ?? "") && /3\u00a0autres/.test(r?.texte ?? "") && /50\u00a0republications/.test(r?.texte ?? ""), r?.texte);
}
console.log("\n── 6. (17/10) La durée de toute la file : un calcul sur la limite ──");
{
  const jourParis = (ts) => new Date(ts).toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
  const maintenant = Date.parse("2026-10-17T10:00:00Z");
  const auj = jourParis(maintenant);
  const e1 = ecoulementFile({ etat: etat({ jour: auj }), nouvelles: 685, maintenant });
  ok("685 lancées, 0 faites → 50 aujourd'hui, 13 jours suivants, 14 jours en tout", e1 && e1.aujourdhui === 50 && e1.joursSuivants === 13 && e1.jours === 14, e1);
  const e2 = ecoulementFile({ etat: etat({ jour: auj, faits: 50, retenue: true, motif: "plafond" }), enFile: 685, maintenant });
  ok("50 faites + 685 en file → rien aujourd'hui, 14 jours", e2 && e2.aujourdhui === 0 && e2.joursSuivants === 14 && e2.jours === 14 && e2.atteinte, e2);
  const e3 = ecoulementFile({ etat: etat({ jour: auj, faits: 1 }), nouvelles: 784, maintenant });
  ok("1 faite + 784 lancées → 16 jours", e3 && e3.jours === 16, e3);
  const e4 = ecoulementFile({ etat: etat({ jour: "2026-10-16", faits: 50, retenue: true, motif: "plafond" }), enFile: 33, maintenant });
  ok("état lu la VEILLE (écran resté ouvert passé minuit) → le compteur repart de 0", e4 && e4.faits === 0 && e4.aujourdhui === 33 && !e4.atteinte, e4);
  ok("Business, état null, limite 0, file vide → rien", ecoulementFile({ etat: etat({ palier: "business", limite: 100000 }), enFile: 9 }) === null
    && ecoulementFile({ etat: null, enFile: 9 }) === null && ecoulementFile({ etat: etat({ limite: 0 }), enFile: 9 }) === null
    && ecoulementFile({ etat: etat(), enFile: 0 }) === null);
}

console.log("\n── 7. (17/10) Pendant la retenue : limite atteinte, minuit, durée ──");
{
  const maintenant = Date.parse("2026-10-17T10:00:00Z");
  const auj = new Date(maintenant).toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
  const retenue = etat({ jour: auj, faits: 50, retenue: true, motif: "plafond" });
  const l = (enFile, e = retenue, lang = "fr") => phraseLimiteAtteinte({ etat: e, enFile, lang, maintenant });
  ok("685 en file → « environ 14 jours »", lisible(l(685)) === "Limite du jour atteinte (50 sur 50 republications, toutes plateformes) : les 685 en file repartent à minuit (heure de Paris), 50 par jour : ça prendra environ 14 jours. Rien à faire, rien n'est perdu.", l(685));
  ok("33 en file → demain, dès minuit", lisible(l(33)) === "Limite du jour atteinte (50 sur 50 republications, toutes plateformes) : les 33 en file repartent demain, dès minuit (heure de Paris), toutes seules. Rien à faire, rien n'est perdu.", l(33));
  ok("1 en file → singulier", lisible(l(1)) === "Limite du jour atteinte (50 sur 50 republications, toutes plateformes) : celle en file repart demain, dès minuit (heure de Paris), toute seule. Rien à faire, rien n'est perdu.", l(1));
  ok("anglais", lisible(l(685, retenue, "en")) === "Daily limit reached (50 of 50 reposts, all platforms): the 685 queued resume at midnight (Paris time), 50 a day: it will take about 14 days. Nothing to do, nothing is lost.", l(685, retenue, "en"));
  ok("pause de respiration → rien (elle garde sa phrase)", l(685, etat({ jour: auj, faits: 50, retenue: true, motif: "pause" })) === null);
  ok("pas de retenue → rien", l(685, etat({ jour: auj, faits: 50, retenue: false })) === null);
  ok("état d'hier → rien (le jour a tourné)", l(685, etat({ jour: "2026-10-16", faits: 50, retenue: true, motif: "plafond" })) === null);
  ok("file vide → rien", l(0) === null);
}

console.log("\n── 8. (17/10) Où la phrase s'affiche ──────────────────────────");
{
  const lireSrc = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const stock = lireSrc("../src/tabs/StockTab.jsx");
  ok("carte du haut : la phrase de retenue, et la barre en pause", /phraseLimiteAtteinte\(\{etat:repubPlafondEtat,enFile:repubJobsVivants\.length,lang\}\)/.test(stock)
    && /etat=\{activite\.hbMuet\|\|phraseLimite\?'pause':'en_cours'\}/.test(stock) && /\{phraseLimite&&\(/.test(stock));
  ok("ligne de la liste : TOUTE la file (repubJobsVivants), plus le dernier lot seul", /const restantes=repubJobsVivants\.length;/.test(stock) && !/const restantes=repubBandeau\.file\.length/.test(stock));
  const file = lireSrc("../src/components/FileDesJobs.jsx");
  const iPhrase = file.indexOf("{limiteDuJour && (");
  ok("« Ta file » : la phrase en tête, avant les sections", iPhrase > 0 && iPhrase < file.indexOf("{sections.map((s) => ("), iPhrase);
  const fdj = lireSrc("../src/utils/fileDesJobs.js");
  ok("chaque job : « la file repart à minuit (heure de Paris), celle-ci à son tour », jamais l'heure du job", /limite_jour: "En pause \(limite du jour atteinte\) : la file repart à minuit \(heure de Paris\), celle-ci à son tour", \/\/ estimation-ok:/.test(fdj));
  const util = lireSrc("../src/utils/plafondRepublication.js");
  const lignesTexte = util.split("\n").filter((ln) => /minuit|midnight|environ|about \$\{/.test(ln) && !/^\s*(\/\/|\*)/.test(ln));
  ok("chaque ligne de texte qui dit minuit ou une durée porte le marqueur estimation-ok:", lignesTexte.length >= 4 && lignesTexte.every((ln) => /estimation-ok:/.test(ln)), lignesTexte.filter((ln) => !/estimation-ok:/.test(ln)));
  // (17/10, nerema75) La trace de retenue périmée se lève côté serveur : bornée, sur pending, hors retenue.
  const gpj = lireSrc("../supabase/functions/get-pending-jobs/index.ts");
  const iLevee = gpj.indexOf("UNE TRACE DE RETENUE PÉRIMÉE SE LÈVE");
  const bloc = iLevee > 0 ? gpj.slice(iLevee, iLevee + 2600) : "";
  ok("get-pending-jobs lève la trace périmée : hors retenue, reprise passée, 40 au plus, écriture conditionnelle sur pending, copie servie nettoyée",
    /plafondRepublish\?\.retenue !== true/.test(bloc) && /reprise <= maintenantMs/.test(bloc) && /\.slice\(0, 40\)/.test(bloc)
    && /delete pf\["retenue_republication"\]/.test(bloc) && /\.eq\("id", j\.id\)\.eq\("status", "pending"\)/.test(bloc)
    && /\.platform_fields = pf/.test(bloc));
}

console.log(echecs ? `\n${echecs} échec(s)` : "\nTout est vert.");
process.exit(echecs ? 1 : 0);

