// ═══════════════════════════════════════════════════════════════════════════
// LA BARRE DE PROGRESSION — preuve du moteur (01/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// src/utils/progression.js, rejoué sur des déroulés simulés au dixième de
// seconde, avec le même lissage que le composant :
//   · premier mouvement VISIBLE dans la seconde ;
//   · jamais de recul, jamais 100 % avant la vraie fin ;
//   · une étape qui traîne : la barre avance encore, de plus en plus
//     lentement, sans jamais atteindre la fin de sa plage ;
//   · une étape qui arrive : pas de saut (continuité) ;
//   · échec : la barre s'arrête là où elle est ;
//   · plusieurs plateformes : jamais « terminé » si l'une a échoué.
import {
  PLAFOND, courbe, plagesDe, plageFraction, plageAncree, valeurDansPlage, attenteLongue,
  lisser, etatGlobal, moyenne, pourcentageEcrit,
} from "../src/utils/progression.js";

let echecs = 0;
const ok = (cond, titre, detail = "") => {
  if (cond) { console.log(`  ✓ ${titre}`); return; }
  echecs++;
  console.error(`  ✗ ${titre}${detail ? `\n      ${detail}` : ""}`);
};

// Simulateur : mêmes gestes que le composant (ancre au changement d'étape,
// départ = valeur visée du moment, lissage, jamais de recul).
function derouler({ etapes, evenements, fin, pas = 100 }) {
  const plages = plagesDe(etapes);
  let index = -1, debut = 0, depart = 0, visee = 0, affichee = 0, etat = "en_cours", plage = null;
  const releve = [];
  const evts = [...evenements].sort((a, b) => a.t - b.t);
  for (let t = 0; t <= fin; t += pas) {
    while (evts.length && evts[0].t <= t) {
      const e = evts.shift();
      if (e.etape != null) {
        const i = plages.findIndex((p) => p.cle === e.etape);
        if (i > index) { depart = visee; index = i; debut = t; plage = plageAncree(plages[i], depart); }
      }
      if (e.etat) { etat = e.etat; if (etat === "echec") visee = affichee; }
    }
    if (etat === "en_cours" && index >= 0) {
      visee = Math.max(visee, valeurDansPlage(plage, depart, debut, t));
    } else if (etat === "termine") {
      visee = 100;
    }
    affichee = etat === "echec" ? affichee : Math.max(affichee, lisser(affichee, visee, pas));
    releve.push({ t, visee, affichee, etat, index, longue: index >= 0 && attenteLongue(plage, debut, t) });
  }
  return { releve, plages };
}

console.log("1. LA COURBE D'UNE ÉTAPE");
ok(courbe(0) === 0 && courbe(-1) === 0, "rien avant le départ");
ok(Math.abs(courbe(1) - 0.7) < 1e-9, "70 % de la plage à la durée attendue");
{
  let croissante = true, prev = 0;
  for (let x = 0.01; x < 1000; x *= 1.05) { const c = courbe(x); if (!(c > prev) || c >= 1) croissante = false; prev = c; }
  ok(croissante, "strictement croissante, jamais 100 % de la plage (x jusqu'à 1000)");
}

console.log("2. PLAGES");
{
  const p = plagesDe([{ cle: "a", duree: 2 }, { cle: "b", duree: 6 }, { cle: "c", duree: 2 }]);
  ok(p[0].debut === 0 && Math.abs(p[2].fin - PLAFOND) < 1e-9, "de 0 au plafond (99 %), jamais 100");
  ok(Math.abs((p[1].fin - p[1].debut) - 3 * (p[0].fin - p[0].debut)) < 1e-9, "plage proportionnelle à la durée");
  ok(p.every((x, i) => i === 0 || Math.abs(x.debut - p[i - 1].fin) < 1e-9), "plages jointives");
  const q = plagesDe([{ cle: "a", duree: 2, poids: 1 }, { cle: "b", duree: 2, poids: 3 }]);
  ok(Math.abs(q[1].debut - PLAFOND / 4) < 1e-9, "le poids explicite l'emporte sur la durée");
  ok(plagesDe(null).length === 0 && plagesDe([null, { cle: "x" }]).length === 1, "entrées vides tolérées");
}

const PUBLICATION = [
  { cle: "prep", duree: 1.5 }, { cle: "ouverture", duree: 2.5 }, { cle: "photos", duree: 5 },
  { cle: "fiche", duree: 4 }, { cle: "depot", duree: 2.5 }, { cle: "verif", duree: 2 },
];

console.log("3. UNE PUBLICATION QUI SE DÉROULE");
{
  const { releve } = derouler({
    etapes: PUBLICATION, fin: 20000,
    evenements: [
      { t: 0, etape: "prep" }, { t: 1200, etape: "ouverture" }, { t: 4400, etape: "photos" },
      { t: 10100, etape: "fiche" }, { t: 13500, etape: "depot" }, { t: 16800, etape: "verif" },
      { t: 18600, etat: "termine" },
    ],
  });
  const a = (t) => releve.find((r) => r.t === t);
  ok(a(500).affichee > 1, `mouvement visible à 0,5 s (${a(500).affichee.toFixed(2)} %)`);
  ok(a(1000).affichee > 2, `encore plus à 1 s (${a(1000).affichee.toFixed(2)} %)`);
  ok(releve.every((r, i) => i === 0 || r.affichee >= releve[i - 1].affichee), "jamais de recul");
  ok(releve.filter((r) => r.t < 18600).every((r) => r.affichee <= PLAFOND && pourcentageEcrit(r.affichee, false) < 100), "jamais 100 % avant la vraie fin");
  const sauts = releve.slice(1).map((r, i) => r.affichee - releve[i].affichee);
  ok(Math.max(...sauts) < 3, `aucun à-coup : au plus ${Math.max(...sauts).toFixed(2)} % en 0,1 s`);
  const enCours = releve.filter((r) => r.t > 0 && r.t < 18600);
  ok(enCours.every((r, i) => i === 0 || r.affichee > enCours[i - 1].affichee), "avance à chaque dixième de seconde, sans arrêt");
  ok(a(20000).affichee === 100, "100 % une fois terminé");
}

console.log("4. UNE ÉTAPE QUI TRAÎNE (attente longue)");
{
  const { releve, plages } = derouler({
    etapes: PUBLICATION, fin: 120000,
    evenements: [{ t: 0, etape: "prep" }, { t: 1000, etape: "ouverture" }, { t: 3000, etape: "photos" }],
  });
  const photos = plages[2];
  const traine = releve.filter((r) => r.t >= 3000);
  const borne = photos.fin + (PLAFOND - photos.fin) / 2;
  ok(traine.every((r) => r.visee < borne), `déborde sur la suite, jamais au-delà de la moitié de ce qui reste (${traine.at(-1).affichee.toFixed(1)} % < ${borne.toFixed(1)} % après 2 min)`);
  ok(releve.filter((r) => r.t <= 8000).every((r) => r.visee < photos.fin), "aucun débord tant que l'étape reste dans sa durée attendue");
  ok(traine.every((r, i) => i === 0 || r.affichee > traine[i - 1].affichee), "avance encore à chaque dixième de seconde, deux minutes durant");
  const vitesse = (t0) => (releve.find((r) => r.t === t0 + 1000).affichee - releve.find((r) => r.t === t0).affichee);
  ok(vitesse(4000) > vitesse(10000) && vitesse(10000) > vitesse(30000), "de plus en plus lentement");
  // 3 × la durée attendue (15 s dans l'étape) : ≥ 0,4 %/s ; 8 × (40 s) : encore ≥ 0,15 %/s
  // (≈ 1/2 px/s sur une barre de 340 px — le débord, sans lequel on tombait à 0,03).
  ok(vitesse(18000) >= 0.4, `encore visible à 3 × la durée attendue (${vitesse(18000).toFixed(3)} %/s)`);
  ok(vitesse(43000) >= 0.15, `encore en mouvement à 8 × la durée attendue (${vitesse(43000).toFixed(3)} %/s)`);
  ok(!releve.find((r) => r.t === 10000).longue && releve.find((r) => r.t === 20000).longue, "« ça prend plus longtemps » seulement passé 2,5 × la durée (min. +10 s)");
}

console.log("4 bis. APRÈS UNE LONGUE ATTENTE, LA SUITE A ENCORE DE LA PLACE");
{
  const { releve } = derouler({
    etapes: PUBLICATION, fin: 140000,
    evenements: [{ t: 0, etape: "prep" }, { t: 1000, etape: "ouverture" }, { t: 3000, etape: "photos" },
      { t: 120000, etape: "fiche" }, { t: 124000, etape: "depot" }, { t: 127000, etape: "verif" }, { t: 130000, etat: "termine" }],
  });
  const suite = releve.filter((r) => r.t > 120000 && r.t < 130000);
  ok(suite.every((r, i) => i === 0 || r.affichee > suite[i - 1].affichee), "chaque étape suivante fait encore avancer la barre (rien ne se fige)");
  ok(suite.every((r) => r.affichee < PLAFOND + 1e-9), "toujours sous le plafond");
  ok(releve.at(-1).affichee === 100, "100 % à la vraie fin");
  const p = plageAncree({ debut: 50, fin: 70, duree: 4 }, 60);
  ok(p.debut === 60 && Math.abs(p.fin - (60 + 39 * 20 / 49)) < 1e-9, "plage recalée : repart de la barre, garde sa part de ce qui reste");
  ok(plageAncree({ debut: 50, fin: 70, duree: 4 }, 40).debut === 50, "pas de recalage quand la barre est en deçà");
}

console.log("5. UNE ÉTAPE SAUTÉE (la nouvelle suivante arrive directement)");
{
  const { releve } = derouler({
    etapes: PUBLICATION, fin: 8000,
    evenements: [{ t: 0, etape: "prep" }, { t: 1000, etape: "fiche" }],
  });
  const sauts = releve.slice(1).map((r, i) => r.affichee - releve[i].affichee);
  ok(Math.max(...sauts) <= 3.0001, `la barre rattrape en glissant (au plus ${Math.max(...sauts).toFixed(2)} % en 0,1 s)`);
  ok(releve.every((r, i) => i === 0 || r.affichee >= releve[i - 1].affichee), "jamais de recul");
}

console.log("6. ÉCHEC");
{
  const { releve } = derouler({
    etapes: PUBLICATION, fin: 15000,
    evenements: [{ t: 0, etape: "prep" }, { t: 1200, etape: "ouverture" }, { t: 4000, etape: "photos" }, { t: 9000, etat: "echec" }],
  });
  const apres = releve.filter((r) => r.t >= 9000);
  ok(apres.every((r) => r.affichee === apres[0].affichee), `la barre s'arrête net là où elle est (${apres[0].affichee.toFixed(1)} %)`);
  ok(apres.every((r) => r.affichee < 100), "jamais 100 % sur un échec");
}

console.log("7. AVANCEMENT CONNU (relevé « 12 sur 48 »)");
{
  const comptes = [0, 4, 9, 15, 22, 30, 37, 44, 48];
  let depart = 0, debut = 0, affichee = 0, visee = 0, plage = plageFraction(0, 5 / 48, 1.5);
  let recul = false, depasse = false, i = 0;
  for (let t = 0; t <= 13500; t += 100) {
    if (t % 1500 === 0 && i < comptes.length) {
      depart = visee; debut = t; plage = plageFraction(comptes[i] / 48, 5 / 48, 1.5); i++;
    }
    visee = Math.max(visee, valeurDansPlage(plage, depart, debut, t));
    const n = lisser(affichee, visee, 100);
    if (n < affichee) recul = true;
    affichee = n;
    const vu = comptes[Math.max(0, i - 1)] / 48 * PLAFOND;
    const prochain = (comptes[Math.min(comptes.length - 1, i)] ?? 48) / 48 * PLAFOND;
    if (affichee > Math.max(prochain, vu) + 1e-9) depasse = true;
  }
  ok(!recul, "jamais de recul");
  ok(!depasse, "jamais au-delà du compte suivant attendu");
  ok(affichee < 100, `même à 48 sur 48, pas 100 % avant la fin déclarée (${affichee.toFixed(1)} %)`);
}

console.log("8. PLUSIEURS PLATEFORMES");
ok(etatGlobal(["termine", "termine"]) === "termine", "toutes terminées → terminé");
ok(etatGlobal(["termine", "en_cours", "attente"]) === "en_cours", "une avance → en cours");
ok(etatGlobal(["termine", "echec", "termine"]) === "partiel", "une a échoué, les autres ont réussi → partiel, JAMAIS terminé");
ok(etatGlobal(["echec"]) === "echec", "toutes échouées → échec");
ok(etatGlobal(["termine", "pause"]) === "pause", "plus rien ne bouge, une en pause → pause");
ok(etatGlobal(["echec", "attente"]) === "attente", "une en file derrière un échec → attente, pas encore de verdict");
ok(etatGlobal([]) === "en_cours" && etatGlobal(["inconnu"]) === "en_cours", "rien ou inconnu → en cours");
ok(moyenne([100, 100, 99]) < 100, "trois pistes dont une à 99 % : moyenne < 100");
ok(pourcentageEcrit(99.97, false) === 99 && pourcentageEcrit(42, true) === 100, "99,97 s'écrit 99 ; 100 seulement quand c'est fini");

console.log("");
if (echecs) { console.error(`✗ ${echecs} échec(s)`); process.exit(1); }
console.log("✓ moteur de la barre de progression prouvé");
