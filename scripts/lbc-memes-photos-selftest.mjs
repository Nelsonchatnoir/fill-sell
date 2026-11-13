// ═══════════════════════════════════════════════════════════════════════════
// VERROU — LEBONCOIN : UNE PUBLICATION AUX PHOTOS D'UNE ANNONCE DÉJÀ EN LIGNE SUR LE COMPTE EST RETENUE
// (13/11/2026, lot du 13/11 — 3e réponse de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Décision de Nico (13/11) : « Publication aux mêmes photos qu'une annonce déjà en ligne sur le compte : on la retient,
// avec un message clair (« Une annonce avec ces photos est déjà en ligne sur Leboncoin »). Rien n'est envoyé à
// Leboncoin. »
// LES CAS RÉELS (relus en prod le 13/11, lecture seule ; famille 2 du rapport LBC du 13/11) :
//   · compte cfdfda6f, « Support imprimante » : trois fiches aux MÊMES fichiers photo (rehosted/1794133606303013/…). La
//     première en ligne (3304507326) ; job 8a7af114 (fiche 1794493480983) déposé le 12/11 à 15:27 → ACCEPTÉ, en ligne
//     (3307925904) ; job f181149a (fiche 1794493474439) à 15:29, deux jumelles en ligne → REFUSÉ. Même chose pour le lustre
//     (bf94a937) et l'écran (76d55115) ; job e5337ed2 (Wallbox, fiche 1794493223968), relancé le 13/11 à 10:28 alors que
//     deux annonces aux mêmes fichiers sont en ligne (3298541604, 3307267675) ;
//   · compte f44b5917, job 7f81d77f (fiche 1793387069063, 12 photos) : les 6 photos de 3273048001 et les 6 de 3280282374,
//     toutes deux en ligne — refusé le 07/11 ;
//   · compte bf85d176, clavier (fiche 1794494010078017 née du dressing, question « Est-ce le même article ? » ouverte à
//     15:40 avec 1790174130756, en ligne 3272015849) : fichiers différents, MÊMES empreintes — refusé le 12/11.
// MESURE (13/11, dépôts publiés depuis le 01/11 sur ces comptes, jumelles d'autres fiches en ligne AU DÉPÔT) : 0 jumelle
// → 528 en ligne / 1 refus ; 1 → 14 en ligne / 1 refus (compte de test) ; 2 → 0 en ligne / 4 refus. Leboncoin accepte la
// deuxième annonce aux mêmes photos et refuse la troisième : SEUIL_ANNONCES_MEMES_FICHIERS = 2 (la décision de Nico au
// mot = 1, une ligne, vérifiée ci-dessous) ; une paire posée par le moteur retient dès la première.
// LA RÈGLE (tous comptes, get-pending-jobs, toutes versions d'extension et le Cloud) : une publication ou republication
// Leboncoin dont les photos sont celles d'annonces Leboncoin du compte EN LIGNE (ou déposées et pas encore relevées)
// portées par d'AUTRES fiches — même fichier, ou même empreinte quand le moteur a posé la paire — est retenue au seuil :
// needs_user « lbc_memes_photos », le message de Nico, hors quota, rien envoyé. Jamais pour la même fiche (la
// republication remplace son annonce), deux exemplaires déclarés (quantité > 1, « Non » répondu), une annonce prise par
// une vente, une republication dont le retrait est engagé ; jamais sur un titre ; une photo commune sur trois (bandeau de
// boutique) n'est pas « les mêmes photos ».
//   node scripts/lbc-memes-photos-selftest.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let ko = 0;
const v = (ok, nom, detail = "") => {
  if (ok) console.log(`  ✓ ${nom}`);
  else { ko++; console.error(`  ✗ ${nom}${detail ? `\n      ${String(detail).slice(0, 400)}` : ""}`); }
};

let M = null;
try {
  M = await import(pathToFileURL(join(ROOT, "supabase/functions/_shared/lbc-memes-photos.js")).href);
} catch (e) {
  console.error(`  (module _shared/lbc-memes-photos.js absent : ${String(e?.message ?? e).slice(0, 120)})`);
}
// Avant le correctif : aucune garde — chaque publication est SERVIE (envoyée à Leboncoin).
const juger = (candidats, donnees) => (M ? M.jugerMemesPhotosLbc(candidats, donnees) : new Map());

const S = "https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos";
const ph = (compte, chemin, n, type = true) => Array.from({ length: n }, (_, i) =>
  (type ? { type: i ? `photo_${i}` : "original", url: `${S}/${compte}/${chemin}_${i}.jpg` } : `${S}/${compte}/${chemin}_${i}.jpg`));
const lbcJob = (o) => ({ platform: "leboncoin", action: "publish", status: "pending", platform_fields: {}, ...o });

// ── cfdfda6f : les fiches réelles et leurs annonces (relues le 13/11) ──────
const CF_A1 = "1794133606303013";   // « Support imprimante » d'origine, en ligne 3304507326
const CF_A1bis = "1794493480983";   // 2e fiche aux mêmes fichiers : job 8a7af114, 12/11 15:27, ACCEPTÉE (3307925904)
const CF_B1 = "1794493474439";      // 3e fiche : job f181149a, 12/11 15:29, REFUSÉE
const CF_W = "1794133608230002", CF_WB = "1794493223968"; // Wallbox : 3298541604 et 3307267675 en ligne ; job e5337ed2
const cfPhotos1 = ph("cfdfda6f", `rehosted/${CF_A1}/1794135122101`, 3);
const cfPhotosW = ph("cfdfda6f", `rehosted/${CF_W}/1794297299732`, 4);
const occ = (numero, fiche, photos, etat = "en_ligne") => ({ cle: numero, numero, fiche, etat, photos });
const cfDonnees = () => ({
  occupants: [occ("3304507326", CF_A1, cfPhotos1), occ("3307925904", CF_A1bis, cfPhotos1), occ("3298541604", CF_W, cfPhotosW), occ("3307267675", CF_W, cfPhotosW)],
  quantites: new Map([[CF_A1, 1], [CF_A1bis, 1], [CF_B1, 1], [CF_W, 1], [CF_WB, 1]]),
});

console.log("▸ seuil mesuré : retenue à partir de DEUX annonces en ligne aux mêmes fichiers (la décision au mot = 1, une ligne)");
v(M?.SEUIL_ANNONCES_MEMES_FICHIERS === 2 && M?.SEUIL_PAIRE_DU_MOTEUR === 1, "SEUIL_ANNONCES_MEMES_FICHIERS = 2, SEUIL_PAIRE_DU_MOTEUR = 1", JSON.stringify([M?.SEUIL_ANNONCES_MEMES_FICHIERS, M?.SEUIL_PAIRE_DU_MOTEUR]));
console.log("▸ cas réel cfdfda6f / f181149a — 3e « Support imprimante » : deux annonces aux mêmes 3 fichiers en ligne (refusé le 12/11)");
{
  const j = lbcJob({ id: "f181149a-cas-reel", inventaire_id: CF_B1, photos: cfPhotos1 });
  const r = juger([j], cfDonnees()).get(j.id);
  v(r?.retenir === true && !r.silencieux, "retenue (needs_user), jamais envoyée à Leboncoin", JSON.stringify(r));
  v(r?.jumelles === 2 && r?.numeros?.join(",") === "3304507326,3307925904", "les deux annonces en ligne nommées : 3304507326, 3307925904", JSON.stringify(r));
  v(r?.preuve === "fichier" && r?.n === 3 && r?.k === 3, "preuve : les 3 mêmes fichiers (3 sur 3)", JSON.stringify(r));
}
console.log("▸ cas réel cfdfda6f / 8a7af114 — 2e « Support imprimante » : une seule jumelle en ligne (ACCEPTÉ par Leboncoin le 12/11)");
{
  const j = lbcJob({ id: "8a7af114-cas-reel", inventaire_id: CF_A1bis, photos: cfPhotos1 });
  const d = cfDonnees(); d.occupants = d.occupants.filter((o) => o.numero !== "3307925904");
  v(M !== null && !juger([j], d).get(j.id), "servie : Leboncoin accepte la deuxième annonce aux mêmes photos (13 sur 13 chez cfdfda6f)");
  const r1 = M ? M.jugerMemesPhotosLbc([j], { ...d, seuil: 1 }).get(j.id) : null;
  v(r1?.retenir === true && r1?.numero === "3304507326", "avec la décision au mot (seuil 1) : retenue — la ligne à changer si Nico le confirme", JSON.stringify(r1));
}
console.log("▸ cas réel cfdfda6f / e5337ed2 — Wallbox relancée le 13/11 à 10:28 : 3298541604 et 3307267675 en ligne aux mêmes 4 fichiers");
{
  const j = lbcJob({ id: "e5337ed2-cas-reel", inventaire_id: CF_WB, photos: cfPhotosW });
  const r = juger([j], cfDonnees()).get(j.id);
  v(r?.retenir === true && r?.jumelles === 2 && r?.n === 4, "retenue : 4 photos sur 4, deux annonces (d'une même fiche) en ligne", JSON.stringify(r));
}
console.log("▸ cas réel f44b5917 / 7f81d77f — lot de 12 photos : les 6 de 3273048001 et les 6 de 3280282374, en ligne (refusé le 07/11)");
{
  const A = "1793009407689010", A2 = "1793009407689004";
  const photosA = ph("f44b5917", `rehosted/${A}/1793011078065`, 6);
  const photosA2 = ph("f44b5917", `rehosted/${A2}/1793011101590`, 6);
  const j = lbcJob({ id: "7f81d77f-cas-reel", inventaire_id: "1793387069063", photos: [...photosA, ...photosA2] });
  const r = juger([j], { occupants: [occ("3273048001", A, photosA), occ("3280282374", A2, photosA2)], quantites: new Map() }).get(j.id);
  v(r?.retenir === true && r?.k === 6 && r?.n === 6 && r?.jumelles === 2, "retenue : deux annonces dont les 6 photos sont dans le lot", JSON.stringify(r));
}
console.log("▸ cas réel bf85d176 — clavier : fichiers différents, mêmes empreintes, question « Est-ce le même article ? » ouverte");
{
  const A = "1790174130756", B = "1794494010078017";
  const photosA = ph("bf85d176", `rapatrie-fiche/${A}/1790183160732`, 3);
  const photosB = ph("bf85d176", `rehosted/${B}/1794494828176`, 3);
  // Empreintes relues en prod le 13/11 (photo_empreintes) : dHash identiques, pHash à 0, 0 et 2 bits.
  const D = ["1111101111111001000010110011111100011111001110110010010100111001", "0000011100001111000111110001111100000111000011111011111010111000", "1011100111011101110111011100110111001101111101011011010011110010"];
  const PA = ["1011101011000001100000000011111000101011001111100011011111010100", "1111101001111010100001011100000011010101100000010111111010000101", "1001001001110011110011001100110001100011110011000011110010010011"];
  const PB = [PA[0], PA[1], "1001001001110011110011001100110001100111010011000011110010010011"];
  const empreintes = new Map([
    ...photosA.map((p, i) => [p.url, { dhash: D[i], phash: PA[i] }]),
    ...photosB.map((p, i) => [p.url, { dhash: D[i], phash: PB[i] }]),
  ]);
  const j = lbcJob({ id: "clavier-bf85d176", inventaire_id: B, photos: photosB });
  const pairesMoteur = new Set([[A, B].sort().join(":")]);
  const r = juger([j], { occupants: [occ("3272015849", A, photosA)], empreintes, pairesMoteur, quantites: new Map() }).get(j.id);
  v(r?.retenir === true && r?.preuve === "empreinte" && r?.n === 3, "retenue dès la première annonce : 3 photos sur 3 aux mêmes empreintes, paire du moteur", JSON.stringify(r));
  // Sans question du moteur, des empreintes seules ne sont pas lues (le serveur ne les cherche que pour une paire posée).
  if (M) {
    const m = M.memesPhotos(photosB, photosA, { empreintes: new Map() });
    v(m.identiques === false, "sans empreintes lues, deux fichiers différents ne sont jamais « les mêmes »", JSON.stringify(m));
  } else v(false, "sans empreintes lues, deux fichiers différents ne sont jamais « les mêmes »", "module absent");
}

console.log("▸ même passage : la 2e jumelle part (acceptée), la 3e attend sans écriture ; une jumelle en ligne + une en cours : attente");
{
  const a = lbcJob({ id: "jumelle-1", inventaire_id: CF_A1, photos: cfPhotos1 });
  const b = lbcJob({ id: "jumelle-2", inventaire_id: CF_A1bis, photos: cfPhotos1 });
  const c = lbcJob({ id: "jumelle-3", inventaire_id: CF_B1, photos: cfPhotos1 });
  const res = juger([a, b, c], { occupants: [], quantites: new Map() });
  v(M !== null && !res.get(a.id) && !res.get(b.id), "la première et la deuxième sont servies", JSON.stringify([...res]));
  v(res.get(c.id)?.retenir === true && res.get(c.id)?.silencieux === true, "la troisième : pas servie ce passage, rien écrit (jugée au suivant)", JSON.stringify(res.get(c.id)));
  // Une fiche publiée dans ce passage (republication de son annonce) reste la jumelle des AUTRES publications.
  const repA = lbcJob({ id: "repub-a1", action: "republish", inventaire_id: CF_A1, platform_listing_id: "3304507326", photos: cfPhotos1 });
  const pubB = lbcJob({ id: "publi-b1", inventaire_id: CF_B1, photos: cfPhotos1 });
  const resAB = juger([repA, pubB], { occupants: [occ("3304507326", CF_A1, cfPhotos1), occ("3307925904", CF_A1bis, cfPhotos1)], quantites: new Map() });
  v(M !== null && !resAB.get(repA.id) && resAB.get(pubB.id)?.retenir === true && resAB.get(pubB.id)?.jumelles === 2,
    "la republication de la 1re part (une seule autre jumelle) ; la 3e copie, publiée au même passage, est retenue", JSON.stringify([...resAB]));
  const x = lbcJob({ id: "apres-depot", inventaire_id: CF_B1, photos: cfPhotos1 });
  const enCours = juger([x], { occupants: [occ("3304507326", CF_A1, cfPhotos1), { cle: "job-a", numero: null, fiche: CF_A1bis, etat: "en_cours", photos: cfPhotos1 }] }).get(x.id);
  v(enCours?.retenir === true && enCours?.silencieux === true, "une en ligne + une en cours de dépôt : attente silencieuse", JSON.stringify(enCours));
  const publie = juger([x], { occupants: [occ("3304507326", CF_A1, cfPhotos1), occ("3307925904", CF_A1bis, cfPhotos1, "publie")] }).get(x.id);
  v(publie?.retenir === true && !publie?.silencieux, "une en ligne + une publiée il y a 2 min, pas encore relevée (le 12/11 15:27 → 15:29) : retenue dite", JSON.stringify(publie));
}

console.log("▸ jamais retenue : ce qui n'est pas « d'autres annonces aux mêmes photos »");
{
  const base = () => cfDonnees();
  const S1 = (d) => ({ ...d, seuil: 1 }); // au seuil le plus strict : les exemptions tiennent quand même
  // (1) la republication de la MÊME annonce (même fiche) : elle remplace l'ancienne.
  const rep = lbcJob({ id: "repub", action: "republish", inventaire_id: CF_A1, platform_listing_id: "3304507326", photos: cfPhotos1 });
  const seule = { occupants: [occ("3304507326", CF_A1, cfPhotos1)], quantites: new Map() };
  v(M !== null && !M.jugerMemesPhotosLbc([rep], S1(seule)).get(rep.id), "republication de la même annonce (même fiche, son propre numéro)");
  // (1b) la remise en vente vise l'annonce vendue de sa fiche.
  const remise = lbcJob({ id: "remise", inventaire_id: CF_A1, photos: cfPhotos1, platform_fields: { remise_en_vente: { annonce_vendue: "3304507326" } } });
  v(M !== null && !M.jugerMemesPhotosLbc([remise], S1(seule)).get(remise.id), "remise en vente de la fiche (son annonce vendue)");
  // (2) deux exemplaires déclarés : quantité > 1 sur la fiche publiée, ou sur les fiches en ligne.
  const q = base(); q.quantites.set(CF_B1, 2);
  v(M !== null && !juger([lbcJob({ id: "q2", inventaire_id: CF_B1, photos: cfPhotos1 })], q).get("q2"), "quantité 2 sur la fiche publiée (deux exemplaires)");
  const qa = base(); qa.quantites.set(CF_A1, 3); qa.quantites.set(CF_A1bis, 2);
  v(M !== null && !juger([lbcJob({ id: "q3", inventaire_id: CF_B1, photos: cfPhotos1 })], qa).get("q3"), "quantité > 1 sur les fiches en ligne");
  // (3) « Non, ce n'est pas le même » répondu (inventaire_doublons « refusee ») sur les paires.
  const non = { ...base(), pairesNon: new Set([[CF_A1, CF_B1].sort().join(":"), [CF_A1bis, CF_B1].sort().join(":")]) };
  v(M !== null && !juger([lbcJob({ id: "non", inventaire_id: CF_B1, photos: cfPhotos1 })], non).get("non"), "« Non, deux exemplaires » répondu sur les paires");
  // (4) une photo commune sur trois (bandeau de boutique) : pas « les mêmes photos ».
  const bandeau = `${S}/cfdfda6f/bandeau-boutique.jpg`;
  const B4 = [...ph("cfdfda6f", "rehosted/111/1", 2), { type: "photo_2", url: bandeau }];
  const A4 = [...ph("cfdfda6f", "rehosted/222/2", 2), { type: "photo_2", url: bandeau }];
  const A5 = [...ph("cfdfda6f", "rehosted/333/3", 2), { type: "photo_2", url: bandeau }];
  v(M !== null && !M.jugerMemesPhotosLbc([lbcJob({ id: "bandeau", inventaire_id: "111", photos: B4 })], { occupants: [occ("1", "222", A4), occ("2", "333", A5)], seuil: 1 }).get("bandeau"),
    "un bandeau commun (1 photo sur 3) ne retient rien");
  // (5) les annonces en ligne sont prises par une vente (transaction lue « pending ») : plus « en ligne ».
  const vendue = { ...base(), occupants: base().occupants.map((o) => ({ ...o, priseParUneVente: true })) };
  v(M !== null && !juger([lbcJob({ id: "vendue", inventaire_id: CF_B1, photos: cfPhotos1 })], vendue).get("vendue"), "annonces jumelles sous transaction (vendues)");
  // (6) une republication dont le retrait est déjà engagé : on ne laisse pas l'article hors ligne.
  const engagee = lbcJob({ id: "engagee", action: "republish", inventaire_id: CF_B1, platform_listing_id: "999", photos: cfPhotos1, platform_fields: { republish_step: "deleted" } });
  v(M !== null && !juger([engagee], { ...base(), retraitEngage: (j) => j.platform_fields?.republish_step === "deleted" }).get("engagee"), "republication au retrait engagé (annonce déjà retirée)");
  // (7) une autre plateforme, un retrait : jamais lus.
  v(M !== null && !juger([lbcJob({ id: "vinted", platform: "vinted", inventaire_id: CF_B1, photos: cfPhotos1 })], base()).get("vinted"), "une publication Vinted n'est pas lue");
  v(M !== null && !juger([lbcJob({ id: "del", action: "delete", inventaire_id: CF_B1, photos: cfPhotos1 })], base()).get("del"), "un retrait n'est jamais retenu");
  // (8) le TITRE seul ne compte jamais : mêmes titres, photos différentes.
  v(M !== null && !M.jugerMemesPhotosLbc([lbcJob({ id: "titre", title: "Support imprimante", inventaire_id: CF_B1, photos: ph("cfdfda6f", "rehosted/autre/9", 3) })], S1(base())).get("titre"), "même titre, autres photos : servie");
}

console.log("▸ la retenue écrite : needs_user, message de Nico, hors quota ; levée du quota au départ");
if (M) {
  const j = lbcJob({ id: "f181149a", inventaire_id: CF_B1, photos: cfPhotos1, platform_fields: { processing_since: "x", lbcCategoryPath: ["Maison"] } });
  const verdict = juger([j], cfDonnees()).get(j.id);
  const p = M.patchRetenueMemesPhotos(j, verdict, { maintenant: Date.parse("2026-11-13T12:00:00Z") });
  v(p.status === "needs_user" && p.platform_fields.needs_user_source === M.SOURCE_LBC_MEMES_PHOTOS && M.SOURCE_LBC_MEMES_PHOTOS === "lbc_memes_photos", "needs_user « lbc_memes_photos »", JSON.stringify(p));
  v(p.error.startsWith("Une annonce avec ces photos est déjà en ligne sur Leboncoin"), "le message commence par la phrase de Nico, mot pour mot", p.error);
  v(/n° 3304507326, n° 3307925904/.test(p.error) && /Rien n'a été envoyé à Leboncoin/.test(p.error), "il nomme les annonces et dit que rien n'est parti", p.error);
  v(p.platform_fields.hors_quota?.motif === "lbc_memes_photos", "hors quota pendant la retenue (publications_du_cycle l'ignore)", JSON.stringify(p.platform_fields.hors_quota));
  v(!("processing_since" in p.platform_fields) && p.platform_fields.lbcCategoryPath?.[0] === "Maison", "rien d'autre ne change sur la tâche");
  v(p.platform_fields.lbc_memes_photos?.numero === "3304507326" && p.platform_fields.lbc_memes_photos?.fiche === CF_A1, "la trace dit quelle annonce et quelle fiche");
  const pfLeve = M.leverHorsQuotaMemesPhotos(p.platform_fields);
  v(pfLeve && !("hors_quota" in pfLeve), "au départ (photos changées, jumelle partie) : la publication compte de nouveau");
  v(M.leverHorsQuotaMemesPhotos({ hors_quota: true }) === null && M.leverHorsQuotaMemesPhotos({}) === null, "un autre hors_quota n'est jamais levé ; rien à lever = rien à écrire");
  const en = M.messageLbcMemesPhotos(["3304507326", "3307925904"], "en");
  v(en.startsWith("A listing with these photos is already live on Leboncoin"), "anglais", en);
  const { traduireMessageServeur } = await import(pathToFileURL(join(ROOT, "src/utils/messagesServeur.js")).href);
  v(traduireMessageServeur(p.error, "en") === en, "l'app le lit en anglais (messagesServeur)", traduireMessageServeur(p.error, "en"));
} else {
  v(false, "la retenue écrite (needs_user, message de Nico, hors quota)", "module absent");
}

console.log("▸ get-pending-jobs : la garde est branchée, en exécution seulement, avant la réservation");
{
  const src = readFileSync(join(ROOT, "supabase/functions/get-pending-jobs/index.ts"), "utf8");
  const iGarde = src.indexOf("jugerMemesPhotosLbc(");
  const iResa = src.indexOf('admin.rpc("reserver_jobs_extension"');
  v(/from "\.\.\/_shared\/lbc-memes-photos\.js"/.test(src) && iGarde > 0, "le module est importé et appelé");
  v(iGarde > 0 && iResa > 0 && iGarde < iResa, "jugée AVANT la réservation (rien de réservé, rien d'envoyé)");
  const iBloc = src.indexOf("LEBONCOIN : RIEN N'EST ENVOYÉ QUE LEBONCOIN REFUSE À COUP SÛR");
  const bloc = iGarde > 0 && iBloc > 0 && iBloc < iGarde ? src.slice(iBloc, iGarde + 6000) : "";
  v(/!includeProcessing && !includeNeedsUser/.test(bloc), "exécution seulement (le popup reste une lecture)");
  v(/\.eq\("status", "pending"\)/.test(bloc) && /patchRetenueMemesPhotos/.test(bloc), "écriture en compare-and-set sur « pending »");
  v(/annonces_plateforme/.test(bloc) && /statut_plateforme === "en_ligne"/.test(bloc), "l'annonce en ligne lue au relevé du compte");
  // (13/11, coût mesuré) Jamais toutes les annonces ni la photo de chaque fiche : la base filtre par première photo.
  v(/"photos->0->>url", "photos->>0"/.test(bloc) && /\.in\(chemin, lot\)/.test(bloc) && !/statut_plateforme", "en_ligne"\)\.is\("disparu_le"/.test(bloc),
    "lectures bornées : les seules fiches dont la première photo est celle d'une publication (filtre de la base)");
  v(/leverHorsQuotaMemesPhotos/.test(src), "le hors quota de la retenue est levé quand la tâche part");
}

console.log(ko ? `\n✗ ${ko} échec(s)` : "\n✓ lbc-memes-photos : tout est vert");
process.exit(ko ? 1 : 0);
