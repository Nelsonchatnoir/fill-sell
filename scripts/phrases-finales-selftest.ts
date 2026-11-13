// VERROU (13/11/2026, lot « zéro problème », point 5a de Nico) : SES PHRASES FINALES, MOT POUR MOT, RIEN APRÈS.
//
//     npm run selftest:phrases-finales
//
// Compte de63ca45 : « Finir EXACTEMENT, emojis et lignes vides : Vendu comme sur les photos. / 📍 Remise en main propre
// possible. / 🚚 Expédition rapide et soignée, généralement sous 12 heures ouvrées. » — 7 propositions sur 7 du 02/11
// les rendaient sans 📍 ni 🚚 ; et sur Leboncoin / Beebs, une marque hors liste ajoutait « Marque : X » APRÈS elles.
// Décision de Nico : ses 3 phrases finales mot pour mot, émojis compris, rien ajouté après. Le CODE les pose (jamais le
// modèle), en dernier ; get-pending-jobs sert `fin_de_description`, l'extension (0.6.187) écrit la marque AVANT.
// Le VRAI module de rédaction tourne (scripts/lib/rejeu-redaction.ts), sur les sorties réellement stockées.
import vm from "node:vm";
import { compteur, importer, lireFixture, rejouer, ficheDeRejeu, racineDuCode } from "./lib/rejeu-redaction.ts";

const { ok, fin } = compteur();
const R = await importer("supabase/functions/_shared/redaction-plateformes.ts");
let B: Record<string, unknown> | null = null;
try { B = await importer("src/utils/blocsDescription.js"); } catch { B = null; }
const fx = await lireFixture();
const FIN = "Vendu comme sur les photos.\n\n📍 Remise en main propre possible.\n\n🚚 Expédition rapide et soignée, généralement sous 12 heures ouvrées.";
const PF = ["vinted", "leboncoin", "beebs", "ebay"];
const compte = (s: string, x: string) => s.split(x).length - 1;

console.log("1. Rédaction : ses 7 fiches réelles, les sorties stockées du modèle (📍 et 🚚 perdus) → fin exacte");
for (const f of fx.fiches) {
  const r0 = ficheDeRejeu(f);
  const platforms = PF.filter((p) => r0.sorties[p]?.description);
  const r = await rejouer(R, { platforms, sorties: r0.sorties, item: r0.item, canonicalProvided: r0.canonicalProvided, consignes: fx.consignes, note: r0.note });
  for (const p of platforms) {
    const d = r.platformListings[p]?.description ?? "";
    ok(d.endsWith(FIN) && compte(d, "Vendu comme sur les photos.") === 1 && compte(d, "Remise en main propre possible.") === 1,
      `${String(f.titre).slice(0, 34)} — ${p} : finit EXACTEMENT par ses 3 phrases (émojis, lignes vides), une seule fois`, d.slice(-170));
  }
}

console.log("2. Rédaction : un modèle qui écrit lui-même ses phrases (avec émojis) → gardées une fois, en dernier");
{
  const crash = fx.fiches.find((f) => f.inventaire_id === "1793613236541")!;
  const r0 = ficheDeRejeu(crash);
  const sorties = Object.fromEntries(PF.map((p) => [p, { ...r0.sorties[p], description: String(crash.texte_publie) }]));
  const r = await rejouer(R, { platforms: PF, sorties, item: r0.item, canonicalProvided: r0.canonicalProvided, consignes: fx.consignes, note: r0.note });
  for (const p of PF) {
    const d = r.platformListings[p]?.description ?? "";
    ok(d.endsWith(FIN) && compte(d, "📍 Remise en main propre possible.") === 1, `${p} : une fois, à la fin, à l'octet près`, d.slice(-170));
  }
}

console.log("3. Au service : la fin repérée sur les 5 plateformes (Beebs : sans la phrase de test)");
{
  const gta = String(fx.fiches.find((f) => f.inventaire_id === "1793616052050")!.texte_publie);
  const servir = B?.rendreDescriptionAuService as ((t: string, o: unknown) => { texte: string; fin_de_description: string | null }) | undefined;
  for (const p of ["vinted", "leboncoin", "beebs", "ebay", "depop"]) {
    const r = servir?.(gta, { plateforme: p, consignes: fx.consignes, aujourdhui: "2026-11-13" });
    ok(r && r.texte.endsWith(FIN) && r.fin_de_description === FIN, `${p} : le texte servi finit par ses phrases, fin_de_description servie`, r?.fin_de_description);
  }
  const gpj = await Deno.readTextFile(new URL("supabase/functions/get-pending-jobs/index.ts", racineDuCode())).catch(() => "");
  ok(/finDeDescription\(r\.description as string, finales\)/.test(gpj) && /fin_de_description: fin/.test(gpj), "get-pending-jobs sert fin_de_description (après le nettoyage des caractères invisibles)");
}

console.log("4. Extension (0.6.187) : « Marque : X » AVANT ses phrases finales, jamais après");
for (const fichier of ["chrome-extension/content-scripts/leboncoin.js", "chrome-extension/content-scripts/beebs.js"]) {
  const src = (await Deno.readTextFile(new URL(fichier, racineDuCode()))).split("\r\n").join("\n");
  const bloc = (debut: string, finB: string) => { const d = src.indexOf(debut), f = src.indexOf(finB); return d < 0 || f < 0 ? "" : src.slice(d, f + finB.length); };
  const texteComparable = bloc("// ⟦texte-comparable:début⟧", "// ⟦texte-comparable:fin⟧");
  const marque = bloc("// ⟦marque-exacte:début⟧", "// ⟦marque-exacte:fin⟧");
  const ctx = vm.createContext({ console, String, Array, RegExp, Object, Map, Set, Number, Boolean });
  const containsAsWords = `function containsAsWords(hay, needle) { if (!needle) return false; const escaped = needle.replace(/[.*+?^\${}()|[\\]\\\\]/g, "\\\\$&"); return new RegExp("(?:^|[^a-z0-9])" + escaped + "(?:[^a-z0-9]|$)").test(hay); }`;
  vm.runInContext(`${texteComparable}\nconst normalizeFuzzy = (s) => texteComparable(s);\n${containsAsWords}\nconst optionLabel = (o) => String(o.textContent ?? "").trim();\n${marque}\n;globalThis.__t = { descriptionAvecMarque };`, ctx);
  const avecMarque = (ctx as { __t: { descriptionAvecMarque: (d: string, m: string, f?: string | null) => string } }).__t.descriptionAvecMarque;
  const texte = `🎮 Je vends Destiny sur PS4.\n\n💿 Disque en excellent état.\n\nJeu testé le 2 novembre 2026 et fonctionnel.\n\n${FIN}`;
  const r = avecMarque(texte, "Bungie", FIN);
  const nom = fichier.split("/").pop();
  ok(r.endsWith(FIN) && r.includes("Jeu testé le 2 novembre 2026 et fonctionnel.\n\nMarque : Bungie\n\nVendu comme sur les photos."), `${nom} : « Marque : Bungie » juste avant « Vendu comme sur les photos. », la fin intacte`, r.slice(-200));
  ok(avecMarque("Joli pull.", "Chic Me", null) === "Joli pull.\n\nMarque : Chic Me" && avecMarque("Joli pull.", "Chic Me", FIN) === "Joli pull.\n\nMarque : Chic Me",
    `${nom} : sans fin du vendeur (ou fin absente du texte) — comme avant, à la fin`);
  ok(/FIN_DU_VENDEUR = typeof msg\.job\?\.fin_de_description === "string"/.test(src), `${nom} : la fin servie est relue à chaque job (jamais celle du job d'avant)`);
}
fin();
