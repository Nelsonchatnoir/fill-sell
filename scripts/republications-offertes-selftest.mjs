// Autotest — le gratuit a 50 republications PAR MOIS, et chaque écran le dit
// (05/10, décision Nico — remplace « 50 à vie » du 02/09) —
// npm run selftest:republications-offertes
//
// Historique : le 03/10 (point 20), le mur des republications disait d'abord
// ce que le gratuit A DÉJÀ (79 comptes gratuits avaient pris le mur en 30
// jours, 54 sans jamais republier). Ce garde-fou reste ; la règle change :
// coin_config quota_republication_free (50), même cycle et même remise à zéro
// que quota_annonces_free (debut_cycle_quotas / coin_wallets.next_grant_at).
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

console.log("\n1. LA RÈGLE, CÔTÉ SERVEUR (migration 20261005173000)");
const mig = lire("supabase/migrations/20261005173000_republication_free_mensuelle.sql");
ok(/INSERT INTO public\.coin_config \(key, value\) VALUES \('quota_republication_free', 50\)/.test(mig), "la valeur vit dans coin_config : quota_republication_free = 50");
ok(/debut_cycle_quotas\(p_user\)/.test(mig) && /SELECT w\.next_grant_at INTO v_remise FROM coin_wallets/.test(mig),
  "même calendrier que quota_annonces_free : début = debut_cycle_quotas, remise = coin_wallets.next_grant_at");
ok(/quotas_republication_free_depuis/.test(mig), "la bascule remet tout le monde à zéro (borne de mise en ligne, comme quotas_annonces_depuis)");
ok(/count\(\*\) FILTER \(WHERE j\.published_at >= v_borne\)/.test(mig) && /j\.action = 'republish'/.test(mig),
  "ne compte que les republications EXÉCUTÉES dans le cycle (published_at)");
ok(/j\.status IN \('pending', 'processing', 'needs_user'\)/.test(mig), "une republication en file réserve sa place (dix clics ne passent pas tous)");
ok(/!~ '\(sync-dressing\|releve-annonces\)'/.test(mig), "jamais un import de relevé");
ok(!/coin_wallets\.(included|purchased)_balance|included_balance \+/.test(mig.split("-- ── 3.")[0]), "jamais un solde : le compteur ne lit aucun solde de portefeuille");
ok(/DELETE FROM public\.coin_config WHERE key IN \('republication_avie_free', 'republication_avie_depuis'\)/.test(mig), "les clés « à vie » sont retirées");
ok(/'reason', 'plafond_republication_free',\s*'mode', 'mensuel'/.test(mig) && /'remise_le', v_qfree -> 'remise_le'/.test(mig),
  "le refus garde son code et dit la remise à zéro");
ok(/IS DISTINCT FROM 1500/.test(mig) && /IS DISTINCT FROM 5000/.test(mig), "la migration refuse de passer si Premium/Pro ont bougé");

console.log("\n2. LA MODALE DES OFFRES : CE QU'IL A, D'ABORD");
const modale = lire("src/components/ConversionModal.jsx");
ok(/repubOffertes = null,/.test(modale), "la modale reçoit les republications restantes du mois");
const iBloc = modale.indexOf("{(repubLot || repubAuto) && Number(repubOffertes?.restantes) > 0 && (");
const iOffre = modale.indexOf("{offre === 'FILLSELL50' && (");
const iCartes = modale.indexOf("<PlansStack fr={fr} tiers={sellable} showFree");
ok(iBloc > 0 && iBloc < iOffre && iBloc < iCartes, "en lot comme en automatique, le bloc vient AVANT toute offre et toute carte de prix");
const bloc = modale.slice(iBloc, iOffre);
ok(/Tu as encore \{repubOffertes\.restantes\} republications ce mois-ci/.test(bloc) && /rien à payer/.test(bloc), "« Tu as encore N republications ce mois-ci — rien à payer »");
ok(/Remise à zéro le \{remiseOffertes\}/.test(bloc) && /Resets on \{remiseOffertes\}/.test(bloc), "et la date de remise à zéro");
ok(/une par une : le bouton « Republier » est sur la carte de chaque annonce/.test(bloc), "le geste : une par une, le bouton « Republier » de chaque carte");
ok(/logModale\('offers_modal_offertes_click'/.test(bloc) && /\{fr \? 'Republier une par une' : 'Repost one by one'\}/.test(bloc),
  "un bouton qui ramène au stock, mesuré à part (pas compté comme un abandon)");
ok(/quota_republication_free: 50,/.test(modale), "repli de la modale : quota_republication_free (seul repli, comme les autres quotas)");
ok(/const repubTexte = palier === 'business'/.test(modale), "carte Free : la même phrase « N republications par mois » que Premium et Pro");
ok(/'Tes republications du mois sont faites\.'/.test(modale), "titre du mur : « Tes republications du mois sont faites. »");
ok(/republications du mois sont toutes utilisées\{remiseRepub \? <> — elles reviennent le \{remiseRepub\}/.test(modale), "le mur dit quand elles reviennent");
const app = lire("src/App.jsx");
ok(/repubOffertes=\{quotas\?\.palier==='free'&&quotas\?\.republication\?\.plafond!=null\?\{restantes:quotas\.republication\.restantes\?\?null,plafond:quotas\.republication\.plafond\?\?null,remise_le:quotas\.republication\.remise_le\?\?null\}:null\}/.test(app),
  "l'app passe le compteur du serveur (quotas_etat) — jamais un chiffre en dur");

console.log("\n3. LE STOCK : LE BOUTON « REPUBLIER EN LOT » D'UN GRATUIT");
const stock = lire("src/tabs/StockTab.jsx");
ok(/Tu as encore \$\{quotas\.republication\.restantes\} republications ce mois-ci\$\{jourRemise\(quotas\.republication\.remise_le,'fr'\)/.test(stock),
  "sous le bouton : ses republications du mois, leur remise à zéro, et comment s'en servir");
ok(/const msgPlafondRepub = \(res\) => messagePlafondRepublicationGratuit\(res,/.test(stock), "le refus inline passe par la phrase partagée");
ok(/plafondRepub: \{ plafond: res\?\.plafond \?\? null, faites: res\?\.faites \?\? null, remise_le: res\?\.remise_le \?\? null \}/.test(stock),
  "la modale reçoit la remise à zéro du refus (plus de repli « 3 »)");

console.log("\n4. PLUS AUCUN « À VIE » NULLE PART");
const ecrans = ["src/components/ConversionModal.jsx", "src/tabs/StockTab.jsx", "src/pages/LandingPage.jsx", "src/pages/Legal.jsx",
  "src/reglages/textes.js", "src/reglages/ReglagesUI.jsx", "src/App.jsx", "src/utils/republication.js", "src/utils/jourRemise.js"];
const interdit = /republications offertes|repostings included,|included repostings|offertes à vie|offertes, à vie|for life|one-time allowance|dotation unique|restantesAVie|mode==='avie'|mode === 'avie'|republication_avie/;
for (const f of ecrans) {
  const m = lire(f).match(interdit);
  ok(!m, `${f} : aucun texte « à vie »`, m ? `trouvé : « ${m[0]} »` : "");
}
const landing = lire("src/pages/LandingPage.jsx");
ok(/\{t\("\{REPUB_FREE\} republications par mois"\)\}/.test(landing) && /parKey\.quota_republication_free/.test(landing), "landing : carte Free « {REPUB_FREE} republications par mois », lue dans quota_republication_free");
ok((landing.match(/\(\{REPUB_FREE\} par mois en Free, \{REPUB_PREMIUM\} en Premium,/g) ?? []).length === 2, "landing : FAQ (dictionnaire et tableau identiques)");
const legal = lire("src/pages/Legal.jsx");
ok(/Free<\/span> : 5 annonces générées par IA et publiées sur les plateformes prises en charge et 50 republications par cycle ;/.test(legal)
  && /Free<\/span>: 5 AI-generated listings published to the 5 supported platforms and 50 repostings per cycle;/.test(legal), "CGU 3.4 : 50 republications par cycle, FR et EN");

console.log("\n5. LA PHRASE ET LA DATE (exécutées)");
const { jourRemise, messagePlafondRepublicationGratuit } = await import(pathToFileURL(join(ROOT, "src/utils/jourRemise.js")).href);
const demain = new Date(Date.now() + 3 * 86400_000).toISOString();
ok(jourRemise(null) === null && jourRemise("pas une date") === null, "remise absente ou illisible → rien");
ok(jourRemise(new Date(Date.now() - 86400_000).toISOString()) === null, "remise passée → rien (jamais une date fausse)");
ok(typeof jourRemise(demain, "fr") === "string" && /\d/.test(jourRemise(demain, "fr")), "remise à venir → « 8 octobre »", jourRemise(demain, "fr"));
const fr = messagePlafondRepublicationGratuit({ plafond: 50, remise_le: demain }, "fr");
ok(/^Tes 50 republications du mois sont toutes utilisées — elles reviennent le .+\. Rien n'a été débité\.$/.test(fr), "FR : chiffre du serveur + jour de retour", fr);
const sansChiffre = messagePlafondRepublicationGratuit({}, "en");
ok(sansChiffre === "Your repostings for this month are all used. Nothing was charged.", "sans chiffre du serveur : aucun 50 inventé", sansChiffre);

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ le gratuit a 50 republications par mois, et chaque écran le dit");
