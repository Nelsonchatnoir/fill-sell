// Selftest (30/10, urgence Louis + lot E partie A) : blocage Leboncoin du compte, navigateur réel dans les messages,
// étape « recreated » sans numéro, relance après mise à jour d'un autre défaut, arbre Vinted par compte.
//   npm run selftest:urgence-louis-3010
import {
  signeBlocageLbc, etatBlocageLbc, blocagePose, blocageLeve, blocageAvecEssai, blocageEssaiRefuse, messageBlocageLbc,
  ESSAI_APRES_MS, REPRISE_PRUDENTE_MS, ESPACEMENT_REPRISE_MS,
} from "../supabase/functions/_shared/blocage-leboncoin.js";
import { navigateurDeLaRequete, nomCourtSur, dansLeNavigateur, nommerLeNavigateur } from "../supabase/functions/_shared/navigateur-poste.js";
import { messageVerificationAntirobot, messageConnexionRequise, jugerMurGeste } from "../supabase/functions/_shared/mur-geste.js";
import { decisionRecreatedSansNumero, patchRecreatedSansNumero, etapeRecreatedSansNumero } from "../supabase/functions/_shared/etape-recreated-sans-numero.js";
import { regleDeRelance, champsRelance, RELANCES_APRES_MAJ } from "../supabase/functions/_shared/relance-apres-maj.js";
import { noeudVintedDuChemin, feuillesCandidates } from "../supabase/functions/_shared/rayon-refuse-moteur.js";
import { messageAttenteBoutique } from "../supabase/functions/_shared/attente-autre-boutique.js";
import { renduDuPoll, posteVirtuel, messagePosteVirtuelLbc } from "../supabase/functions/_shared/poste-virtuel.js";
import {
  annonceLbcAmputee, republicationPhotosOfferte, refusRepublicationPhotos, ligneRepublicationPhotos, republicationPhotosEnCours,
} from "../supabase/functions/_shared/photos-lbc-amputees.js";

let ok = 0, ko = 0;
const t = (cond, nom) => { if (cond) ok++; else { ko++; console.log("  ✗ " + nom); } };

// ── 1. Les signes de blocage Leboncoin ──
t(signeBlocageLbc("Accès temporairement restreint") === "acces_temporairement_restreint", "« Accès temporairement restreint »");
t(signeBlocageLbc("http_403") === "http_403", "http_403 (veille des commandes)");
t(signeBlocageLbc("Leboncoin a répondu HTTP 403") === "http_403", "HTTP 403");
t(signeBlocageLbc("CHALLENGE DATADOME : résoudre la vérification") === "datadome", "page DataDome");
t(signeBlocageLbc("Leboncoin te demande une vérification anti-robot : ouvre leboncoin.fr") === "verification_antirobot", "vérification anti-robot");
t(signeBlocageLbc("[incomplet] session leboncoin : page de connexion") === null, "page de connexion ≠ blocage");
t(signeBlocageLbc("annonce 3403123 publiée") === null, "un numéro qui contient 403 ≠ blocage");

// ── 2. Les états du blocage ──
const T0 = Date.parse("2026-10-30T18:00:00Z");
const iso = (ms) => new Date(ms).toISOString();
t(etatBlocageLbc({}, T0).etat === "libre", "sans blocage : libre");
const b1 = blocagePose({}, { signe: "http_403", source: "test", maintenant: iso(T0) });
const ps1 = { leboncoin: { blocage_acces: b1 } };
t(etatBlocageLbc(ps1, T0 + 60_000).etat === "bloque", "posé : bloqué");
t(etatBlocageLbc(ps1, T0 + ESSAI_APRES_MS - 1).etat === "bloque", "23 h 59 : toujours bloqué");
t(etatBlocageLbc(ps1, T0 + ESSAI_APRES_MS).etat === "essai", "24 h : un essai");
const bDemande = { ...b1, essai_demande_le: iso(T0 + 3600_000) };
t(etatBlocageLbc({ leboncoin: { blocage_acces: bDemande } }, T0 + 3600_000 + 1).etat === "essai", "« Leboncoin remarche » : un essai tout de suite");
const bEssai = blocageAvecEssai(b1, { jobId: "j1", maintenant: iso(T0 + ESSAI_APRES_MS) });
t(etatBlocageLbc({ leboncoin: { blocage_acces: bEssai } }, T0 + ESSAI_APRES_MS + 60_000).etat === "bloque", "essai servi : rien d'autre ne part");
t(etatBlocageLbc({ leboncoin: { blocage_acces: bEssai } }, T0 + ESSAI_APRES_MS + 3 * 3600_000).etat === "bloque", "essai muet 3 h : bloqué");
t(etatBlocageLbc({ leboncoin: { blocage_acces: bEssai } }, T0 + 2 * ESSAI_APRES_MS + 1).etat === "essai", "essai muet : nouvel essai 24 h après lui");
const bRef = blocageEssaiRefuse(bEssai, { signe: "http_403", maintenant: iso(T0 + ESSAI_APRES_MS + 600_000) });
t(etatBlocageLbc({ leboncoin: { blocage_acces: bRef } }, T0 + ESSAI_APRES_MS + 3600_000).etat === "bloque", "essai refusé : bloqué");
t(etatBlocageLbc({ leboncoin: { blocage_acces: bRef } }, T0 + 2 * ESSAI_APRES_MS + 600_000).etat === "essai", "essai refusé : nouvel essai 24 h plus tard");
const L = T0 + ESSAI_APRES_MS + 600_000;
const bLeve = blocageLeve(bEssai, { par: "test", maintenant: iso(L) });
const e1 = etatBlocageLbc({ leboncoin: { blocage_acces: bLeve } }, L + 1000);
t(e1.etat === "reprise" && e1.prete === true, "levé : reprise prudente, une action prête");
const bLeve2 = { ...bLeve, derniere_action_reprise: iso(L + 1000) };
t(etatBlocageLbc({ leboncoin: { blocage_acces: bLeve2 } }, L + 5 * 60_000).prete === false, "reprise : pas deux actions en 10 min");
t(etatBlocageLbc({ leboncoin: { blocage_acces: bLeve2 } }, L + 1000 + ESPACEMENT_REPRISE_MS).prete === true, "reprise : une action toutes les 10 min");
t(etatBlocageLbc({ leboncoin: { blocage_acces: bLeve2 } }, L + REPRISE_PRUDENTE_MS + 1).etat === "libre", "6 h après la levée : libre");
const b2 = blocagePose(ps1, { signe: "http_403", source: "test", maintenant: iso(T0 + 3600_000) });
t(b2.depuis === b1.depuis && b2.preuves === 2, "un second refus prolonge sans changer le début");
t(blocagePose({ leboncoin: { blocage_acces: bLeve } }, { signe: "http_403", source: "t", maintenant: iso(L + 7200_000) }).depuis === iso(L + 7200_000), "un refus après la levée : nouveau blocage");
const mB = messageBlocageLbc("Brave", iso(T0));
t(mB.includes("leboncoin.fr dans Brave") && mB.includes("« Leboncoin remarche »") && mB.includes("détection des ventes"), "message : navigateur, geste, ventes");
t(messageBlocageLbc(null).includes("leboncoin.fr dans ton navigateur"), "message : navigateur inconnu → « ton navigateur »");

// ── 3. Le navigateur réel ──
const h = (o) => new Map(Object.entries(o));
t(nomCourtSur(navigateurDeLaRequete({ navigateur: "Brave" }, h({ "user-agent": "Mozilla/5.0 Chrome/141" }))) === "Brave", "déclaré Brave");
t(nomCourtSur(navigateurDeLaRequete({}, h({ "user-agent": "Mozilla/5.0 Chrome/141 Safari/537.36" }))) === null, "User-Agent Chrome seul : pas une preuve (Brave s'y cache)");
t(nomCourtSur(navigateurDeLaRequete({}, h({ "user-agent": "Mozilla/5.0 Chrome/141 Edg/141" }))) === "Edge", "Edge sur l'User-Agent");
t(nomCourtSur(navigateurDeLaRequete({}, h({ "sec-ch-ua": "\"Brave\";v=\"141\", \"Chromium\";v=\"141\"" }))) === "Brave", "Brave par sec-ch-ua");
t(nomCourtSur(navigateurDeLaRequete({ navigateur: "<script>" }, h({}))) === null, "valeur déclarée hors liste ignorée");
t(dansLeNavigateur("Brave") === "dans Brave" && dansLeNavigateur(null) === "dans ton navigateur", "dansLeNavigateur");
t(nommerLeNavigateur("ouvre leboncoin.fr dans Chrome et fais la vérification", "Brave") === "ouvre leboncoin.fr dans Brave et fais la vérification", "message réécrit pour Brave");
t(nommerLeNavigateur("Ouvre Chrome avec l'extension FillSell", null) === "Ouvre ton navigateur avec l'extension FillSell", "« Ouvre Chrome » → « Ouvre ton navigateur »");
t(nommerLeNavigateur("dans Chrome, sur ton ordinateur", "Chrome") === "dans Chrome, sur ton ordinateur", "Chrome connu : inchangé");
t(nommerLeNavigateur("depuis le Chrome Web Store", "Brave") === "depuis le Chrome Web Store", "marque produit jamais touchée");
t(messageVerificationAntirobot("leboncoin", { navigateur: "Brave" }).includes("ouvre leboncoin.fr dans Brave"), "anti-robot : Brave");
t(messageConnexionRequise("leboncoin", { navigateur: "Edge" }).includes("reconnecte-toi à Leboncoin dans Edge"), "connexion : Edge");
t(messageVerificationAntirobot("leboncoin", {}).includes("dans ton navigateur"), "anti-robot sans navigateur connu : « ton navigateur »");
const jm = jugerMurGeste({ platform: "leboncoin", action: "republish", platform_fields: {} }, { navigateur: "Brave" });
t(jm.pf.navigateur_poste === "Brave", "le navigateur sûr est gardé sur la tâche");
t(messageAttenteBoutique("toto", "publish", "Brave").includes("dans Brave") && messageAttenteBoutique("toto", "publish").includes("dans ton navigateur"), "attente de boutique : navigateur réel");

// ── 4. « recreated » sans numéro (Johan) ──
const RET = "2026-10-26T14:49:52.290Z";
const jean = { id: "7ff873c5", action: "republish", status: "needs_user", platform: "leboncoin", inventaire_id: 1792573098074,
  error: "Étape de republication inconnue : recreated", platform_listing_id: null,
  platform_fields: { republish_step: "recreated", recreated_at: "2026-10-26T18:41:46.560Z", deleted_at: RET, old_platform_listing_id: "3291779198",
    absence_releves: { listing_id: "3296005486" } } };
t(etapeRecreatedSansNumero(jean), "le jean est « recreated » sans numéro");
const lignesJean = [
  { listing_id: "3296005486", job_id: "7ff873c5", inventaire_id: 1792573098074, statut_plateforme: "en_ligne", vu_le: "2026-10-26T18:41:46Z", disparu_le: "2026-10-29T18:51:05Z" },
  { listing_id: "3291779198", job_id: "de8b022f", inventaire_id: 1792573098074, statut_plateforme: "en_ligne", vu_le: "2026-10-26T11:20:58Z", disparu_le: "2026-10-26T18:41:46Z" },
];
const dJean = decisionRecreatedSansNumero(jean, { lignes: lignesJean, releveDebut: "2026-10-30T13:50:00Z", ficheStatut: "stock" });
t(dJean.verdict === "reprendre", "jean : jamais revu → reprise sans doublon");
const pJean = patchRecreatedSansNumero(jean, dJean, { par: "test", maintenant: "2026-10-30T20:00:00Z" });
t(pJean.status === "pending" && pJean.platform_fields.republish_step === "deleted" && pJean.platform_fields.recreation_depot_parti?.at === "2026-10-30T20:00:00Z"
  && !("recreated_at" in pJean.platform_fields) && pJean.platform_fields.deleted_at === RET, "reprise : étape deleted, garde « déjà partie » armée, retrait gardé");
const fanion = { id: "698823bc", action: "republish", status: "needs_user", platform: "leboncoin", inventaire_id: 1792572620876017,
  platform_listing_id: null, error: "Étape de republication inconnue : recreated",
  platform_fields: { republish_step: "recreated", recreated_at: "2026-10-29T15:14:46Z", deleted_at: "2026-10-29T14:55:42Z", old_platform_listing_id: "3291778567" } };
const lignesFanion = [
  { listing_id: "3297691558", job_id: "698823bc", inventaire_id: 1792572620876017, statut_plateforme: "en_ligne", vu_le: "2026-10-30T14:01:10Z", disparu_le: null, url: "https://www.leboncoin.fr/ad/collection/3297691558" },
  { listing_id: "3298266722", job_id: "ccf56279", inventaire_id: 1792572620876017, statut_plateforme: "en_ligne", vu_le: "2026-10-30T17:45:21Z", disparu_le: null, url: "https://www.leboncoin.fr/ad/collection/3298266722" },
];
const dF = decisionRecreatedSansNumero(fanion, { lignes: lignesFanion, releveDebut: "2026-10-30T17:40:00Z", ficheStatut: "stock" });
t(dF.verdict === "close_ailleurs" && dF.listing_id === "3298266722", "fanion : sa recréation n'est plus vue, l'article est en ligne sous 3298266722 → close sans rouge");
const dF2 = decisionRecreatedSansNumero(fanion, { lignes: lignesFanion, releveDebut: "2026-10-30T13:55:00Z", ficheStatut: "stock" });
t(dF2.verdict === "clore" && dF2.listing_id === "3297691558", "fanion au relevé de 14:01 : sa recréation vue → published");
t(patchRecreatedSansNumero(fanion, dF2, { par: "t" }).status === "published", "clôture propre : published");
t(decisionRecreatedSansNumero(jean, { lignes: lignesJean, releveDebut: "2026-10-30T13:50:00Z", ficheStatut: "vendu" }).verdict === "close_fiche_finie", "fiche vendue : rien redéposé");
t(decisionRecreatedSansNumero({ ...jean, platform: "depop" }, { lignes: [], releveDebut: null }).verdict === "rien", "Depop : aucune garde, rien conclu");
t(decisionRecreatedSansNumero({ ...jean, platform_fields: { ...jean.platform_fields, deleted_at: null } }, { lignes: [] }).verdict === "rien", "retrait non daté : rien redéposé à l'aveugle");
const linda = { id: "30277889", action: "republish", status: "pending", platform: "vinted", platform_listing_id: null,
  platform_fields: { republish_step: "recreated", recreated_at: "2026-10-13T15:00:00Z", old_vinted_item_id: "6687805793", new_vinted_item_id: "10542669657" } };
const dL = decisionRecreatedSansNumero(linda, { ficheVintedId: "10542669657" });
t(dL.verdict === "clore" && dL.listing_id === "10542669657", "Vinted : nouvelle annonce rattachée à la fiche → published");
t(!etapeRecreatedSansNumero({ ...jean, platform_listing_id: "3296005486" }), "avec son numéro : la règle du 15/10 s'en charge");
t(!etapeRecreatedSansNumero({ ...jean, status: "failed" }), "une tâche CLOSE (failed) n'est jamais rouverte par la règle (XEWER, 30/10)");
t(!etapeRecreatedSansNumero({ ...jean, platform: "beebs", platform_fields: { ...jean.platform_fields, refus_verification_beebs: { numero: "34140079" } } }), "un numéro refusé par la vérification Beebs : jamais repris");

// ── 5. Relance après mise à jour d'un AUTRE défaut (Sébastien) ──
const seb = { platform: "vinted", action: "republish", status: "needs_user",
  platform_fields: { needs_user_source: "grille_incoherente", republish_step: "captured", relance_apres_maj: { cle: "vinted_menus_bloom_grille" },
    republish_snapshot: { categoryPath: ["Accessoires de mode", "Montres"] } } };
const r1 = regleDeRelance(seb);
t(r1?.cle === "vinted_accessoires_pour_qui_taille", "Sébastien : relancé une fois pour la 0.6.161 malgré la relance 0.6.150");
const pfR = champsRelance(seb, r1, { maintenant: "2026-10-31T08:00:00Z", extensionBuild: "2026-10-31T07:00:00Z+x" });
t(regleDeRelance({ ...seb, platform_fields: { ...pfR, needs_user_source: "grille_incoherente" } }) === null, "jamais deux fois la même relance");
t(regleDeRelance({ ...seb, platform_fields: { ...seb.platform_fields, republish_snapshot: { categoryPath: ["Femmes", "Vêtements"] } } }) === null,
  "hors « Accessoires de mode », déjà relancé : rien (règle d'avant)");
t(RELANCES_APRES_MAJ.findIndex((r) => r.cle === "vinted_accessoires_pour_qui_taille") < RELANCES_APRES_MAJ.findIndex((r) => r.cle === "vinted_menus_bloom_grille"),
  "la règle des accessoires passe avant celle des menus bloom");

// ── 6. Arbre Vinted servi à certains comptes (DBZ70) ──
t(noeudVintedDuChemin(["Accessoires de mode"]) === 5496, "racine « Accessoires de mode » connue du moteur");
t(noeudVintedDuChemin(["Femmes", "Accessoires"]) != null, "l'arbre anonyme reste là");
const enfants = ["Bandanas et foulards", "Ceintures", "Bretelles", "Gants", "Accessoires pour cheveux", "Mouchoirs", "Bijoux", "Porte-clés",
  "Pochettes de costume", "Écharpes et châles", "Lunettes de soleil", "Cravates et nœuds papillon", "Parapluies", "Montres"];
const fc = feuillesCandidates({ plateforme: "vinted", base: ["Accessoires de mode"], titre: "Lot de 5 breloques Pokémon", enfantsVivants: enfants });
t(fc.some((f) => f.chemin.join(" > ") === "Accessoires de mode > Bijoux > Charms et pendentifs" && f.id === "5563"), "« Charms et pendentifs » parmi les feuilles proposées au moteur");

// ── 7. Le rendu graphique du poste (machine virtuelle : jamais Leboncoin) ──
const rv = (renderer, vendor = "") => renduDuPoll({ rendu_graphique: { webgl: true, renderer, vendor } });
t(posteVirtuel(rv("ANGLE (Intel, Intel(R) UHD Graphics 630 (0x00003E92) Direct3D11 vs_5_0 ps_5_0, D3D11)", "Google Inc. (Intel)")) === false, "puce Intel réelle : pas virtuel");
t(posteVirtuel(rv("ANGLE (VMware, Inc., VMware SVGA 3D Direct3D11 vs_5_0 ps_5_0, D3D11)", "Google Inc. (VMware, Inc.)")) === true, "VMware : virtuel");
t(posteVirtuel(rv("ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)")) === true, "Microsoft Basic Render Driver : virtuel");
t(posteVirtuel(rv("ANGLE (Red Hat, QXL paravirtual graphic card, OpenGL 4.5)")) === true, "QXL : virtuel");
const sw = rv("ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)");
t(sw.logiciel === true && posteVirtuel(sw) === false, "SwiftShader : noté logiciel, jamais bloquant");
t(renduDuPoll({}) === null && renduDuPoll({ rendu_graphique: { webgl: true, renderer: "" } }) === null, "absent : rien");
t(messagePosteVirtuelLbc().includes("machine virtuelle"), "message du poste virtuel");

// ── 8. « Republier avec toutes tes photos » (A1 du lot E, point 7 de Louis) ──
const amp = { id: "src1", user_id: "u", inventaire_id: 42, platform: "leboncoin", action: "publish", status: "published", title: "Jean", description: "d", price: 20,
  photos: Array.from({ length: 15 }, (_, i) => ({ url: `https://x/${i}.jpg` })), listing_url: "https://www.leboncoin.fr/ad/vetements/3290000000", platform_listing_id: "3290000000",
  platform_fields: { photos_lbc: { source: "illisible", fiche: 15, envoyees: 3 }, lbc_depot: { preuve: "confirmation" }, genre: "Femme" } };
const NEUF = "2026-10-31T08:00:00Z+abc";
t(annonceLbcAmputee(amp)?.fiche === 15, "annonce amputée reconnue (3 sur 15)");
t(annonceLbcAmputee({ ...amp, platform_fields: { photos_lbc: { source: "page_lbc", fiche: 15, envoyees: 15 } } }) === null, "annonce complète : rien");
t(republicationPhotosOfferte(amp, { extensionBuild: NEUF }) === true, "ligne montrée (extension à jour, Leboncoin libre)");
t(republicationPhotosOfferte(amp, { extensionBuild: "2026-10-29T22:28:02Z+6e59937" }) === false, "extension 0.6.159 : ligne cachée (repartirait à 3 photos)");
t(republicationPhotosOfferte(amp, { extensionBuild: NEUF, blocageEtat: "bloque" }) === false, "compte bloqué : pas proposée");
t(refusRepublicationPhotos({ job: amp, extensionBuild: NEUF, blocageEtat: "bloque" }) === "leboncoin_restreint", "compte bloqué : refus serveur");
t(refusRepublicationPhotos({ job: amp, extensionBuild: NEUF, enCours: 1 }) === "une_a_la_fois", "une à la fois : jamais de rafale");
t(refusRepublicationPhotos({ job: amp, extensionBuild: NEUF, dejaRepublieeFiche: true }) === "republication_deja_en_file", "déjà en file pour la fiche");
t(refusRepublicationPhotos({ job: amp, extensionBuild: NEUF, ficheStatut: "vendu" }) === "fiche_plus_en_vente", "fiche vendue : refus");
t(refusRepublicationPhotos({ job: amp, extensionBuild: NEUF, ficheStatut: "stock" }) === null, "tout bon : accepté");
const lg = ligneRepublicationPhotos(amp, { maintenant: "2026-10-31T09:00:00Z" });
t(lg.action === "republish" && lg.status === "pending" && lg.photos.length === 15, "republication avec les 15 photos");
t(lg.platform_fields.pepites_debitees === 0 && lg.platform_fields.hors_quota?.motif === "republication_photos_lbc", "sans pièce ni quota (hors_quota lu par quota_republication_free_etat)");
t(lg.platform_fields.republish_step === "a_capturer" && lg.platform_fields.republish_source_job_id === "src1" && !("photos_lbc" in lg.platform_fields) && !("lbc_depot" in lg.platform_fields), "même forme que la RPC, traces du dépôt amputé retirées");
t(lg.platform_fields.genre === "Femme", "les champs du dépôt sont gardés");
t(republicationPhotosEnCours({ action: "republish", status: "pending", platform_fields: lg.platform_fields }) === true, "la republication en file compte comme « en cours »");

console.log(`urgence-louis-3010 : ${ok} vert(s), ${ko} rouge(s)`);
if (ko) process.exit(1);
