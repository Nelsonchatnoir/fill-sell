// ═══════════════════════════════════════════════════════════════════════════
// VERROU — LEBONCOIN : UNE ANNONCE REFUSÉE NE REPART JAMAIS À L'IDENTIQUE (13/11/2026, lot du 13/11 — 3e réponse de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Décision de Nico (13/11) : « Relance à l'identique d'une annonce déjà refusée : bloquée tant que rien n'a changé. Le
// vendeur est invité à modifier l'annonce avant de la relancer. »
// LE CAS RÉEL (compte 229c7b07, relu en prod le 13/11, lecture seule ; famille 3 du rapport LBC du 13/11) : « Topps
// Disney100 Chrome Anna #9 » (fiche 1793030096058) refusée par Leboncoin cinq fois et plus — job 137ea70c relancé tel
// quel trois fois (relance_apres_depot_mort, relances_manuelles 3), refusé de nouveau le 11/11 06:04 ; sa COPIE 5adbc272
// (relance_copie_de 137ea70c, même titre, même texte, mêmes photos, même rayon) déposée le 11/11 09:56, refusée à 23:38.
// Rien n'empêchait la relance à l'identique : défaut de notre fait (le premier refus, lui, n'a pas de cause lisible).
// LA RÈGLE (tous comptes, comme Beebs depuis le 29/10) : au service, get-pending-jobs note l'empreinte de ce qui part
// (platform_fields.lbc_envois : titre et texte SERVIS, photos, prix, catégorie, attributs) ; une publication Leboncoin dont
// l'empreinte est celle d'un dépôt refusé de la MÊME fiche (marque du juge : depot_jamais_en_ligne refus_moderation_probable,
// jamais_en_ligne, relance_apres_depot_mort) est retenue : needs_user « refus_lbc_meme_contenu », message qui invite à
// modifier l'annonce, rien envoyé. Refus d'avant cette règle (sans empreinte notée) : le contenu brut de la tâche refusée
// fait foi, SEULEMENT si le nettoyage d'aujourd'hui sert son titre et son texte tels quels (sinon ce qui partirait a
// changé : la règle des cinq mots-clés du 13/11 a corrigé le texte d'IKKS, f0acd3af). Le bouton « Relancer » de l'app
// le dit au lieu de relancer.
//   node scripts/lbc-relance-identique-selftest.mjs
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let ko = 0;
const v = (ok, nom, detail = "") => {
  if (ok) console.log(`  ✓ ${nom}`);
  else { ko++; console.error(`  ✗ ${nom}${detail ? `\n      ${String(detail).slice(0, 400)}` : ""}`); }
};
const imp = async (rel) => { try { return await import(pathToFileURL(join(ROOT, rel)).href); } catch (e) { console.error(`  (${rel} : ${String(e?.message ?? e).slice(0, 120)})`); return null; } };
const R = await imp("src/utils/relanceRefusLbc.js");
const E = await imp("src/utils/empreinteContenu.js");
const D = await imp("supabase/functions/_shared/description-leboncoin.ts");
const fixtures = JSON.parse(readFileSync(join(ROOT, "scripts/fixtures/lbc-relance-identique-1311.json"), "utf8"));
const ikksTexte = readFileSync(join(ROOT, "scripts/fixtures/description-lbc-1311-f0acd3af-haut.txt"), "utf8").replace(/\r\n/g, "\n");
const clone = (x) => JSON.parse(JSON.stringify(x));

// Ce que get-pending-jobs calcule pour une tâche servie : empreinte du SERVI (titre et texte nettoyés) et du BRUT.
const servi = (j) => {
  const pf = j.platform_fields ?? {};
  const t = D.nettoyerTitreLeboncoin(j.title);
  const d = D.nettoyerDescriptionLeboncoin(j.description, { titre: j.title, marque: pf.marque ?? "", etat: pf.etat ?? "", taille: pf.taille ?? "" });
  return { ...j, title: t.titre, description: d.texte, _texteInchange: !t.modifie && !d.modifiee };
};
const candidatDe = (j) => {
  const s = servi(j);
  return { job: j, servie: E?.empreinteEnvoiLbcDuJob?.(s) ?? null, brute: E?.empreinteEnvoiLbcDuJob?.(j) ?? null, texteInchange: s._texteInchange };
};
const ligneDe = (j) => ({ job: j, texteInchange: servi(j)._texteInchange });
// Avant le correctif : aucune garde — la relance à l'identique part.
const juger = (cand, lignes) => (R?.refusLbcIdentique ? R.refusLbcIdentique(cand, lignes) : null);

const refuse137 = fixtures["137ea70c"];
const copie5ad = fixtures["5adbc272"];

console.log("▸ cas réel 229c7b07 — la copie 5adbc272 de 137ea70c (refusé le 11/11 06:04), relancée à l'identique le 11/11 09:56");
{
  const copie = clone(copie5ad);
  copie.status = "pending"; delete copie.platform_fields.depot_jamais_en_ligne; copie.platform_listing_id = null; copie.published_at = null;
  const r = juger(candidatDe(copie), [ligneDe(refuse137)]);
  v(r?.refuse === refuse137.id, "retenue : même contenu que le dépôt refusé 137ea70c (3306058262)", JSON.stringify(r));
  v(r?.par === "contenu" && r?.numero === "3306058262", "refus d'avant la règle : le contenu brut fait foi (texte servi tel quel)", JSON.stringify(r));
}
console.log("▸ cas réel 229c7b07 — 137ea70c relancé tel quel (« Relancer » : même ligne, relance_apres_depot_mort)");
{
  const j = clone(refuse137);
  j.status = "pending";
  j.platform_fields.relance_apres_depot_mort = { le: "2026-11-11T09:00:00Z", identifiant: "3306058262", issue: "refus_moderation_probable", constat: j.platform_fields.depot_jamais_en_ligne };
  delete j.platform_fields.depot_jamais_en_ligne;
  const r = juger(candidatDe(j), []);
  v(r?.refuse === j.id && r?.numero === "3306058262", "retenue : sa propre annonce refusée, même contenu", JSON.stringify(r));
}
console.log("▸ cas réel f0acd3af — IKKS (refusé pour 9 mots-clés servis) : la règle des cinq mots-clés a changé ce qui part");
{
  const refuseIkks = clone(fixtures["ae8d7ec6"]); refuseIkks.description = ikksTexte;
  const j = clone(refuseIkks); j.status = "pending"; j.id = "relance-ikks";
  delete j.platform_fields.depot_jamais_en_ligne;
  const r = juger(candidatDe(j), [ligneDe(refuseIkks)]);
  v(r === null && R !== null, "servie : son texte servi aujourd'hui n'est plus celui du refus (5 mots-clés au lieu de 9)", JSON.stringify(r));
}
console.log("▸ après la règle : l'empreinte du SERVI notée au dépôt fait foi");
if (R && E) {
  const refuse = clone(refuse137);
  const servieRefus = candidatDe(refuse137).servie;
  refuse.platform_fields.lbc_envois = [{ le: "2026-11-10T05:39:00Z", servie: servieRefus, brute: candidatDe(refuse137).brute, regles: R.REGLES_TEXTE_LBC }];
  const meme = clone(refuse137); meme.id = "nouvelle-publi"; meme.status = "pending"; meme.platform_fields = clone(copie5ad.platform_fields);
  delete meme.platform_fields.depot_jamais_en_ligne; delete meme.platform_fields.relance_apres_depot_mort; delete meme.platform_fields.relance_copie_de;
  const r1 = juger(candidatDe(meme), [ligneDe(refuse)]);
  v(r1?.par === "envoi" && r1?.refuse === refuse.id, "même envoi (texte, photos, prix, catégorie, attributs) : retenue", JSON.stringify(r1));
  const prix = clone(meme); prix.price = "27.50";
  v(juger(candidatDe(prix), [ligneDe(refuse)]) === null, "prix changé : servie");
  const photos = clone(meme); photos.photos = [photos.photos[1], photos.photos[0]];
  v(juger(candidatDe(photos), [ligneDe(refuse)]) === null, "photos changées (autre première photo) : servie");
  const cat = clone(meme); cat.platform_fields.lbcCategoryPath = ["Loisirs", "Jeux & Jouets"];
  v(juger(candidatDe(cat), [ligneDe(refuse)]) === null, "catégorie changée : servie");
  const attr = clone(meme); attr.platform_fields.lbcAspects = { ...attr.platform_fields.lbcAspects, condition: "Bon état" };
  v(juger(candidatDe(attr), [ligneDe(refuse)]) === null, "attribut changé (état) : servie");
  const texte = clone(meme); texte.description = `${texte.description}\nCarte sous protection, envoi suivi.`;
  v(juger(candidatDe(texte), [ligneDe(refuse)]) === null, "texte changé : servie");
  const espaces = clone(meme); espaces.description = `  ${espaces.description.replace(/ /g, "  ")}  `;
  v(juger(candidatDe(espaces), [ligneDe(refuse)])?.refuse === refuse.id, "des espaces de plus ne changent pas l'annonce : retenue");
  // L'entrée notée APRÈS le refus (un envoi suivant) ne décrit pas le dépôt refusé.
  const tard = clone(refuse); tard.platform_fields.lbc_envois = [{ le: "2026-11-12T08:00:00Z", servie: "l1:autre", brute: "l1:autre", regles: R.REGLES_TEXTE_LBC }];
  v(juger(candidatDe(meme), [ligneDe(tard)])?.par === "contenu", "envoi noté après le refus : ignoré, le contenu brut décide (ancien refus)");
  // Une ligne refusée puis relancée, acceptée et VUE en ligne : son refus ne compte plus.
  const vue = clone(refuse); vue.status = "published"; vue.vu_en_ligne_le = "2026-11-12T10:00:00Z";
  vue.platform_fields.relance_apres_depot_mort = { le: "2026-11-11T09:00:00Z", issue: "refus_moderation_probable", constat: vue.platform_fields.depot_jamais_en_ligne };
  delete vue.platform_fields.depot_jamais_en_ligne;
  v(juger(candidatDe(meme), [ligneDe(vue)]) === null, "relancée, acceptée et vue en ligne depuis : le refus ne retient plus");
  // Une autre fiche : jamais.
  const autre = clone(refuse); autre.inventaire_id = "1793030096012";
  v(juger(candidatDe(meme), [ligneDe(autre)]) === null, "un refus d'une AUTRE fiche ne retient jamais (jamais sur un titre)");
  // Remise en vente : la règle A s'en charge (annonce vendue encore affichée).
  const remise = clone(meme); remise.platform_fields.remise_en_vente = { annonce_vendue: "3306058262" };
  v(juger(candidatDe(remise), [ligneDe(refuse)]) === null, "remise en vente : jamais retenue ici (règle A)");
  // Republication : son contenu est celui de l'annonce en ligne, que Leboncoin a acceptée.
  const repub = clone(meme); repub.action = "republish";
  v(juger(candidatDe(repub), [ligneDe(refuse)]) === null, "republication : jamais retenue ici");

  console.log("▸ la retenue écrite et le bouton « Relancer » de l'app");
  const verdict = juger(candidatDe(meme), [ligneDe(refuse)]);
  const p = R.patchRetenueRefusLbc(meme, verdict, { brute: candidatDe(meme).brute, servie: candidatDe(meme).servie, maintenant: Date.parse("2026-11-13T12:00:00Z") });
  v(p.status === "needs_user" && p.platform_fields.needs_user_source === "refus_lbc_meme_contenu", "needs_user « refus_lbc_meme_contenu »", JSON.stringify(p).slice(0, 300));
  v(/Leboncoin a refusé cette annonce/.test(p.error) && /Modifie d'abord l'annonce/.test(p.error) && /Rien n'a été envoyé à Leboncoin/.test(p.error),
    "le message dit le refus, l'invite à modifier, et que rien n'est parti", p.error);
  v(p.platform_fields.refus_lbc_meme_contenu?.refuse === refuse.id && p.platform_fields.refus_lbc_meme_contenu?.brute === candidatDe(meme).brute, "la trace garde le dépôt refusé et l'empreinte");
  const tenue = { ...meme, status: "needs_user", error: p.error, platform_fields: p.platform_fields };
  v(R.relanceRefusLbc(tenue)?.verdict === "meme_contenu", "app : la tâche retenue, inchangée → « Modifie d'abord l'annonce », pas de relance");
  const tenueChangee = clone(tenue); tenueChangee.price = "25";
  v(R.relanceRefusLbc(tenueChangee)?.verdict === "contenu_modifie", "app : contenu changé → relance permise");
  const echoue = clone(refuse);
  v(R.relanceRefusLbc(echoue)?.verdict === "meme_contenu", "app : le dépôt refusé (empreinte notée) relancé tel quel → bloqué au bouton");
  const reglesVieilles = clone(refuse); reglesVieilles.platform_fields.lbc_envois[0].regles = "lbc-texte-ancien";
  v(R.relanceRefusLbc(reglesVieilles) === null, "app : règles du texte changées depuis le dépôt → le serveur décide (le bouton relance)");
  v(R.relanceRefusLbc(clone(refuse137)) === null, "app : refus d'avant la règle (rien de noté) → le serveur décide");
  const lite = clone(refuse); delete lite.description;
  v(R.relanceRefusLbc(lite)?.verdict === "a_verifier", "app : liste sans le texte → relire la tâche avant de conclure");
  v(R.MESSAGE_BOUTON_REFUS_LBC.fr.startsWith("Modifie d'abord l'annonce") && R.MESSAGE_BOUTON_REFUS_LBC.en.startsWith("Change the listing first"), "texte du bouton FR/EN");
  const { traduireMessageServeur } = await import(pathToFileURL(join(ROOT, "src/utils/messagesServeur.js")).href);
  v(traduireMessageServeur(p.error, "en") === R.messageRefusLbcMemeContenu("en"), "le message de la retenue lu en anglais", traduireMessageServeur(p.error, "en"));

  console.log("▸ l'empreinte notée au service : une écriture seulement quand elle change");
  const pf0 = {};
  const e1 = { le: "2026-11-13T10:00:00Z", servie: "l1:a", brute: "l1:b", regles: R.REGLES_TEXTE_LBC };
  const l1 = R.envoisLbcApres(pf0, e1);
  v(Array.isArray(l1) && l1.length === 1, "premier envoi noté");
  v(R.envoisLbcApres({ lbc_envois: l1 }, { ...e1, le: "2026-11-13T11:00:00Z" }) === null, "même envoi : rien à écrire");
  let pfN = { lbc_envois: l1 };
  for (let i = 0; i < 8; i++) pfN = { lbc_envois: R.envoisLbcApres(pfN, { ...e1, servie: `l1:${i}`, le: `2026-11-13T12:0${i}:00Z` }) };
  v(pfN.lbc_envois.length === R.MAX_ENVOIS_LBC, `au plus ${R.MAX_ENVOIS_LBC} envois gardés`);
} else {
  v(false, "après la règle : l'empreinte du servi notée au dépôt fait foi", "modules absents");
}

console.log("▸ les règles du texte servi sont celles que l'empreinte nomme (verrou de version)");
{
  // Changer description-leboncoin.ts change ce qui part : REGLES_TEXTE_LBC doit changer avec (sinon le bouton de l'app
  // bloquerait une relance que le nettoyage nouveau ferait partir autrement). Mettre à jour les deux ensemble.
  const md5 = createHash("md5").update(readFileSync(join(ROOT, "supabase/functions/_shared/description-leboncoin.ts"), "utf8").replace(/\r\n/g, "\n")).digest("hex");
  v(R?.SOURCES_REGLES_TEXTE_LBC?.[R?.REGLES_TEXTE_LBC] === md5, `REGLES_TEXTE_LBC (${R?.REGLES_TEXTE_LBC}) correspond au fichier des règles (md5 ${md5})`,
    JSON.stringify(R?.SOURCES_REGLES_TEXTE_LBC ?? null));
}

console.log("▸ get-pending-jobs : la garde est branchée, avant la réservation ; l'envoi est noté après");
{
  const src = readFileSync(join(ROOT, "supabase/functions/get-pending-jobs/index.ts"), "utf8");
  const iGarde = src.indexOf("refusLbcIdentique(");
  const iResa = src.indexOf('admin.rpc("reserver_jobs_extension"');
  const iNote = src.indexOf("envoisLbcApres(");
  v(/from "\.\.\/\.\.\/\.\.\/src\/utils\/relanceRefusLbc\.js"/.test(src) && iGarde > 0, "le module de l'app est importé et appelé (une seule règle)");
  v(iGarde > 0 && iGarde < iResa, "jugée AVANT la réservation");
  v(iNote > iResa, "l'empreinte de l'envoi notée APRÈS la réservation (seulement ce qui part)");
  v(/depot_jamais_en_ligne->>issue\.eq\.refus_moderation_probable/.test(src), "les dépôts refusés de la fiche lus par leur marque");
}
console.log("▸ app : le bouton « Relancer » le dit au lieu de relancer");
{
  const st = readFileSync(join(ROOT, "src/tabs/StockTab.jsx"), "utf8");
  v(/relanceRefusLbc/.test(st) && /MESSAGE_BOUTON_REFUS_LBC/.test(st), "StockTab lit le verdict et montre le texte du bouton");
  v(/memeContenuLbc/.test(st), "le bouton est désactivé quand le contenu est le même");
}

console.log(ko ? `\n✗ ${ko} échec(s)` : "\n✓ lbc-relance-identique : tout est vert");
process.exit(ko ? 1 : 0);
