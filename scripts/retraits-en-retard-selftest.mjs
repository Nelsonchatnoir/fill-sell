// ═══════════════════════════════════════════════════════════════════════════
// Selftest « les retraits non terminés > 24 h : le vrai risque de double vente d'abord » (05/11, R3)
//   npm run selftest:retraits-en-retard
//
// LE CAS : le 05/11, l'ops-digest (section 3) rangeait 34 retraits non terminés > 24 h sous « risque de double
// vente » ; 20 n'en étaient pas (15 suppressions sans vente, 5 dépôts Beebs jamais en ligne), des postes muets depuis
// août réécrits chaque jour — les 8 vrais risques noyés.
// CE QUE CE TEST VERROUILLE (_shared/retraits-en-retard.js + ops-digest) :
//   A. ROUGE : article vendu ET annonce vue en ligne après la vente (relevé, dépôt, page relue pendant le retrait),
//      ou au plus 48 h avant sans preuve plus récente de retrait — même derrière un mur (le mur est dit) ;
//   B. ORANGE : un mur nommé (connexion, pause Leboncoin, boutique Vinted, autorisation Depop, mur lu dans « Mes
//      annonces » Beebs, needs_user), ou un retrait qui n'avance pas sans mur ni preuve, poste vivant ;
//   C. BLANC : suppression sans vente, stock restant, dépôt Beebs jamais en ligne, annonce déjà indisponible (la
//      preuve la plus récente gagne), poste éteint ; poste muet > 30 j = UNE ligne par compte (délégation comprise) ;
//   D. les lignes, l'objet « 🔴 Double vente possible : N » ; E. ops-digest : lectures, blocs, compteur, objet.
// (12/11, lot « zéro problème », 3a — décision de Nico Q11 (a), « rallumer le juge avec le bloc « à relire » quel que soit
// l'âge », et son texte du 12/11 : « le juge ne compte plus « en ligne » une annonce qu'un relevé plus récent n'a pas revue ;
// le mail ne crie plus « double vente » à tort ») :
//   F. ROUGE = vue en ligne APRÈS la vente, et pas démentie par un relevé complet plus récent (f3aec8cc, d8b07167) ;
//      🟡 À RELIRE = article vendu dont la dernière preuve est « en ligne » sans être un rouge prouvé — vue AVANT la vente
//      (quel que soit l'âge : 7c6f4b35 et 450bdf41 de a5da17ee, les faux rouges du 05/11 700d7aa3 et 8bdf8095), ou pas
//      revue par un relevé complet plus récent — jugé AVANT le poste muet, jamais caché dans une ligne blanche ;
//   G. ops-digest : le juge rallumé, les relevés lus, le bloc « à relire » compté, l'objet ne compte que les rouges.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const M = await import(pathToFileURL(join(ROOT, "supabase/functions/_shared/retraits-en-retard.js")).href);

let ko = 0, n = 0;
const ok = (cond, nom, detail = "") => { n++; if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${detail}`}`); };

const H = 3600_000, J = 86_400_000;
const T = Date.parse("2026-11-05T18:00:00Z");
const iso = (t) => new Date(t).toISOString();
const U = "25caeedd-0356-44c4-b040-7387ef826631";
const profil = (vu, extra = {}) => ({ username: "x", email: "x@ex.fr", extension_last_seen_at: vu == null ? null : iso(vu), beta_flags: {}, platform_settings: {}, ...extra });
const profils = (p, id = U) => new Map([[id, p]]);
const retrait = (o = {}) => ({
  id: "dd5d7e85-0000-4000-8000-000000000001", user_id: U, platform: "leboncoin", action: "delete", status: "pending", error: null,
  created_at: iso(T - 38 * H), listing_url: "https://www.leboncoin.fr/ad/livres/3287013710", inventaire_id: 1793609890280006,
  title: "Marcel Proust", platform_fields: { arme_par: { le: iso(T - 38 * H), depot: "a04ebc8e-0000-4000-8000-000000000001", pose_par: "armer_retrait_job (serveur)" } },
  ...o,
});
const vendue = { statut: "vendu", quantite: 0, titre: "Marcel Proust" };
const venteA = (t) => [{ vendu_le: null, created_at: iso(t), plateforme: "Vinted" }];
const juger = (o) => M.jugerRetraitEnRetard({ job: retrait(), maintenant: T, profils: profils(profil(T - 10 * 60_000)), fiche: vendue, ventes: venteA(T - 38 * H), ...o });

console.log("[A] ROUGE : vendu ET vue en ligne à la vente ou après");
{
  // 25caeedd (05/11) : dépôt vu en ligne APRÈS la vente, pause Leboncoin en cours.
  const j = juger({
    job: retrait({ platform_fields: { ...retrait().platform_fields, attente_blocage_lbc: { depuis: iso(T - 38 * H) } } }),
    source: { status: "published", vu_en_ligne_le: iso(T - 90 * 60_000) },
    annonces: [{ statut_plateforme: "en_ligne", vu_le: iso(T - 58 * H) }],
    profils: profils(profil(T - 5 * 60_000, { platform_settings: { leboncoin: { blocage_acces: { signe: "session_fermee", depuis: iso(T - 38 * H) } } } })),
  });
  ok(j.couleur === "rouge" && j.motif === "vue_apres_la_vente", "25caeedd : vu en ligne après la vente → rouge, même derrière la pause Leboncoin", JSON.stringify([j.couleur, j.motif]));
  ok(j.mur?.mur === "pause_leboncoin" && /session_fermee/.test(j.mur.texte), "… et le mur est nommé dans la ligne", JSON.stringify(j.mur));
  ok(/APRÈS la vente/.test(M.ligneRetrait(j, T)) && /pause Leboncoin/.test(M.ligneRetrait(j, T)), "la ligne dit « APRÈS la vente » et le mur", M.ligneRetrait(j, T));

  // d8b07167 (f3aec8cc) : la page relue PENDANT le retrait est « active » après la vente — le relevé, lui, date du 07/10.
  const jb = juger({
    job: retrait({ platform: "beebs", listing_url: "https://www.beebs.app/fr/p/34042975-peignoir-spiderman", platform_fields: {
      ...retrait().platform_fields, lecture_etat_retrait: { etat: "active", http: 200, lu_le: iso(T - 30 * H) },
      beebs_lecture_mes_annonces: { lu_le: iso(T - 30 * H), verdict: "illisible", onglets: [{ ok: false, mur: "connexion", motif: "renvoyée vers www.beebs.app/fr/auth" }] } } }),
    annonces: [{ statut_plateforme: "en_ligne", vu_le: iso(T - 29 * J) }],
    ventes: venteA(T - 32 * H),
  });
  ok(jb.couleur === "rouge" && jb.preuves.enLigne.par === "page relue en ligne pendant le retrait", "d8b07167 : la page relue en ligne pendant le retrait suffit (relevé ancien)", JSON.stringify([jb.couleur, jb.preuves.enLigne]));
  ok(jb.mur?.mur === "connexion" && /Mes annonces/.test(jb.mur.texte), "… mur : connexion Beebs lue dans « Mes annonces »", JSON.stringify(jb.mur));

  // 700d7aa3 : vue en ligne 68 s AVANT l'enregistrement de la vente, poste éteint depuis. (12/11, décision de Nico — Q11 a :
  // rouge = vue APRÈS la vente) C'était un faux rouge du 05/11 (annonce Leboncoin 3299230866 « désactivée », relue 410 le
  // 07/11) : « à relire », jamais rouge — la ligne dit toujours l'écart et le poste muet.
  const jp = juger({ annonces: [{ statut_plateforme: "en_ligne", vu_le: iso(T - 38 * H - 68_000) }], profils: profils(profil(T - 5 * J)) });
  ok(jp.couleur === "relire" && jp.motif === "vue_avant_la_vente", "700d7aa3 (faux rouge du 05/11) : vue 1 min avant la vente, rien depuis → à relire, jamais rouge", JSON.stringify([jp.couleur, jp.motif]));
  ok(/1 min avant la vente, jamais vue retirée depuis/.test(M.ligneRetrait(jp, T)) && /muet depuis 5 j/.test(M.ligneRetrait(jp, T)), "la ligne dit l'écart et le poste muet", M.ligneRetrait(jp, T));

  // (12/11, décision de Nico — Q11 a) Vue avant la vente = « à relire » QUEL QUE SOIT L'ÂGE (47 h ou 49 h avant).
  ok(juger({ annonces: [{ statut_plateforme: "en_ligne", vu_le: iso(T - 38 * H - 47 * H) }] }).couleur === "relire", "vue 47 h avant la vente : à relire");
  ok(juger({ annonces: [{ statut_plateforme: "en_ligne", vu_le: iso(T - 38 * H - 49 * H) }] }).couleur === "relire", "vue 49 h avant la vente : à relire (plus jamais orange ni blanc)");
  // vendu_le prime sur l'enregistrement.
  ok(M.momentDeLaVente(retrait(), [{ vendu_le: iso(T - 40 * H), created_at: iso(T - 38 * H) }]) === T - 40 * H, "moment de la vente : vendu_le d'abord");
  ok(M.momentDeLaVente(retrait(), []) === T - 38 * H, "sans vente lue : l'armement du retrait");
  // eBay par l'API (aucune attente de session) : le poste ne compte pas.
  const je = juger({ job: retrait({ platform: "ebay", listing_url: "https://www.ebay.fr/itm/176726068488", platform_fields: { ...retrait().platform_fields } }),
    annonces: [{ statut_plateforme: "en_ligne", vu_le: iso(T - 30 * H) }], profils: profils(profil(T - 60 * J)) });
  ok(je.couleur === "rouge", "eBay par l'API, vue après la vente, poste muet 60 j : jugé quand même (le poste ne fait pas ce retrait)", JSON.stringify([je.couleur, je.motif]));
}

console.log("\n[B] ORANGE : le geste attendu de la personne");
{
  // c867ffe9 (e3618a5d) : Vinted vu 4 j avant la vente, attente de connexion Vinted.
  const jv = juger({
    job: retrait({ platform: "vinted", listing_url: "https://www.vinted.fr/items/10161738918-polo", platform_fields: { ...retrait().platform_fields, attente_connexion: { depuis: iso(T - 30 * J) } } }),
    snapshotVinted: { status: "active", captured_at: iso(T - 38 * H - 4 * J) },
  });
  // (12/11, décision de Nico — Q11 a) La dernière preuve est « en ligne » : à relire, le mur dit dans la ligne (avant : orange).
  ok(jv.couleur === "relire" && jv.motif === "vue_avant_la_vente" && jv.mur?.mur === "connexion" && /connexion Vinted à refaire/.test(M.ligneRetrait(jv, T)),
    "c867ffe9 : vue 4 j avant la vente, connexion Vinted attendue → à relire, le mur dit", JSON.stringify([jv.couleur, jv.motif]));
  const jd = juger({ job: retrait({ platform: "depop", status: "needs_user", listing_url: "https://www.depop.com/products/x-y-a21a/", platform_fields: { ...retrait().platform_fields, needs_user_source: "depop_acces" } }) });
  ok(jd.couleur === "orange" && jd.motif === "depop_acces", "autorisation Depop attendue, aucune preuve : orange", JSON.stringify([jd.couleur, jd.motif]));
  const jbq = juger({ job: retrait({ platform: "vinted", status: "needs_user", listing_url: "https://www.vinted.fr/items/10499262943", platform_fields: { ...retrait().platform_fields, needs_user_source: "boutique_etrangere", boutique_etrangere: { login_article: "boutique-7b9d8a71" } } }) });
  ok(jbq.couleur === "orange" && jbq.motif === "boutique" && /@boutique-7b9d8a71/.test(jbq.mur.texte), "boutique Vinted étrangère : orange, boutique nommée", JSON.stringify(jbq.mur));
  const jl = juger({ profils: profils(profil(T - 10 * 60_000, { platform_settings: { leboncoin: { blocage_acces: { signe: "http_403", depuis: iso(T - 4 * J) } } } })) });
  ok(jl.couleur === "orange" && jl.motif === "pause_leboncoin", "pause Leboncoin du profil, aucune preuve en ligne : orange", JSON.stringify([jl.couleur, jl.motif]));
  const jlev = juger({ profils: profils(profil(T - 10 * 60_000, { platform_settings: { leboncoin: { blocage_acces: { signe: "http_403", depuis: iso(T - 4 * J), leve_le: iso(T - J) } } } })) });
  ok(jlev.motif !== "pause_leboncoin", "pause Leboncoin levée : plus un mur", jlev.motif);
  const js = juger({});
  ok(js.couleur === "orange" && js.motif === "sans_mur" && /aucun mur nommé/.test(M.ligneRetrait(js, T)), "vendu, aucune preuve, aucun mur, poste vivant : orange « le retrait n'avance pas »", JSON.stringify([js.couleur, js.motif]));
}

console.log("\n[C] BLANC : sans risque de double vente");
{
  ok(juger({ job: retrait({ inventaire_id: null, platform_fields: {} }), fiche: null, ventes: [] }).motif === "sans_vente", "fiche supprimée, aucune vente, aucun armement : suppression sans vente");
  ok(juger({ fiche: { statut: "en_stock", quantite: 2 }, annonces: [{ statut_plateforme: "en_ligne", vu_le: iso(T - H) }] }).motif === "sans_vente", "article encore en stock (série) : jamais rouge, même vu en ligne");
  {
    const ja = juger({ job: retrait({ inventaire_id: null }), fiche: null, ventes: [] });
    ok(ja.vendu === true && ja.motif === "sans_mur", "fiche supprimée MAIS retrait armé par la vente : jugé comme vendu (jamais « sans vente »)", JSON.stringify([ja.vendu, ja.motif]));
  }
  // Beebs jamais en ligne.
  const pev = { regle: "jamais_vue_en_ligne_2010", depuis: iso(T - 5 * J), derniere: iso(T - 2 * H), lectures: 15 };
  const jbe = juger({ job: retrait({ platform: "beebs", listing_url: "https://www.beebs.app/fr/p/34266973", error: "L'annonce n'est pas encore visible sur Beebs (Beebs l'examine encore)" }), source: { status: "published", pas_encore_visible: pev } });
  ok(jbe.couleur === "blanc" && jbe.motif === "beebs_jamais_en_ligne", "dépôt Beebs « pas encore visible » : blanc", JSON.stringify([jbe.couleur, jbe.motif]));
  const jbr = juger({ job: retrait({ platform: "beebs", listing_url: "https://www.beebs.app/fr/p/34083555", platform_fields: { retrait_en_attente_verification: true } }), annonces: [{ statut_plateforme: "en_verification", vu_le: iso(T - 3 * J) }] });
  ok(jbr.motif === "beebs_jamais_en_ligne", "relevé « en vérification » : blanc", jbr.motif);
  const jbv = juger({ job: retrait({ platform: "beebs", listing_url: "https://www.beebs.app/fr/p/1", platform_fields: { ...retrait().platform_fields, lecture_etat_retrait: { etat: "active", lu_le: iso(T - H) } } }), source: { pas_encore_visible: pev } });
  ok(jbv.couleur === "rouge", "Beebs relue EN LIGNE après le marqueur de vérification : la preuve la plus récente gagne → rouge", JSON.stringify([jbv.couleur, jbv.motif]));
  // Déjà indisponible : la preuve la plus récente gagne.
  const ji = juger({ source: { vu_en_ligne_le: iso(T - 40 * H), sale_signal: "unavailable", unavailable_since: iso(T - 39 * H) } });
  ok(ji.couleur === "blanc" && ji.motif === "deja_indisponible", "dépôt « unavailable » après la dernière vue : déjà indisponible", JSON.stringify([ji.couleur, ji.motif]));
  ok(juger({ source: { vu_en_ligne_le: iso(T - 20 * H), sale_signal: "unavailable", unavailable_since: iso(T - 39 * H) } }).couleur === "rouge", "revue en ligne APRÈS le « unavailable » : rouge");
  ok(juger({ annonces: [{ statut_plateforme: "en_ligne", vu_le: iso(T - 40 * H), disparu_le: iso(T - 30 * H) }] }).motif === "deja_indisponible", "relevé : disparue après sa dernière vue → déjà indisponible");
  ok(juger({ job: retrait({ platform: "vinted", listing_url: "https://www.vinted.fr/items/10608214156" }), snapshotVinted: { status: "sold", captured_at: iso(T - 30 * H) } }).motif === "deja_indisponible", "instantané Vinted « sold » : déjà indisponible");
  ok(juger({ job: retrait({ platform_fields: { ...retrait().platform_fields, lecture_etat_retrait: { etat: "unavailable", lu_le: iso(T - 2 * H) } } }), annonces: [{ statut_plateforme: "en_ligne", vu_le: iso(T - 30 * H) }] }).motif === "deja_indisponible", "page relue « unavailable » pendant le retrait : déjà indisponible");
  // Poste éteint (24 h à 30 j), poste muet > 30 j.
  ok(juger({ profils: profils(profil(T - 3 * J)) }).motif === "poste_eteint", "vendu, aucune preuve, aucun mur, poste muet 3 j : poste éteint");
  const jm = juger({ annonces: [{ statut_plateforme: "en_ligne", vu_le: iso(T - 38 * H - H) }], profils: profils(profil(T - 40 * J)) });
  // (12/11, décision de Nico — Q11 a) Un article VENDU vu en ligne n'est jamais caché dans la ligne blanche du poste muet.
  ok(jm.couleur === "relire" && jm.motif === "vue_avant_la_vente", "poste muet 40 j, article vendu vu en ligne à la vente : à relire, jamais une ligne blanche", JSON.stringify([jm.couleur, jm.motif]));
  ok(juger({ fiche: { statut: "en_stock", quantite: 2 }, profils: profils(profil(T - 40 * J)) }).motif === "poste_muet_long", "poste muet 40 j, rien de vendu : une ligne blanche par compte (inchangé)");
  ok(juger({ profils: profils(profil(null)) }).motif === "poste_muet_long", "poste jamais vu : muet");
  // Délégation Leboncoin : c'est le poste de l'exécutant qui compte.
  const AM = "faf5021a-479a-4bb3-b3ec-c296770739b7";
  const pd = new Map([
    [U, profil(T - 60 * J, { beta_flags: { delegation_leboncoin: { executant: AM, nom: "Compte-faf5021a" } } })],
    [AM, profil(T - 5 * 60_000, { beta_flags: { execute_leboncoin_pour: [U] } })],
  ]);
  const jdl = juger({ profils: pd, annonces: [{ statut_plateforme: "en_ligne", vu_le: iso(T - H) }] });
  ok(jdl.couleur === "rouge" && jdl.delegue && /poste de Compte-faf5021a \(délégation\)/.test(M.ligneRetrait(jdl, T)), "délégation Leboncoin : poste de l'exécutant vivant → jugé (rouge), exécutant nommé", JSON.stringify([jdl.couleur, jdl.motif, jdl.executantNom]));
}

console.log("\n[D] Les lignes et l'objet");
{
  const muets = Array.from({ length: 7 }, (_, i) => juger({
    job: retrait({ id: `60bb404b-0000-4000-8000-00000000000${i}`, user_id: "f7272910-ccef-45b7-8030-99a014bc8e42", platform: "vinted", inventaire_id: null, listing_url: `https://www.vinted.fr/items/99211${i}`, platform_fields: {}, created_at: iso(T - (32 + i) * J) }),
    fiche: null, ventes: [], profils: new Map([["f7272910-ccef-45b7-8030-99a014bc8e42", profil(T - 49 * J, { username: "MZR" })]]),
  }));
  const sv = juger({ job: retrait({ user_id: "0f8722f5-edec-41f0-8e13-46524d0a287e", inventaire_id: null, platform_fields: {} }), fiche: null, ventes: [], profils: new Map([["0f8722f5-edec-41f0-8e13-46524d0a287e", profil(T - H)]]) });
  const rouge = juger({ annonces: [{ statut_plateforme: "en_ligne", vu_le: iso(T - H) }] });
  const c = M.classerRetraitsEnRetard([...muets, sv, rouge], T);
  ok(c.rouges.length === 1 && c.oranges.length === 0 && c.blancs.length === 8, "classement : 1 rouge, 0 orange, 8 blancs", JSON.stringify([c.rouges.length, c.oranges.length, c.blancs.length]));
  ok(c.lignesBlanches.length === 2, "7 retraits d'un poste muet + 1 suppression sans vente : 2 lignes blanches", JSON.stringify(c.lignesBlanches));
  ok(/^poste muet depuis plus de 30 jours — compte f7272910 \(MZR\) — muet depuis le .* \(49 j\) — 7 retraits \(Vinted ×7\)/.test(c.lignesBlanches[0]) && /aucun article vendu/.test(c.lignesBlanches[0]),
    "poste muet : une ligne par compte (nombre, plateformes, silence)", c.lignesBlanches[0]);
  ok(/^suppression sans vente — compte 0f8722f5/.test(c.lignesBlanches[1]) && /fiche supprimée, aucune vente/.test(c.lignesBlanches[1]), "suppression sans vente : compte, motif", c.lignesBlanches[1]);
  ok(M.sujetAvecDoubleVente("⚠️ FillSell ops-digest — 3 anomalies", 0) === "⚠️ FillSell ops-digest — 3 anomalies", "objet inchangé sans rouge");
  ok(M.sujetAvecDoubleVente("⚠️ FillSell ops-digest", 8) === "🔴 Double vente possible : 8 — ⚠️ FillSell ops-digest", "objet : commence par « 🔴 Double vente possible : N »");
  ok(M.heureParis(Date.parse("2026-10-31T15:43:04Z")) === "31/10 16:43", "heures de Paris dans les lignes", M.heureParis(Date.parse("2026-10-31T15:43:04Z")));
  ok(M.numeroAnnonce({ platform: "vinted", listing_url: "https://www.vinted.fr/items/10161738918-polo" }) === "10161738918"
    && M.numeroAnnonce({ platform: "leboncoin", listing_url: "https://www.leboncoin.fr/ad/livres/3287013710" }) === "3287013710"
    && M.numeroAnnonce({ platform: "beebs", listing_url: "https://www.beebs.app/fr/p/34042975-peignoir-spiderman" }) === "34042975", "numéro d'annonce exact par plateforme (jamais un titre)");
}

console.log("\n[E] ops-digest");
{
  const od = lire("supabase/functions/ops-digest/index.ts");
  ok(/from "\.\.\/_shared\/retraits-en-retard\.js"/.test(od), "ops-digest importe le juge (une seule règle)");
  ok(/\.select\(`\$\{JOB_COLUMNS\}, user_id, inventaire_id, platform_listing_id`\)/.test(od) && /\.lt\("created_at", iso24h\)\n\s*\.order\("created_at", \{ ascending: true \}\)\n\s*\.range\(0, 999\);/.test(od),
    "section 3 : compte, fiche, numéro lus ; 1 000 lignes au plus, dites");
  ok(/from\("inventaire"\)\.select\("id, statut, quantite, titre"\)/.test(od) && /from\("ventes"\)\.select\("inventaire_id, vendu_le, created_at, plateforme"\)/.test(od)
    && /vu_en_ligne_le, sale_signal:platform_fields->>sale_signal/.test(od) && /pas_encore_visible:platform_fields->pas_encore_visible/.test(od)
    && /from\("annonces_plateforme"\)[\s\S]{0,160}\.in\("user_id", lotU\)\.in\("listing_id", lotN\)/.test(od)
    && /from\("vinted_listing_snapshots"\)[\s\S]{0,120}\.order\("captured_at", \{ ascending: false \}\)\.limit\(1\)/.test(od),
    "lit la fiche, ses ventes, le dépôt (clés utiles seulement), les annonces du même numéro (index), le dernier instantané Vinted");
  ok(/\.slice\(0, 100\)/.test(od) && /lots\(invIds, 100\)/.test(od) && /lots\(depots, 200\)/.test(od) && /lots\(users, 100\)/.test(od) && /lots\(numeros, 100\)/.test(od)
    && /\.in\("user_id", usersDesFiches\(lot\)\)/.test(od), "lots bornés (100 à 200 par .in(), comptes du lot seulement, 100 instantanés au plus)");
  ok(/executantsDeclares\(profils\)\.filter/.test(od) && /blocage_lbc:platform_settings->leboncoin->blocage_acces/.test(od), "profils : exécutants des délégations, pause Leboncoin");
  // (12/11, décision de Nico — Q11 a) Le bloc « à relire » est compté : il fait partir le mail ; le blanc, jamais.
  ok(/delete_overdue: retraits \? retraits\.rouges\.length \+ retraits\.oranges\.length \+ retraits\.relire\.length : \(deletesOverdue \?\? \[\]\)\.length,/.test(od), "compteur : rouge + orange + à relire (le blanc ne fait jamais partir le mail)");
  ok(/🔴 Double vente possible — retraits non terminés > 24 h/.test(od) && /🟠 Retraits non terminés > 24 h — geste attendu de la personne/.test(od) && /⚪ Retraits non terminés > 24 h sans risque de double vente/.test(od),
    "les blocs rouge, orange, blanc (« à relire » : section G)");
  const iBloc = od.indexOf("!retraits ? section(");
  ok(iBloc > 0 && iBloc < od.indexOf("🔴 Files arrêtées alors que l'extension est ouverte"), "le bloc des retraits ouvre le mail");
  ok(/retraitsIllisibles = String\(\(e as Error\)\?\.message \?\? e\)/.test(od) && /🔴 Retraits \(delete\) non terminés > 24 h — risque de double vente\$\{retraitsIllisibles/.test(od),
    "classement illisible : la liste brute d'avant, avec la cause (jamais une panne du digest)");
  ok(/subject: sujetAvecDoubleVente\(mail\.subject, retraits\?\.rouges\.length \?\? 0\)/.test(od), "l'objet du mail passe par sujetAvecDoubleVente");
  ok(/subject: `\$\{filesArreteesLignes\.length \? `🔴 Files arrêtées \(extension ouverte\)/.test(od), "le reste de l'objet est inchangé");
}

console.log("\n[F] (12/11, Q11 a) rouge = vue APRÈS la vente et pas démentie ; « à relire » sinon — les cas réels relus le 13/11 01:26");
{
  const T13 = Date.parse("2026-11-13T00:26:13Z");
  const run = (o) => ({ kind: "annonces", status: "done", items_vus: 10, total_entries: 10, erreur: "", vinted_user_id: null, compte_plateforme: null, ...o,
    finished_at: o.finished_at ?? iso(Date.parse(o.started_at) + 60_000) });
  // f3aec8cc (d8b07167, Beebs) : page de l'annonce relue « active » le 11/11 10:18, APRÈS la vente du 31/10 ; dernier relevé
  // complet Beebs du compte le 07/10 (plus ancien que la lecture) : rouge, le seul prouvé.
  const jf = M.jugerRetraitEnRetard({
    job: { id: "f3aec8cc-ca8f-4c1c-a69e-84273c07ec95", user_id: "d8b07167-48b8-40e9-a3e1-d2c95015b076", platform: "beebs", action: "delete", status: "needs_user",
      created_at: "2026-10-31T13:09:00.305Z", listing_url: "https://www.beebs.app/fr/p/34042975", inventaire_id: 1791355141243, error: "Connexion Beebs requise",
      platform_fields: { arme_par: { le: "2026-10-31T13:09:00.305Z", depot: "0b0e9404-5f40-4eb0-8098-b11201a08fc5", pose_par: "armer_retrait_job (serveur)" },
        lecture_etat_retrait: { etat: "active", http: 200, lu_le: "2026-11-11T09:18:05.388Z" }, needs_user_source: "connexion",
        beebs_lecture_mes_annonces: { lu_le: "2026-11-11T09:18:04.985Z", verdict: "illisible", onglets: [{ ok: false, mur: "connexion", motif: "renvoyée vers www.beebs.app/fr/auth" }] } } },
    fiche: { statut: "vendu", quantite: 0 }, ventes: [{ vendu_le: null, created_at: "2026-10-31T13:09:00.305Z", plateforme: "Vinted" }],
    source: { status: "published", vu_en_ligne_le: "2026-10-25T14:09:41.519Z" }, annonces: [{ statut_plateforme: "en_ligne", vu_le: "2026-10-07T06:36:04.169Z" }],
    releves: [run({ started_at: "2026-10-07T06:35:00Z", items_vus: 13, total_entries: 13 })],
    profils: new Map([["d8b07167-48b8-40e9-a3e1-d2c95015b076", profil(Date.parse("2026-11-11T15:10:54Z"))]]), maintenant: T13,
  });
  ok(jf.couleur === "rouge" && jf.motif === "vue_apres_la_vente", "f3aec8cc (d8b07167) : relue « active » après la vente → ROUGE (avant : rouge)", JSON.stringify([jf.couleur, jf.motif]));
  // 7c6f4b35 (a5da17ee, Leboncoin) : relevé « en ligne » le 05/11 19:20, vente eBay le 06/11 14:54, poste muet depuis le 05/11.
  const A5 = "a5da17ee-9130-4241-b42c-cc14b8913e7a";
  const pA5 = new Map([[A5, profil(Date.parse("2026-11-05T18:40:12Z"))]]);
  const venteA5 = [{ vendu_le: "2026-11-06T13:54:08Z", created_at: "2026-11-06T13:55:00.247Z", plateforme: "eBay" }];
  const lbc = { id: "7c6f4b35-a103-41b9-810c-f32ad79380e3", user_id: A5, platform: "leboncoin", action: "delete", status: "pending", created_at: "2026-11-06T13:55:00.247Z",
    listing_url: "https://www.leboncoin.fr/ad/vetements/3300150365", inventaire_id: 1793780966641011, error: "",
    platform_fields: { arme_par: { le: "2026-11-06T13:55:00.247Z", depot: "23ff83c8-7c87-45f8-b802-01e31d253b2f", pose_par: "armer_retrait_job (serveur)" } } };
  const runsLbc = [run({ started_at: "2026-11-05T18:20:00Z", items_vus: 408, total_entries: 408 }), run({ started_at: "2026-11-05T08:22:00Z", items_vus: 410, total_entries: 409 })];
  const jl = M.jugerRetraitEnRetard({ job: lbc, fiche: { statut: "vendu", quantite: 0 }, ventes: venteA5, source: { status: "published", vu_en_ligne_le: "2026-11-05T10:32:43.95Z" },
    annonces: [{ statut_plateforme: "en_ligne", vu_le: "2026-11-05T18:20:26.297Z" }], releves: runsLbc, profils: pA5, maintenant: T13 });
  ok(jl.couleur === "relire" && jl.motif === "vue_avant_la_vente", "7c6f4b35 (a5da17ee) : vue en ligne 20 h AVANT la vente, rien depuis → à relire (avant : rouge)", JSON.stringify([jl.couleur, jl.motif]));
  // 450bdf41 (a5da17ee, Vinted) : instantané « active » le 05/11 09:07 (relevé complet de la boutique 211104624), vente le 06/11.
  const vin = { id: "450bdf41-4063-4702-9ad5-7b45f0748693", user_id: A5, platform: "vinted", action: "delete", status: "pending", created_at: "2026-11-06T13:55:00.247Z",
    listing_url: "https://www.vinted.fr/items/10619395333", inventaire_id: 1793780966641011, error: "",
    platform_fields: { arme_par: { le: "2026-11-06T13:55:00.247Z", depot: "8998d31a-bffd-4e7d-b593-e3545c717d59", pose_par: "armer_retrait_job (serveur)" }, vinted_account_id: "211104624" } };
  const runsVin = [run({ kind: "dressing", started_at: "2026-11-05T08:07:00Z", items_vus: 553, total_entries: 553, vinted_user_id: "211104624" })];
  const jv2 = M.jugerRetraitEnRetard({ job: vin, fiche: { statut: "vendu", quantite: 0 }, ventes: venteA5, source: { status: "published", vu_en_ligne_le: "2026-11-04T22:40:30.426Z" },
    snapshotVinted: { status: "active", captured_at: "2026-11-05T08:07:17.404Z" }, releves: runsVin, profils: pA5, maintenant: T13 });
  ok(jv2.couleur === "relire" && jv2.motif === "vue_avant_la_vente", "450bdf41 (a5da17ee) : vue en ligne avant la vente, rien depuis → à relire (avant : rouge)", JSON.stringify([jv2.couleur, jv2.motif]));
  // 8bdf8095 (00ca4ff3, eBay) — faux rouge du 05/11 (« introuvable » chez eBay) : vue 5 min avant la vente il y a 30 jours.
  const jb8 = M.jugerRetraitEnRetard({
    job: { id: "8bdf8095-4c85-471d-9201-8373edbc1c8e", user_id: "00ca4ff3-9235-4361-9860-cb31a32e74f1", platform: "ebay", action: "delete", status: "pending",
      created_at: "2026-10-14T12:52:09.966Z", listing_url: "https://www.ebay.fr/itm/176726068488", inventaire_id: 1791982154314, error: "En attente de ta connexion à eBay",
      platform_fields: { arme_par: { le: "2026-10-14T12:52:09.966Z", depot: "458288f9-59ac-4ca2-be57-5816cef9bdb2", pose_par: "armer_retrait_job (serveur)" },
        attente_session: { depuis: "2026-10-14T13:03:12.656Z", platform: "ebay" } } },
    fiche: { statut: "vendu", quantite: 1 }, ventes: [{ vendu_le: null, created_at: "2026-10-14T12:52:09.966Z", plateforme: "Ailleurs" }],
    source: { status: "published", vu_en_ligne_le: null }, annonces: [{ statut_plateforme: "en_ligne", vu_le: "2026-10-14T12:47:22.608Z" }],
    releves: [run({ started_at: "2026-10-14T12:47:00Z", items_vus: 1, total_entries: 1, platform: "ebay" })],
    profils: new Map([["00ca4ff3-9235-4361-9860-cb31a32e74f1", profil(Date.parse("2026-10-14T13:03:14Z"))]]), maintenant: T13,
  });
  ok(jb8.couleur === "relire", "8bdf8095 (faux rouge du 05/11, eBay « introuvable ») : vue 5 min avant la vente il y a 30 j → à relire, jamais rouge", JSON.stringify([jb8.couleur, jb8.motif]));
  // « Pas revue depuis » : un relevé COMPLET plus récent que la vue ne l'a pas revue → jamais rouge, même vue après la vente.
  const runApres = run({ started_at: "2026-11-12T10:00:00Z", items_vus: 12, total_entries: 12 });
  const jfp = M.jugerRetraitEnRetard({ job: jf.job, fiche: jf.fiche, ventes: [{ vendu_le: null, created_at: "2026-10-31T13:09:00.305Z" }], source: null,
    annonces: [{ statut_plateforme: "en_ligne", vu_le: "2026-10-07T06:36:04.169Z" }], releves: [runApres], profils: new Map([["d8b07167-48b8-40e9-a3e1-d2c95015b076", profil(T13 - H)]]), maintenant: T13 });
  ok(jfp.couleur === "relire" && jfp.motif === "pas_revue_depuis" && jfp.pasRevue?.releve_le === "2026-11-12T10:00:00Z",
    "relue « active » le 11/11, puis un relevé complet de « Mes annonces » le 12/11 ne la voit plus → à relire « pas revue depuis », jamais rouge", JSON.stringify([jfp.couleur, jfp.motif, jfp.pasRevue]));
  ok(/pas revue par le relevé complet du 12\/11 11:00/.test(M.ligneRetrait(jfp, T13)), "la ligne dit le relevé qui ne l'a pas revue (heure de Paris)", M.ligneRetrait(jfp, T13));
  const revue = M.jugerRetraitEnRetard({ job: jf.job, fiche: jf.fiche, ventes: [{ created_at: "2026-10-31T13:09:00.305Z" }], source: null,
    annonces: [{ statut_plateforme: "en_ligne", vu_le: "2026-11-12T10:05:00Z" }], releves: [runApres], profils: new Map([["d8b07167-48b8-40e9-a3e1-d2c95015b076", profil(T13 - H)]]), maintenant: T13 });
  ok(revue.couleur === "rouge", "le relevé du 12/11 l'a REVUE en ligne (vu_le après son début) → rouge", JSON.stringify([revue.couleur, revue.motif]));
  const incomplet = M.jugerRetraitEnRetard({ job: jf.job, fiche: jf.fiche, ventes: [{ created_at: "2026-10-31T13:09:00.305Z" }], source: null, annonces: [],
    releves: [{ ...runApres, items_vus: 5, total_entries: 12 }, { ...runApres, started_at: "2026-11-12T11:00:00Z", erreur: "[incomplet] coupé" }],
    profils: new Map([["d8b07167-48b8-40e9-a3e1-d2c95015b076", profil(T13 - H)]]), maintenant: T13 });
  ok(incomplet.couleur === "rouge", "un relevé INCOMPLET (5 sur 12, ou « [incomplet] ») ne dément rien → rouge", JSON.stringify([incomplet.couleur, incomplet.motif]));
  const autreBoutique = M.jugerRetraitEnRetard({ job: vin, fiche: { statut: "vendu", quantite: 0 }, ventes: venteA5, source: null,
    snapshotVinted: { status: "active", captured_at: "2026-11-07T08:07:17Z" },
    releves: [run({ kind: "dressing", started_at: "2026-11-08T08:00:00Z", items_vus: 40, total_entries: 40, vinted_user_id: "999999999" })], profils: pA5, maintenant: T13 });
  ok(autreBoutique.couleur === "rouge", "Vinted : le relevé d'une AUTRE boutique ne dément jamais (vue après la vente → rouge)", JSON.stringify([autreBoutique.couleur, autreBoutique.motif]));
  const memeBoutique = M.jugerRetraitEnRetard({ job: vin, fiche: { statut: "vendu", quantite: 0 }, ventes: venteA5, source: null,
    snapshotVinted: { status: "active", captured_at: "2026-11-07T08:07:17Z" },
    releves: [run({ kind: "dressing", started_at: "2026-11-08T08:00:00Z", items_vus: 553, total_entries: 553, vinted_user_id: "211104624" })], profils: pA5, maintenant: T13 });
  ok(memeBoutique.couleur === "relire" && memeBoutique.motif === "pas_revue_depuis", "Vinted : le relevé complet de LA boutique de l'annonce ne l'a pas revue → à relire", JSON.stringify([memeBoutique.couleur, memeBoutique.motif]));
  // Le classement et l'objet : le seul rouge prouvé fait sonner l'objet ; « à relire » a son bloc et ses lignes.
  const c = M.classerRetraitsEnRetard([jf, jl, jv2, jb8], T13);
  ok(c.rouges.length === 1 && c.relire?.length === 3 && c.lignesRelire?.length === 3,"f3aec8cc rouge ; 7c6f4b35, 450bdf41, 8bdf8095 à relire", JSON.stringify([c.rouges.length, c.relire?.length]));
  ok(M.sujetAvecDoubleVente("⚠️ FillSell ops-digest", c.rouges.length) === "🔴 Double vente possible : 1 — ⚠️ FillSell ops-digest", "l'objet ne compte que le rouge prouvé (avant : 4)");
  ok(/vendu le .* — vue en ligne le 05\/11 19:20 \(relevé : en ligne\), 20 h avant la vente/.test((c.lignesRelire ?? []).find((l) => /3300150365/.test(l)) ?? ""),
    "la ligne « à relire » dit la dernière vue et l'écart avec la vente (heure de Paris)", (c.lignesRelire ?? []).find((l) => /3300150365/.test(l)));
}

console.log("\n[G] ops-digest : le juge rallumé, les relevés lus, le bloc « à relire »");
{
  const od = lire("supabase/functions/ops-digest/index.ts");
  ok(/const CLASSER_RETRAITS_EN_RETARD = true;/.test(od), "le juge est rallumé (CLASSER_RETRAITS_EN_RETARD = true)");
  ok(/from\("vinted_sync_runs"\)[\s\S]{0,260}\.eq\("user_id", u\)\.eq\("platform", p\)\.eq\("status", "done"\)[\s\S]{0,120}\.order\("started_at", \{ ascending: false \}\)\.limit\(12\)/.test(od),
    "les derniers relevés terminés de chaque compte et plateforme (index user_id + started_at, 12 au plus)");
  ok(/releves: releves\.get\([^)]*job\.user_id[^)]*job\.platform[^)]*\) \?\? \[\]/.test(od), "le juge reçoit les relevés du compte sur la plateforme");
  ok(/🟡 À relire sur la plateforme/.test(od) && /retraits\.lignesRelire\.map/.test(od), "un bloc « à relire » dans le mail, avec ses lignes");
  ok(/sujetAvecDoubleVente\(mail\.subject, retraits\?\.rouges\.length \?\? 0\)/.test(od), "l'objet ne compte que les rouges");
}

console.log(ko ? `\n✗ ${ko} échec(s) sur ${n}` : `\n✓ ${n}/${n} — les retraits en retard : rouge = double vente prouvée, à relire = vendu peut-être en ligne, orange = geste attendu, blanc = sans risque`);
process.exit(ko ? 1 : 0);
