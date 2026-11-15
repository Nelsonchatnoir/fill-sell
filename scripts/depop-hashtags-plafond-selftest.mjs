// selftest:depop-hashtags-plafond — VERROU du 15/11/2026 (sebastien64310, compte 48dd94f7, Business).
//
// Le cas : publication Depop « Jupe plissée vintage 90s » (job 950ee139, 15/11 16:13) arrêtée en needs_user, source
// « relancer » : « Trop de hashtags pour Depop (13, 5 au plus). » — le pré-vol du connecteur (content-scripts/depop.js)
// refuse plus de 5 hashtags et la description servie portait les 13 de la copie Vinted. Les autres plateformes du même
// article étaient parties. La règle (_shared/description-depop.ts, appliquée par get-pending-jobs au texte SERVI) : les 5
// plus spécifiques restent, le reste du texte ne bouge pas, l'article n'est jamais bloqué pour ça. Et toute plateforme à
// plafond de hashtags (capacites-texte.js) est plafonnée au même endroit (Leboncoin : depuis le 10/09).
// Rouge sur le code d'avant (module absent, gpj sans plafond Depop), vert après.
//
//   node scripts/depop-hashtags-plafond-selftest.mjs
import { readFileSync } from "node:fs";

let echecs = 0, n = 0;
const ok = (c, m, extra = "") => { n++; if (c) console.log(`  ✓ ${m}`); else { echecs++; console.error(`  ✗ ${m}${extra ? ` — ${extra}` : ""}`); } };
const lire = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// Le pré-vol RÉEL du connecteur Depop, relu dans son source (le compte et le plafond, mot pour mot).
const depopJs = lire("chrome-extension/content-scripts/depop.js");
const reConnecteur = depopJs.match(/function depopCompterHashtags\(texte\) \{ return \(String\(texte \?\? ""\)\.match\((\/[^/]+\/g)\) \?\? \[\]\)\.length; \}/);
const maxConnecteur = Number(depopJs.match(/const DEPOP_HASHTAGS_MAX = (\d+);/)?.[1]);
ok(!!reConnecteur && maxConnecteur === 5, "le pré-vol du connecteur est relu (compte /#[a-zA-Z0-9_]+/g, plafond 5)", String(reConnecteur?.[1]));
const reLu = reConnecteur ? new RegExp(reConnecteur[1].slice(1, reConnecteur[1].lastIndexOf("/")), "g") : /#[a-zA-Z0-9_]+/g;
const compteConnecteur = (t) => (String(t ?? "").match(reLu) ?? []).length;
const preVolHashtags = (t) => compteConnecteur(t) <= maxConnecteur;

// La description RÉELLE du job 950ee139 (relue en base le 15/11 à 19:43).
const TITRE = "Jupe plissée vintage 90s Betty Barclay - Imprimé Léopard & Baroque - Taille 42 (FR)";
const DESC = "Superbe jupe plissée fluide de la marque allemande Betty Barclay, datant du début des années 1990.\n🐆 Design & Style : Un design audacieux qui rappelle l'esthétique haute couture italienne de l'époque (dans le style Gianni Versace), associant un corps à imprimé léopard (animalier) et une riche frise baroque dorée à motif de feuilles d'acanthe sur le bas.\n⚙️ Confort : Montage à plis pleins d'inspiration accordéon avec taille élastique pour un confort optimal.\n🎨 Couleurs : Noir, marron, beige et doré\n📏 Taille : 40 (taille internationale / allemande) / 42 (FR)\n🧵 Matière : Voile léger 100 % polyester (style chiffon) avec doublure intérieure en acétate.\n🏷️ Marque : Betty Barclay\n📦 État : Très bon état vintage\n\n\n\n#bettybarclay #jupeplissee #jupevintage #90s #vintage90s #leopard #baroque #versaceinspired #imprimeanimal #retro #chic #modefemme #taille42";

ok(!preVolHashtags(DESC) && compteConnecteur(DESC) === 13, "décor : le texte du job est refusé par le pré-vol (13 hashtags)");

let D = null;
try { D = await import("../supabase/functions/_shared/description-depop.ts"); } catch (e) { ok(false, "le module _shared/description-depop.ts existe", String(e?.message ?? e)); }

if (D) {
  console.log("▸ 13 hashtags → 5, envoi accepté");
  const r = D.plafonnerHashtagsDepop(DESC, { titre: TITRE, marque: "Betty Barclay" });
  ok(r.modifie && r.avant === 13 && r.apres === 5, "13 → 5", JSON.stringify({ avant: r.avant, apres: r.apres }));
  ok(preVolHashtags(r.texte) && compteConnecteur(r.texte) === 5, "le pré-vol du connecteur l'ACCEPTE (5 hashtags)");
  ok(r.texte.length <= 1000 || DESC.length > 1000, "la longueur ne bouge que par les hashtags retirés");
  const garde = r.texte.match(/#[\p{L}\p{N}_]+/gu);
  ok(JSON.stringify(garde) === JSON.stringify(["#bettybarclay", "#jupeplissee", "#90s", "#leopard", "#baroque"]),
    "les plus spécifiques restent : la marque, puis les mots du titre, dans l'ordre d'écriture", garde?.join(" "));
  ok(!/#chic\b/.test(r.texte) && !/#modefemme/.test(r.texte), "les génériques partent d'abord");
  const lignesAvant = DESC.split("\n"), lignesApres = r.texte.split("\n");
  ok(lignesAvant.length === lignesApres.length && lignesAvant.slice(0, -1).every((l, i) => l === lignesApres[i]),
    "le reste du texte ne bouge pas d'un octet (émojis, lignes vides, ponctuation)");
  ok(lignesApres.at(-1) === "#bettybarclay #jupeplissee #90s #leopard #baroque", "la ligne de hashtags garde ses 5, un espace entre chacun", lignesApres.at(-1));

  console.log("▸ bornes");
  const cinq = "Robe #a #b #c #d #e";
  ok(D.plafonnerHashtagsDepop(cinq).texte === cinq && !D.plafonnerHashtagsDepop(cinq).modifie, "5 ou moins : texte identique");
  ok(D.plafonnerHashtagsDepop("").texte === "" && D.plafonnerHashtagsDepop(null).texte === "", "vide : vide");
  const ent = "Console tr&#232;s soign&#233;e, &#224; voir. #a #b #c #d #e #f";
  const re = D.plafonnerHashtagsDepop(ent);
  ok(re.texte.includes("tr&#232;s soign&#233;e, &#224; voir.") && re.apres === 5, "une entité HTML n'est jamais un hashtag : jamais coupée", re.texte);
  const rep = D.plafonnerHashtagsDepop("#nike pull #nike #a #b #c #d #e");
  ok(rep.apres === 5 && rep.repetes === 1 && rep.texte.startsWith("#nike pull #a"), "une répétition part, la première écriture reste", rep.texte);
  const milieu = D.plafonnerHashtagsDepop("Pull #a, très doux #b #c #d #e #f #g.\nFin.", { titre: "Pull" });
  ok(milieu.apres === 5 && /\nFin\.$/.test(milieu.texte) && !/  /.test(milieu.texte), "hashtags au fil du texte : seuls eux partent, sans double espace", milieu.texte);
  const acc = D.plafonnerHashtagsDepop("#été #plissée #robe #a #b #c #d");
  ok(acc.apres === 5 && compteConnecteur(acc.texte) <= 5, "accents : compté LARGE, le connecteur compte ≤ 5", acc.texte);
  ok(D.plafonnerHashtagsDepop(r.texte, { titre: TITRE, marque: "Betty Barclay" }).texte === r.texte, "idempotent");
  ok(D.hashtagsComptesParDepop(DESC) === 13, "hashtagsComptesParDepop = le compte du connecteur");

  console.log("▸ câblage : get-pending-jobs sert le texte plafonné (PC et Cloud, toutes versions)");
  const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
  ok(/import \{ plafonnerHashtagsDepop \} from "\.\.\/_shared\/description-depop\.ts";/.test(gpj), "gpj importe la règle");
  const i0 = gpj.indexOf("DEPOP : 5 HASHTAGS AU PLUS DANS LE TEXTE SERVI");
  const bloc = i0 > 0 ? gpj.slice(i0, gpj.indexOf("} catch (e) {", i0)) : "";
  ok(/j\.platform !== "depop" \|\| \(j\.action !== "publish" && j\.action !== "republish"\)/.test(bloc), "publications ET republications Depop");
  ok(/j\.description = r\.texte;/.test(bloc) && !/\.update\(/.test(bloc), "le texte SERVI seulement (aucune écriture en base, comme Leboncoin)");
  ok(i0 > 0 && i0 < gpj.indexOf("return json({\n      jobs: out,"), "avant la réponse");
}

console.log("▸ les autres plateformes à plafond de hashtags");
const { CAPACITES_TEXTE } = await import("../supabase/functions/_shared/capacites-texte.js");
const plafonnees = Object.entries(CAPACITES_TEXTE)
  .map(([p, sites]) => [p, sites["*"]?.description?.hashtagsMaxPlateforme])
  .filter(([, m]) => Number.isFinite(m));
ok(JSON.stringify(plafonnees.map(([p]) => p).sort()) === JSON.stringify(["depop", "leboncoin"]), "plafond connu : Leboncoin et Depop seulement (Vinted sans limite ; Beebs, eBay, Opla aucune)", JSON.stringify(plafonnees));
const gpjT = lire("supabase/functions/get-pending-jobs/index.ts");
const CABLAGE = { leboncoin: /const r = nettoyerDescriptionLeboncoin\(j\.description,/, depop: /const r = plafonnerHashtagsDepop\(j\.description,/ };
for (const [p, m] of plafonnees) ok(CABLAGE[p]?.test(gpjT), `${p} (${m} au plus) : plafonné par le serveur dans le texte servi`);
const { nettoyerDescriptionLeboncoin, hashtagsARetirer } = await import("../supabase/functions/_shared/description-leboncoin.ts");
const lbc = nettoyerDescriptionLeboncoin(DESC, { titre: TITRE, marque: "Betty Barclay" });
ok((lbc.texte.match(/#[^\s#]+/g) ?? []).length <= 5, "Leboncoin : le même texte part avec 5 hashtags au plus (règle du 10/09, inchangée)");
if (D) {
  // Le classement Depop est RECOPIÉ de Leboncoin (fichier verrouillé par son empreinte) : il doit rendre les mêmes.
  const cas = [
    [DESC, { titre: TITRE, marque: "Betty Barclay" }],
    ["#TommyJeans #SweatHomme #TailleM #Streetwear #Vintage #Mode #PullHomme #BleuMarine #ootd", { titre: "Sweat Tommy Jeans bleu marine – Taille M", marque: "Tommy Jeans" }],
    ["#a #b #c #d #e #f #g", {}],
    ["#ModeFemme #Chic #RobeLongue #Zara #EteChic #Soiree", { titre: "Robe longue Zara", marque: "Zara" }],
  ];
  for (const [texte, ctx] of cas) {
    const distincts = [...new Set(texte.match(/#[^\s#]+/g) ?? [])];
    const lbcPart = [...hashtagsARetirer(texte, ctx).plafonnes].sort();
    const depopPart = D.hashtagsAuDelaDuPlafond(distincts, 5, ctx).sort();
    ok(JSON.stringify(lbcPart) === JSON.stringify(depopPart), `même classement que Leboncoin (${distincts.length} hashtags)`, `${lbcPart} ≠ ${depopPart}`);
  }
}

console.log(echecs ? `\n✗ ${echecs} échec(s) sur ${n}` : `\n✓ ${n} vérifications`);
process.exit(echecs ? 1 : 0);
