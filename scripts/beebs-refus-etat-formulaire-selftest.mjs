// ═══════════════════════════════════════════════════════════════════════════
// BEEBS : LE REFUS DE « METTRE EN VENTE » LU DANS L'ÉTAT DU FORMULAIRE (08/11 soir, Julian) — `npm run selftest:beebs-refus-etat-formulaire`
// ═══════════════════════════════════════════════════════════════════════════
// compte fc37c75e, 5 publications × 4 essais (08/11 18:17 → 19:29, 0.6.179) : « Dépôt Beebs non confirmé »,
// sonde « AUCUNE capture » (rien n'est parti), « le formulaire affiche » = cinq conteneurs de champs, jamais le motif.
// Relevé sur beebs.app/fr/listing le 08/11 : formulaire react-hook-form ; au clic, le gestionnaire valide puis pose
// chaque refus par setError et RETOURNE sans requête. Trois refus étaient illisibles : compte non chargé (erreur racine
// « Vous devez être connecté pour ajouter un produit »), attribut obligatoire vide (« Sélectionner une valeur »),
// adresse quand la section Adresse est masquée (aucun texte rendu).
// Ce test prouve, sur le code de beebs.js et de background.js (extrait tel quel) :
//   1. la fonction MAIN lit erreurs, compteur d'envois, adresse (booléens seulement) d'un vrai montage react-hook-form ;
//   2. seul un refus posé PAR CE CLIC compte (compteur avancé, envoi terminé) ; l'erreur d'enregistrement (après requête) non ;
//   3. chaque refus est nommé : connexion → « Connexion Beebs requise », adresse masquée → compte Beebs, adresse affichée →
//      Réglages, attribut → la question avec les valeurs de Beebs, format, prix, texte, date limite ; photos/catégorie → reprise ;
//   4. le relevé du texte ne remonte plus les conteneurs de champs ;
//   5. le câblage : compteur lu avant le clic, état lu pendant l'attente, verdict nommé avant le lecteur d'avant ;
//   6. le test mord.
import fs from "node:fs";
import vm from "node:vm";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extraireFonctionJs } from "./lib/extraire-fonction-js.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
const src = lire("chrome-extension/content-scripts/beebs.js");
const bg = lire("chrome-extension/background.js");
let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

// Une déclaration `const NOM = …;` (une ligne, ou un objet sur plusieurs lignes).
const constante = (texte, nom) => {
  const i = texte.indexOf(`const ${nom} =`);
  if (i < 0) throw new Error(`${nom} introuvable`);
  const fin = texte.indexOf(";\n", i);
  return texte.slice(i, fin + 1);
};
// La valeur `nom: function () { … }` d'une table d'objets (accolades comptées hors chaînes).
const methode = (texte, nom) => {
  const i = texte.indexOf(`  ${nom}: function () {`);
  if (i < 0) throw new Error(`méthode ${nom} introuvable`);
  let j = texte.indexOf("{", i), prof = 0;
  for (; j < texte.length; j++) {
    const c = texte[j];
    if (c === '"' || c === "'") { const q = c; for (j++; j < texte.length && texte[j] !== q; j++) if (texte[j] === "\\") j++; continue; }
    if (c === "{") prof++;
    else if (c === "}") { prof--; if (prof === 0) break; }
  }
  return texte.slice(texte.indexOf("function", i), j + 1);
};

const FONCTIONS = ["refusDeValidationBeebs", "resumeEtatFormulaireBeebs", "refusDepuisEtatFormulaire"];
const charger = (abimer = (s) => s) => {
  const ctx = vm.createContext({});
  const code = [
    constante(src, "BEEBS_RACINE_CONNEXION_RE"), constante(src, "estErreurRacine"),
    constante(src, "BEEBS_CIBLES_DEDIEES"), constante(src, "BEEBS_NOMS_DE_CHAMP"),
    ...FONCTIONS.map((n) => extraireFonctionJs(src, n)),
  ].join("\n");
  vm.runInContext(`${abimer(code)}\nthis.api = { ${FONCTIONS.join(", ")} };`, ctx);
  return ctx.api;
};
const api = charger();

// Un montage react-hook-form MINIMAL, de la forme relevée le 08/11 : <form> → fiber hôte → composant dont un hook
// est une ref { current: { control, handleSubmit, getValues } } ; control._formState porte errors / submitCount.
const fauxFormulaire = ({ errors = {}, submitCount = 0, isSubmitting = false, valeurs = {}, sectionAdresse = false }) => {
  const methodes = {
    control: { _formState: { errors, submitCount, isSubmitting, isSubmitSuccessful: false } },
    handleSubmit: () => () => {}, getValues: () => valeurs,
  };
  const composant = { memoizedState: { memoizedState: [], next: { memoizedState: { current: methodes }, next: null } }, return: null };
  const form = { "__reactFiber$abc": { memoizedState: null, return: composant } };
  return {
    querySelector: (sel) => (sel === "form" ? form : sel === 'input[name="address"]' ? (sectionAdresse ? {} : null) : null),
  };
};
const lireMain = (document) => {
  const ctx = vm.createContext({ document });
  vm.runInContext(`this.r = (${methode(bg, "formulaire")})();`, ctx);
  return JSON.parse(JSON.stringify(ctx.r));
};

console.log("\n1. LA FONCTION MAIN LIT L'ÉTAT DU FORMULAIRE");
const ADRESSE_PERSO = { fullAddress: "106 Route de Lyon, Boulazac", city: "Boulazac", country: "FR", zip: "24750", streetAddress: "106 Route de Lyon", longitude: 0.77, latitude: 45.17 };
{
  const r = lireMain(fauxFormulaire({
    submitCount: 1,
    errors: { address: { message: "Renseigner votre adresse", ref: {} }, attributes: { condition: { type: "manual", message: "Sélectionner une valeur" } } },
    valeurs: { title: "Trench long vintage", address: { fullAddress: "x" }, attributes: { condition: undefined, size_women_clothing: "XL / 42" }, weight: { title: "2 kg" }, price: "23" },
  }));
  ok(r.ok === true && r.soumissions === 1 && r.enCours === false, "compteur d'envois et envoi terminé lus", JSON.stringify(r));
  ok(r.erreurs.length === 2 && r.erreurs[0].champ === "address" && r.erreurs[1].champ === "attributes.condition", "erreurs à plat, chemin react-hook-form", JSON.stringify(r.erreurs));
  ok(r.erreurs[1].message === "Sélectionner une valeur" && r.erreurs[1].type === "manual", "message et type gardés");
  ok(r.adresse.section === false && r.adresse.complete === false, "adresse : section absente, incomplète (booléens)");
  ok(!JSON.stringify(r).includes("Boulazac") && !JSON.stringify(r).includes("Route"), "aucune donnée d'adresse ne sort");
  ok(r.vides.includes("attributes.condition") && !r.vides.includes("attributes.size_women_clothing"), "valeurs vides nommées");
  const c = lireMain(fauxFormulaire({ valeurs: { address: ADRESSE_PERSO }, sectionAdresse: true }));
  ok(c.adresse.section === true && c.adresse.complete === true && !JSON.stringify(c).includes("Boulazac"), "adresse complète et section affichée, sans la donnée");
  const racine = lireMain(fauxFormulaire({ submitCount: 2, errors: { root: { message: "Vous devez être connecté pour ajouter un produit" } } }));
  ok(racine.erreurs.length === 1 && racine.erreurs[0].champ === "root", "erreur racine lue");
  const sans = lireMain({ querySelector: () => null });
  ok(sans.ok === false && /aucun <form>/.test(sans.reason), "pas de formulaire → ok:false nommé (comportement d'avant)");
}

console.log("\n2. SEUL UN REFUS POSÉ PAR CE CLIC COMPTE");
{
  const e = (champ, message) => ({ champ, type: null, message });
  const etat = (o) => ({ ok: true, soumissions: 1, enCours: false, erreurs: [], adresse: { section: false, complete: false }, ...o });
  ok(api.refusDeValidationBeebs(etat({ erreurs: [e("address", "Renseigner votre adresse")] }), 0)?.length === 1, "compteur 0 → 1 et une erreur : refus de validation");
  ok(api.refusDeValidationBeebs(etat({ soumissions: 0, erreurs: [e("address", "x")] }), 0) === null, "compteur inchangé : jamais la réponse au clic");
  ok(api.refusDeValidationBeebs(etat({ enCours: true, erreurs: [e("address", "x")] }), 0) === null, "envoi en cours : on attend");
  ok(api.refusDeValidationBeebs(etat({ erreurs: [e("root", "Une erreur est survenue lors de l’enregistrement de votre annonce. Veuillez réessayer plus tard.")] }), 0) === null,
    "erreur d'enregistrement (après requête) : PAS un refus de validation, chemin d'avant");
  ok(api.refusDeValidationBeebs(etat({ erreurs: [e("root", "Vous devez être connecté pour ajouter un produit")] }), 0)?.length === 1, "erreur racine de connexion : refus (avant toute requête)");
  ok(api.refusDeValidationBeebs({ ok: false, reason: "pont muet" }, 0) === null, "pont muet : rien (comportement d'avant)");
  ok(api.refusDeValidationBeebs(etat({ erreurs: [e("price", "Renseigner le prix de vente")] }), null)?.length === 1, "compteur d'avant illisible : les erreurs de l'état suffisent");
  const resume = api.resumeEtatFormulaireBeebs(etat({ erreurs: [e("address", "Renseigner votre adresse")], vides: ["attributes.condition"] }), 0);
  ok(/envoi n° 1 déclenché par le clic/.test(resume) && /address — Renseigner votre adresse/.test(resume) && /section absente, incomplète/.test(resume), "résumé d'observabilité", resume);
  ok(/compteur d'envois inchangé/.test(api.resumeEtatFormulaireBeebs(etat({ soumissions: 0 }), 0)), "un clic sans envoi est dit tel quel");
}

console.log("\n3. CHAQUE REFUS EST NOMMÉ");
{
  const e = (champ, message) => ({ champ, type: null, message });
  const T = { titre: "Trench long vintage", navigateur: "Chrome" };
  const s = api.refusDepuisEtatFormulaire([e("root", "Vous devez être connecté pour ajouter un produit")], T);
  ok(s.code === "session" && /^Connexion Beebs requise : /.test(s.message) && !s.attenteUtilisateur, "connexion → « Connexion Beebs requise » (attente de session du background)", s.message);
  const am = api.refusDepuisEtatFormulaire([e("address", "Renseigner votre adresse")], { ...T, adresse: { section: false, complete: false } });
  ok(am.code === "adresse_compte" && am.attenteUtilisateur === true && am.attenteMotif === "beebs_adresse_compte"
    && /compte Beebs/.test(am.message) && /rien n'a été publié/.test(am.message) && /Trench long vintage/.test(am.message), "adresse masquée → compléter l'adresse du compte Beebs", am.message);
  const aa = api.refusDepuisEtatFormulaire([e("address", "Renseigner votre adresse")], { ...T, adresse: { section: true, complete: false } });
  ok(aa.code === "adresse" && aa.attenteUtilisateur === true && /Réglages FillSell/.test(aa.message), "adresse affichée → Réglages FillSell (message d'avant)");
  const champs = [
    { name: "attributes.condition", cle: "État", label: "État", libelle: "État", valeurs: ["Neuf avec étiquette", "Très bon état", "Bon état"] },
    { name: "attributes.size_men_shirt", cle: "Taille [attributes.size_men_shirt]", label: "Taille", libelle: "Taille (2ᵉ champ « Taille » de cette catégorie)", valeurs: ["S", "M", "L"] },
    { name: "weight", cle: "Format du colis", label: "Format du colis", libelle: "Format du colis", valeurs: ["Poids jusqu'à 2 kg max"] },
  ];
  const at = api.refusDepuisEtatFormulaire([e("attributes.condition", "Sélectionner une valeur")], { ...T, champs });
  ok(at.code === "champ_obligatoire" && at.needsUserField?.field_key === "État" && at.needsUserField.target.key === "etat"
    && at.needsUserField.allowed_values.length === 3 && /« État »/.test(at.message), "attribut vide → la question « État » avec les valeurs de Beebs", JSON.stringify(at));
  const hom = api.refusDepuisEtatFormulaire([e("attributes.size_men_shirt", "Sélectionner une valeur")], { ...T, champs });
  ok(hom.needsUserField?.target.root === "beebsAspects" && hom.needsUserField.field_key === "Taille [attributes.size_men_shirt]", "homonyme → beebsAspects.<clé à discriminant>");
  const po = api.refusDepuisEtatFormulaire([e("weight", "Sélectionner un format de colis")], { ...T, champs });
  ok(po.needsUserField?.target.key === "format_colis", "format du colis → la question du format");
  const sv = api.refusDepuisEtatFormulaire([e("attributes.brand", "Sélectionner une valeur")], { ...T, champs: [] });
  ok(sv.attenteUtilisateur === true && sv.attenteMotif === "beebs_champ_obligatoire" && !sv.needsUserField, "attribut sans valeurs connues → attente nommée, jamais une question vide");
  ok(api.refusDepuisEtatFormulaire([e("price", "Renseigner le prix de vente")], T).code === "prix", "prix");
  ok(api.refusDepuisEtatFormulaire([e("description", "Ajouter au moins 5 caractères")], T).code === "texte_trop_court", "description trop courte");
  ok(api.refusDepuisEtatFormulaire([e("ddmCertified", "Veuillez certifier l’exactitude de la date limite.")], T).code === "date_limite", "date limite");
  ok(api.refusDepuisEtatFormulaire([e("pictures", "Ajouter au moins une photo")], T) === null, "photos : notre remplissage → verdict d'avant (reprise)");
  ok(api.refusDepuisEtatFormulaire([e("category", "Sélectionner une catégorie")], T) === null, "catégorie : idem");
  const ordre = api.refusDepuisEtatFormulaire([e("attributes.condition", "x"), e("address", "Renseigner votre adresse")], { ...T, champs, adresse: { section: false } });
  ok(ordre.code === "adresse_compte", "l'adresse passe devant un attribut (un geste de compte)");
}

console.log("\n4. LE RELEVÉ DU TEXTE NE REMONTE PLUS LES CONTENEURS DE CHAMPS");
{
  const f = extraireFonctionJs(src, "erreursFormulaireVisibles");
  ok(/if \(estConteneurDeChamp\(el\)\) continue;/.test(f), "les conteneurs (libellé, bouton, saisie, image) sont sautés");
  ok(/Vous devez \[êe\]tre connect\[ée\] pour ajouter un produit/.test(constante(src, "BEEBS_ERREURS_FORMULAIRE_RE")), "l'erreur racine de connexion est dans la regex");
  const conteneur = vm.runInContext(`(${constante(src, "estConteneurDeChamp").replace(/^const estConteneurDeChamp = /, "").replace(/;$/, "")})`, vm.createContext({}));
  ok(conteneur({ querySelector: (s) => (/label/.test(s) ? {} : null), matches: () => false }) === true, "« Titre de votre annonce19/100… » (porte un label) = conteneur");
  ok(conteneur({ querySelector: () => null, matches: () => false }) === false, "un message seul (« Sélectionner une valeur ») n'en est pas un");
}

console.log("\n5. LE CÂBLAGE");
{
  const iAvant = src.indexOf("const etatAvantClic = await lireEtatFormulaireBeebs();");
  const iClic = src.indexOf("publishBtn?.click();");
  const iGarde = src.indexOf("const abandon = abandonAvantEnvoi(job.id);");
  ok(iAvant > 0 && iAvant < iGarde && iGarde < iClic, "le compteur d'envois est lu AVANT la garde d'abandon, elle-même juste avant le clic (aucun await entre les deux)");
  ok(src.includes("waitForBeebsDeposit(45_000, { lireEtat: lireEtatFormulaireBeebs, soumissionsAvant })"), "l'attente lit l'état du formulaire");
  const iEtat = src.indexOf("const refusEtat = refusDepuisEtatFormulaire(");
  const iDom = src.indexOf("const refus = lireRefusFormulaireBeebs(");
  ok(iEtat > iClic && iEtat < iDom, "le refus nommé par l'état passe AVANT le lecteur du texte d'avant");
  const w = extraireFonctionJs(src, "waitForBeebsDeposit");
  ok(/refusDeValidationBeebs\(etatFormulaire, soumissionsAvant\)/.test(w) && /tour % 3 === 2/.test(w), "l'état est relu toutes les ~3 s pendant l'attente");
  ok(/^\s*error: "Dépôt Beebs non confirmé : le formulaire Beebs a refusé l'envoi/m.test(w), "le refus non nommé garde le préfixe « Dépôt Beebs non confirmé » (sonde, classement serveur)");
  ok(/formulaire : \$\{etatLu\}/.test(src), "l'état lu part dans l'observabilité du verdict générique");
  ok(/BEEBS_MAIN_FONCTIONS = \{[\s\S]*\n  formulaire: function \(\) \{/.test(bg), "background : BEEBS_MAIN_FONCTIONS.formulaire existe");
}

console.log("\n6. LE TEST MORD");
{
  const abime = charger((c) => c.replace("if (Number.isFinite(soumissionsAvant) && !(Number(etat.soumissions) > soumissionsAvant)) return null;", ""));
  ok(abime.refusDeValidationBeebs({ ok: true, soumissions: 0, enCours: false, erreurs: [{ champ: "address", message: "x" }] }, 0) !== null,
    "sans la garde du compteur, une erreur d'avant le clic passerait pour un refus (la garde est utile)");
  const abime2 = charger((c) => c.replace("if (adresse?.section) {", "if (true) {"));
  ok(abime2.refusDepuisEtatFormulaire([{ champ: "address", message: "x" }], { adresse: { section: false } }).code === "adresse",
    "sans la lecture de la section, l'adresse masquée renverrait vers les Réglages FillSell (le test le verrait)");
}

if (ko) { console.error(`\n❌ ${ko} échec(s)`); process.exit(1); }
console.log("\n✅ BEEBS — REFUS LU DANS L'ÉTAT DU FORMULAIRE : tout est vert.");
