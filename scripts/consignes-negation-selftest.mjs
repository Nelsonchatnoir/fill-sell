// VERROU (13/11/2026, lot « zéro problème », point 5a de Nico) : LES CONSIGNES SONT LUES, NÉGATION COMPRISE.
//
//     npm run selftest:consignes-negation
//
// Compte de63ca45 : sa case « À éviter » finit par « Ne jamais supprimer les emojis du modèle. ». L'ancienne lecture
// (consigneSansEmoji) cherchait le MOT « emoji » dans la case et concluait « pas d'émojis » : 7 propositions sur 7 du
// 02/11 ont perdu tous leurs émojis, 📍 et 🚚 de ses phrases finales compris (« ␠Remise en main propre possible. »).
// Décision de Nico : pas de cases à cocher — les consignes font foi, BIEN LUES. Ce verrou :
//   1. lit SES consignes réelles (fixture, lecture seule du 13/11) : émojis GARDÉS, hashtags retirés ;
//   2. une série de formulations, négations et doubles négations comprises, dans « À éviter » et ailleurs ;
//   3. le texte rédigé garde ses émojis (le vrai module de composition des descriptions).
// FILLSELL_RACINE=<dossier> : le code mis à l'épreuve est celui de ce dossier (mesure « rouge avant »).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = process.env.FILLSELL_RACINE ? path.resolve(process.env.FILLSELL_RACINE) : path.resolve(ICI, "..");
const imp = async (p) => { try { return await import(pathToFileURL(path.join(RACINE, p)).href); } catch { return null; } };
let ko = 0, n = 0;
const ok = (c, m, d) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d === undefined ? "" : `\n      ← ${JSON.stringify(d).slice(0, 400)}`}`); } };

const C = await imp("src/utils/consignesRedaction.js");
const B = await imp("src/utils/blocsDescription.js");
const fx = JSON.parse(fs.readFileSync(path.join(ICI, "fixtures/redaction-de63ca45/sept-fiches.json"), "utf8"));

console.log("1. Ses consignes réelles (compte de63ca45)");
ok(C && C.consigneSansEmoji(fx.consignes) === false, "« Ne jamais supprimer les emojis du modèle » : les émojis ne sont PAS retirés");
ok(C && C.consigneSansHashtag(fx.consignes) === true, "« Éviter … hashtags » : les hashtags sont retirés");
const lues = C?.lireConsignes?.(fx.consignes);
ok(lues?.emojis === "garder" && lues?.hashtags === "retirer", "lireConsignes : émojis « garder », hashtags « retirer »", lues && { emojis: lues.emojis, hashtags: lues.hashtags });

console.log("2. Les formulations (négation, double négation, verbe de la phrase, case « À éviter »)");
const CAS = [
  // [case, texte, émojis attendus retirés ?, hashtags attendus retirés ?]
  ["eviter", "Ne jamais supprimer les emojis du modèle.", false, false],
  ["eviter", "Pas de hashtags, pas d’émojis.", true, true],
  ["eviter", "hashtags", false, true],
  ["eviter", "Évite les smileys.", true, false],
  ["eviter", "N’utilise pas d’emoji.", true, false],
  ["eviter", "Garde les émojis.", false, false],
  ["eviter", "Ne garde pas les émojis.", true, false],
  ["eviter", "Ne pas mettre d’émojis ni de hashtags.", true, true],
  ["eviter", "Ne pas confondre notice, guide, livret et feuillet.", false, false],
  ["eviter", "Pas d’émojis. Garde les émojis du modèle.", false, false], // contradiction : le doute ne retire rien
  ["description", "Une ligne d’état par élément ; supprimer les lignes inutiles, jamais les emojis.", false, false],
  ["description", "FORMAT IMPÉRATIF : reproduire les emojis EXACTS ci-dessous.", false, false],
  ["description", "Sans émojis, sans hashtags.", true, true],
  ["toujours", "Finir EXACTEMENT, emojis et lignes vides : Vendu comme sur les photos.", false, false],
];
for (const [cle, texte, sansEmoji, sansHashtag] of CAS) {
  const c = { [cle]: texte };
  ok(C && C.consigneSansEmoji(c) === sansEmoji && C.consigneSansHashtag(c) === sansHashtag,
    `${cle} « ${texte} » → émojis ${sansEmoji ? "retirés" : "gardés"}, hashtags ${sansHashtag ? "retirés" : "gardés"}`,
    C && { emojis: C.consigneSansEmoji(c), hashtags: C.consigneSansHashtag(c) });
}
ok(C && /négations comprises/.test(C.directiveConsignes(fx.consignes)) && C.directiveConsignes(fx.consignes).startsWith("CONSIGNES DU VENDEUR"),
  "le prompt dit au modèle de lire les négations (« ne jamais supprimer les émojis » = les garder)");

console.log("3. Le texte rédigé garde ses émojis (composition réelle des descriptions)");
{
  const publie = fx.fiches.find((f) => f.inventaire_id === "1793616052050").texte_publie; // son texte du 02/11, émojis compris
  const r = B?.rendreDescriptionGeneree?.(publie, "vinted", { consignes: fx.consignes });
  const pictos = (s) => (String(s ?? "").match(/\p{Extended_Pictographic}/gu) ?? []).length;
  ok(r && pictos(r.texte) === pictos(publie) && pictos(publie) >= 8, `aucun émoji retiré (${pictos(publie)} dans le texte du modèle)`, r && { avant: pictos(publie), apres: pictos(r.texte) });
  ok(r && /📍 Remise en main propre possible\./.test(r.texte) && /🚚 Expédition rapide et soignée/.test(r.texte), "📍 et 🚚 de ses phrases finales sont là");
  const sansCase = B?.rendreDescriptionGeneree?.("Joli jeu 🎮 #ps4 #jeu", "vinted", { consignes: { eviter: "Pas de hashtags, pas d’émojis." } });
  ok(sansCase && !/#|🎮/.test(sansCase.texte), "« Pas de hashtags, pas d'émojis » : émojis et hashtags retirés", sansCase?.texte);
}

console.log("4. Le code");
{
  const red = fs.readFileSync(path.join(RACINE, "supabase/functions/_shared/redaction-plateformes.ts"), "utf8");
  ok(!/consigneSansEmoji\(consignes\)/.test(red) && /lireConsignes\(consignes\)/.test(red), "la rédaction lit les consignes par lireConsignes (plus par la présence d'un mot)");
  const src = fs.readFileSync(path.join(RACINE, "src/utils/consignesRedaction.js"), "utf8");
  ok(!/\/\[ée\]moji\|smiley\|\[ée\]motic\/i\.test\(String\(v\.eviter/.test(src), "plus de recherche du mot « emoji » dans la case « À éviter »");
}

console.log(`\n${n - ko}/${n} verts${ko ? `, ${ko} rouge(s)` : ""}`);
if (ko) process.exit(1);
