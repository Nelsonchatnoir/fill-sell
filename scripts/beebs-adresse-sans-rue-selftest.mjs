// ═══════════════════════════════════════════════════════════════════════════
// BEEBS : UNE ADRESSE SANS RUE N'EST JAMAIS SOUMISE (26/10 nuit, point 14c) — `npm run selftest:beebs-adresse-sans-rue`
// ═══════════════════════════════════════════════════════════════════════════
// Srideals, job 88f51828 (20/10) : Réglages rue = ville = « Thionville » ; texte tapé « Thionville 57100 Thionville » ;
// suggestion cliquée « Thionville57100, France » (la COMMUNE) ; après « Mettre en vente », Beebs a affiché « Renseigner
// votre adresse ». Les 15 publications acceptées du parc ont toutes suivi une suggestion AVEC rue (ou lieu-dit).
// Ce test prouve, sur le code de beebs.js (extrait tel quel) :
//   1. la commune seule est reconnue (le cas Srideals et ses autres écritures) → arrêt, message exact ;
//   2. une rue, un lieu-dit, un commerce avec sa rue : acceptés — dont les 24 suggestions réelles du parc ;
//   3. aucun verdict sans code postal (comportement d'avant) ;
//   4. le message dit vrai dans les deux cas (Réglages sans rue / rue que Beebs ne propose pas) ;
//   5. le câblage : vérifié AVANT tout clic et avant « Mettre en vente », attente nommée, Leboncoin non touché ;
//   6. le classement côté serveur (cause-blocage.js), dit tel qu'il est ;
//   7. le test mord.
import fs from "node:fs";
import vm from "node:vm";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { extraireFonctionJs } from "./lib/extraire-fonction-js.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
const src = lire("chrome-extension/content-scripts/beebs.js");
let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

const FONCTIONS = ["texteComparable", "jetonsAdresse", "motsAdresseBeebs", "retirerSuiteDeMots", "motPorteUneVoie",
  "decouperAdresseTapee", "suggestionSansRue", "messageAdresseSansRue"];
const ligneConst = (nom) => {
  const m = new RegExp(`^const ${nom} = .*$`, "m").exec(src);
  if (!m) throw new Error(`${nom} introuvable dans beebs.js`);
  return m[0];
};
const charger = (abimer = (s) => s) => {
  const ctx = vm.createContext({});
  const code = [ligneConst("normalizeFuzzy"), ligneConst("MOTS_HORS_VOIE_BEEBS"), ...FONCTIONS.map((n) => extraireFonctionJs(src, n))].join("\n");
  vm.runInContext(`${abimer(code)}\nthis.api = { suggestionSansRue, messageAdresseSansRue, decouperAdresseTapee };`, ctx);
  return ctx.api;
};
const { suggestionSansRue, messageAdresseSansRue, decouperAdresseTapee } = charger();

console.log("\n1. LA COMMUNE SEULE EST RECONNUE");
const MSG_SRIDEALS = "Beebs a besoin de ta rue pour publier : ton adresse dans Réglages n'a pas de rue (« Thionville »). "
  + "Ajoute ta rue et ton numéro dans Réglages › Expédition › Adresse de remise : rien n'a été publié.";
{
  ok(suggestionSansRue("Thionville57100, France", "Thionville 57100 Thionville") === true, "Srideals : « Thionville57100, France » = la commune seule → arrêt");
  const msg = messageAdresseSansRue("Thionville 57100 Thionville", "Thionville57100, France");
  ok(msg === MSG_SRIDEALS, "le message exact (noms de l'app : Réglages › Expédition › Adresse de remise)", msg);
  for (const [tape, suggestion] of [
    ["Thionville 57100 Thionville", "Thionville, 57100, France"],
    ["Thionville 57100 Thionville", "Thionville 57100, France"],
    ["Thionville 57100 Thionville", "57100 Thionville, France"],
    ["Thionville 57100 Thionville", "Thionville, 57100 Thionville, France"],
    ["Thionville 57100 Thionville", "  THIONVILLE57100,  France "],
    ["12 Rue des Lilas 57100 Thionville", "Thionville57100, France"],
    ["Le Pontet 84130 Le Pontet", "Le Pontet84130, France"],
    ["Saint-Germain-au-Mont-d'Or 69650 Saint-Germain-au-Mont-d'Or", "Saint-Germain-au-Mont-d’Or69650, France"],
    ["Paris 75017 Paris", "17e Arrondissement75017 Paris, France"],
    ["Meaux 77100 Meaux", "Meaux77100, France"],
  ]) ok(suggestionSansRue(suggestion, tape) === true, `« ${suggestion} » pour « ${tape} » → commune seule`);
}

console.log("\n2. UNE RUE, UN LIEU-DIT, UN COMMERCE AVEC SA RUE : ACCEPTÉS");
{
  ok(suggestionSansRue("12 Rue X, 57100 Thionville, France", "12 Rue X 57100 Thionville") === false, "« 12 Rue X, 57100 Thionville, France » → accepté");
  ok(suggestionSansRue("12 Rue de Thionville57100 Thionville, France", "12 rue de Thionville 57100 Thionville") === false, "une rue qui porte le nom de la commune → acceptée");
  ok(suggestionSansRue("28 La Merlennerie44310 Saint-Philbert-de-Grand-Lieu, France", "28 la merlennerie 44310 Saint-Philbert-de-Grand-Lieu") === false, "lieu-dit (réel, publié) → accepté");
  ok(suggestionSansRue("Grand Lieu44310 Saint-Philbert-de-Grand-Lieu, France", "Grand Lieu 44310 Saint-Philbert-de-Grand-Lieu") === false, "lieu-dit dont les mots sont DANS le nom de la commune → accepté (commune retirée en bloc)");
  ok(suggestionSansRue("Le Bourg, 23000 Guéret, France", "Le Bourg 23000 Gueret") === false, "lieu-dit sans numéro → accepté");
  // Les 24 suggestions réelles avec rue ou lieu-dit du parc (avertissements des jobs Beebs, 120 jours, relevés le 26/10 :
  // publiées, annulées ou échouées pour une autre cause) — hors « 8XL » (le bouton de taille du 01/10) et Srideals.
  const PARC = [
    ["3 rue des cordeliers 63100 Clermont-Ferrand", "3 Rue des Cordeliers63100 Clermont-Ferrand, France"],
    ["10 rue de la fontaine 57400 Hilbesheim", "10 Rue de la Fontaine57400 Hilbesheim, France"],
    ["136 rue legendre 75017 Paris", "136 Rue Legendre75017 Paris, France"],
    ["310 rue du 8 mai 1945 59490 Somain", "310 Rue du 8 Mai 194559490 Somain, France"],
    ["39 rue fombelle 17240 plassac", "39 Rue Fombelle17240 Plassac, France"],
    ["6 rue du lavoir 69650 Saint Germain au mont d'or", "6 Rue du Lavoir69650 Saint-Germain-au-Mont-d'Or, France"],
    ["Meaux 77100 Meaux", "Meaux 77Rue Frédéric Bartholdi, 77100 Meaux, France"],
    ["40 Rue des Matines 79100 Thouars", "40 Rue des Matines79100 Thouars, France"],
    ["6 rue ernest mongruel 86130 jaunay marigny", "6 Rue Ernest Mongruel86130 Jaunay-Marigny, France"],
    ["28 rue René Viviani 03100 Montlucon", "28 Rue René Viviani03100 Montluçon, France"],
    ["28 la merlennerie 44310 Saint-Philbert-de-Grand-Lieu", "28 La Merlennerie44310 Saint-Philbert-de-Grand-Lieu, France"],
    ["34 Avenue Emile Ripert 06300 Nice", "34 Avenue Emile Ripert06300 Nice, France"],
    ["4 Rue Du Hameau 26230 Chantemerle-lès-Grignan", "4 Rue Du Hameau26230 Chantemerle-lès-Grignan, France"],
    ["56b rue dalger 62100 Calais", "56b Rue d'Alger62100 Calais, France"],
    ["117 Route Departementale 6015 76190 Valliquerville", "117 Route Départementale 601576190 Valliquerville, France"],
    ["1 rue Blanche de Castille 77760 La Chapelle la Reine", "1 Rue Blanche de Castille77760 La Chapelle-la-Reine, France"],
    ["68a Avenue Charles de Gaulle 84130 Le Pontet", "68a Avenue Charles de Gaulle84130 Le Pontet, France"],
    ["48bis Rue Guynemer 33200 Bordeaux", "48 Bis Rue Guynemer33200 Bordeaux, France"],
    ["17 Rue President Robert Schuman 54000 Nancy", "17 Rue du Président Robert Schuman54000 Nancy, France"],
    ["35 rue samuel goulet 62590 Oignies", "35 Rue Samuel Goulet62590 Oignies, France"],
    ["129bis Rue Gabriel Péri 93200 Saint-Denis", "Restaurant le 129129bis Rue Gabriel Péri, 93200 Saint-Denis, France"],
    ["10 Rue de Tolbiac 75013 Paris", "10 Rue de Tolbiac75013 Paris, France"],
    ["18D Rue Henri Delahaye 44120 Vertou", "18d Rue Henri Delahaye44120 Vertou, France"],
    ["11 rue Galvani 75017 Paris", "11 Rue Galvani75017 Paris, France"],
  ];
  const faux = PARC.filter(([tape, s]) => suggestionSansRue(s, tape));
  ok(faux.length === 0, `les ${PARC.length} suggestions réelles avec rue ou lieu-dit : aucune prise pour la commune seule`, faux.map(([, s]) => s).join(" · "));
}

console.log("\n3. AUCUN VERDICT SANS CODE POSTAL (comme avant)");
{
  ok(suggestionSansRue("Thionville, France", "Thionville Thionville") === false, "adresse tapée sans code postal : aucun verdict");
  ok(suggestionSansRue("Thionville, France", "Thionville 57100 Thionville") === false, "suggestion sans le code postal : pas ce cas (elle n'est d'ailleurs jamais candidate)");
  ok(suggestionSansRue("", "Thionville 57100 Thionville") === false && suggestionSansRue("Thionville57100, France", "") === false, "vide : rien");
  const d = decouperAdresseTapee("12 rue de la Paix 69001 Lyon");
  ok(d.rue === "12 rue de la Paix" && d.codePostal === "69001" && d.ville === "Lyon", "l'adresse des Réglages se relit « rue / code postal / ville »", JSON.stringify(d));
}

console.log("\n4. LE MESSAGE DIT VRAI DANS LES DEUX CAS");
{
  const sansRue = messageAdresseSansRue("57100 Thionville", "Thionville57100, France");
  ok(/n'a pas de rue\. Ajoute ta rue/.test(sansRue), "rue vide dans les Réglages : « n'a pas de rue » (sans parenthèse vide)", sansRue);
  const numero = messageAdresseSansRue("12 57100 Thionville", "Thionville57100, France");
  ok(/n'a pas de rue \(« 12 »\)/.test(numero), "un numéro sans voie n'est pas une rue", numero);
  const avecRue = messageAdresseSansRue("12 Rue des Lilas 57100 Thionville", "Thionville57100, France");
  ok(!/n'a pas de rue/.test(avecRue) && /la suggestion de Beebs la plus proche est la commune seule \(« Thionville57100, France »\)/.test(avecRue)
    && /Vérifie l'orthographe de ta rue/.test(avecRue), "une rue dans les Réglages que Beebs ne propose pas : on ne dit jamais qu'elle manque", avecRue);
  const malFormes = [MSG_SRIDEALS, sansRue, numero, avecRue]
    .filter((m) => !(/^Beebs a besoin de ta rue pour publier : /.test(m) && /Réglages › Expédition › Adresse de remise : rien n'a été publié\.$/.test(m)));
  ok(malFormes.length === 0, "même tête (« Beebs a besoin de ta rue pour publier »), même geste, et « rien n'a été publié »", malFormes.join(" | "));
}

console.log("\n5. LE CÂBLAGE");
{
  const fill = extraireFonctionJs(src, "fillAddress");
  const iVerdict = fill.indexOf("if (suggestionSansRue(chosen, adresse)) {");
  const iClic = fill.indexOf("suggestion.el.click();");
  ok(iVerdict > 0 && iClic > iVerdict, "le verdict passe AVANT tout clic sur une suggestion");
  ok(/const relue = await waitForAddressSuggestion\(adresse, 3000\);/.test(fill), "une liste en cours de rafraîchissement est relue une fois avant de conclure");
  ok(/return \{ ok: false, attenteUtilisateur: true, attenteMotif: "beebs_adresse_sans_rue", error: messageAdresseSansRue\(adresse, chosen\) \};/.test(fill),
    "arrêt nommé : attente de la personne (needs_user persisté côté background, aucune reprise à l'identique)");
  ok(/warnings\.push\(`adresse: "\$\{adresse\}" → suggestion Beebs "\$\{chosen\}"`\);/.test(fill), "la suggestion refusée reste tracée dans les avertissements du job");
  ok(/\.\.\.\(addressResult\.attenteUtilisateur \? \{ attenteUtilisateur: true, attenteMotif: addressResult\.attenteMotif \} : \{\}\),/.test(src),
    "le remplisseur rend l'attente au background");
  const iAdresse = src.indexOf("const addressResult = await fillAddress(fields.adresse, warnings);");
  const iPrevol = src.indexOf("if (republishPreflightOnly) {");
  const iPublier = src.indexOf("const publishBtn = document.querySelector('button[type=\"submit\"]');");
  ok(iAdresse > 0 && iPrevol > iAdresse && iPublier > iAdresse, "avant le retour du pré-vol de republication ET avant « Mettre en vente »");
  const bg = lire("chrome-extension/background.js");
  ok(/if \(result\.attenteUtilisateur === true\) \{\n\s+await marquerAttenteUtilisateur\(accessToken, job, result\);/.test(bg),
    "background : une attente nommée devient needs_user persisté (marquerAttenteUtilisateur)");
  ok(!lire("chrome-extension/content-scripts/leboncoin.js").includes("suggestionSansRue"), "Leboncoin n'est pas concerné (sa propre règle)");
}

console.log("\n6. LE CLASSEMENT CÔTÉ SERVEUR (cause-blocage.js)");
{
  const { causeDuTexte } = await import(pathToFileURL(join(ROOT, "supabase/functions/_shared/cause-blocage.js")).href);
  const c = causeDuTexte({ texte: MSG_SRIDEALS, source: null, platform: "beebs" });
  const regleBranchee = /a besoin de ta rue pour publier/.test(lire("supabase/functions/_shared/cause-blocage.js"));
  if (regleBranchee) {
    ok(c.origine === "utilisateur" && c.cause === "reglage_du_compte", `classé utilisateur / réglage du compte (${c.origine}/${c.cause})`);
  } else {
    console.log(`  ⚠ À BRANCHER (serveur, hors de ce lot) : cause-blocage.js classe aujourd'hui ce message « ${c.origine}/${c.cause} » ;`
      + " attendu « utilisateur/reglage_du_compte » — la ligne à ajouter est dans le rapport du 26/10 (point 14c).");
  }
}

console.log("\n7. LE TEST MORD");
{
  const sansBloc = charger((s) => s.replace("reste = retirerSuiteDeMots(reste, commune);", "void commune;"));
  ok(sansBloc.suggestionSansRue("Thionville57100, France", "Thionville 57100 Thionville") === false, "sans le retrait de la commune, Srideals passerait : le cas 1 tomberait");
  const sansVoie = charger((s) => s.replace("return lettres.length >= 2 &&", "return false &&"));
  ok(sansVoie.suggestionSansRue("12 Rue X, 57100 Thionville, France", "12 Rue X 57100 Thionville") === true, "sans la lecture de la voie, une vraie rue serait arrêtée : le cas 2 tomberait");
  const sansBlocEnBloc = charger((s) => s.replace("if (suite.every((m, k) => mots[i + k] === m)) { i += suite.length; continue; }", "if (suite.includes(mots[i])) { i++; continue; }"));
  ok(sansBlocEnBloc.suggestionSansRue("Grand Lieu44310 Saint-Philbert-de-Grand-Lieu, France", "Grand Lieu 44310 Saint-Philbert-de-Grand-Lieu") === true,
    "mot à mot au lieu d'en bloc, le lieu-dit « Grand Lieu » serait arrêté : le cas 2 tomberait");
}

// (26/10 nuit, point 14a) L'app le dit dès les Réglages : une adresse sans rue (vide, ou la ville répétée).
{
  const A = await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "..", "supabase/functions/_shared/lbc-adresse-france.js")).href);
  ok(A.rueAbsente({ rue: "Thionville", ville: "Thionville" }) === true, "Réglages de Srideals (rue = ville) : sans rue");
  ok(A.rueAbsente({ rue: "", ville: "Metz" }) === true, "rue vide : sans rue");
  ok(A.rueAbsente({ rue: "12 rue de la Paix", ville: "Paris" }) === false && A.rueAbsente({ rue: "Le Moulin", ville: "Saint-Avold" }) === false, "une rue ou un lieu-dit : rien à dire");
  const reg = fs.readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "src/reglages/SousPageExpedition.jsx"), "utf8");
  ok(/rueAbsente\(\{ rue, ville \}\) && \(/.test(reg) && /\{T\.rueBeebs\}/.test(reg), "Réglages › Expédition : la phrase sous l'adresse");
}

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ Beebs : une adresse sans rue n'est jamais soumise — la personne sait quoi compléter, rien n'est publié à moitié");
