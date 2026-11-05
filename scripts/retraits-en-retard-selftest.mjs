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

  // 700d7aa3 : vue en ligne 68 s AVANT l'enregistrement de la vente, poste éteint depuis : rouge (vue avant la vente).
  const jp = juger({ annonces: [{ statut_plateforme: "en_ligne", vu_le: iso(T - 38 * H - 68_000) }], profils: profils(profil(T - 5 * J)) });
  ok(jp.couleur === "rouge" && jp.motif === "vue_avant_la_vente", "700d7aa3 : vue 1 min avant la vente, jamais vue retirée depuis → rouge (poste muet 5 j)", JSON.stringify([jp.couleur, jp.motif]));
  ok(/1 min avant la vente, jamais vue retirée depuis/.test(M.ligneRetrait(jp, T)) && /muet depuis 5 j/.test(M.ligneRetrait(jp, T)), "la ligne dit l'écart et le poste muet", M.ligneRetrait(jp, T));

  // Fenêtre : 47 h avant = rouge ; 49 h avant = pas rouge.
  ok(juger({ annonces: [{ statut_plateforme: "en_ligne", vu_le: iso(T - 38 * H - 47 * H) }] }).couleur === "rouge", "vue 47 h avant la vente : rouge");
  ok(juger({ annonces: [{ statut_plateforme: "en_ligne", vu_le: iso(T - 38 * H - 49 * H) }] }).couleur !== "rouge", "vue 49 h avant la vente : jamais rouge");
  // vendu_le prime sur l'enregistrement.
  ok(M.momentDeLaVente(retrait(), [{ vendu_le: iso(T - 40 * H), created_at: iso(T - 38 * H) }]) === T - 40 * H, "moment de la vente : vendu_le d'abord");
  ok(M.momentDeLaVente(retrait(), []) === T - 38 * H, "sans vente lue : l'armement du retrait");
  // eBay par l'API (aucune attente de session) : le poste ne compte pas.
  const je = juger({ job: retrait({ platform: "ebay", listing_url: "https://www.ebay.fr/itm/176726068488", platform_fields: { ...retrait().platform_fields } }),
    annonces: [{ statut_plateforme: "en_ligne", vu_le: iso(T - 38 * H - 5 * 60_000) }], profils: profils(profil(T - 60 * J)) });
  ok(je.couleur === "rouge", "eBay par l'API, poste muet 60 j : jugé quand même (le poste ne fait pas ce retrait)", JSON.stringify([je.couleur, je.motif]));
}

console.log("\n[B] ORANGE : le geste attendu de la personne");
{
  // c867ffe9 (e3618a5d) : Vinted vu 4 j avant la vente, attente de connexion Vinted.
  const jv = juger({
    job: retrait({ platform: "vinted", listing_url: "https://www.vinted.fr/items/10161738918-polo", platform_fields: { ...retrait().platform_fields, attente_connexion: { depuis: iso(T - 30 * J) } } }),
    snapshotVinted: { status: "active", captured_at: iso(T - 38 * H - 4 * J) },
  });
  ok(jv.couleur === "orange" && jv.motif === "connexion", "c867ffe9 : vue 4 j avant la vente, connexion Vinted attendue → orange", JSON.stringify([jv.couleur, jv.motif]));
  const jd = juger({ job: retrait({ platform: "depop", status: "needs_user", listing_url: "https://www.depop.com/products/x-y-a21a/", platform_fields: { ...retrait().platform_fields, needs_user_source: "depop_acces" } }) });
  ok(jd.couleur === "orange" && jd.motif === "depop_acces", "autorisation Depop attendue, aucune preuve : orange", JSON.stringify([jd.couleur, jd.motif]));
  const jbq = juger({ job: retrait({ platform: "vinted", status: "needs_user", listing_url: "https://www.vinted.fr/items/10499262943", platform_fields: { ...retrait().platform_fields, needs_user_source: "boutique_etrangere", boutique_etrangere: { login_article: "johandsr974" } } }) });
  ok(jbq.couleur === "orange" && jbq.motif === "boutique" && /@johandsr974/.test(jbq.mur.texte), "boutique Vinted étrangère : orange, boutique nommée", JSON.stringify(jbq.mur));
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
  ok(jm.couleur === "blanc" && jm.motif === "poste_muet_long" && jm.risque === true, "poste muet 40 j : blanc (une ligne par compte), le risque reste compté", JSON.stringify([jm.couleur, jm.motif, jm.risque]));
  ok(juger({ profils: profils(profil(null)) }).motif === "poste_muet_long", "poste jamais vu : muet");
  // Délégation Leboncoin : c'est le poste de l'exécutant qui compte.
  const AM = "faf5021a-479a-4bb3-b3ec-c296770739b7";
  const pd = new Map([
    [U, profil(T - 60 * J, { beta_flags: { delegation_leboncoin: { executant: AM, nom: "Amiral" } } })],
    [AM, profil(T - 5 * 60_000, { beta_flags: { execute_leboncoin_pour: [U] } })],
  ]);
  const jdl = juger({ profils: pd, annonces: [{ statut_plateforme: "en_ligne", vu_le: iso(T - H) }] });
  ok(jdl.couleur === "rouge" && jdl.delegue && /poste de Amiral \(délégation\)/.test(M.ligneRetrait(jdl, T)), "délégation Leboncoin : poste de l'exécutant vivant → jugé (rouge), exécutant nommé", JSON.stringify([jdl.couleur, jdl.motif, jdl.executantNom]));
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
    && /from\("annonces_plateforme"\)[\s\S]{0,120}\.in\("user_id", lotU\)\.in\("listing_id", lotN\)/.test(od)
    && /from\("vinted_listing_snapshots"\)[\s\S]{0,120}\.order\("captured_at", \{ ascending: false \}\)\.limit\(1\)/.test(od),
    "lit la fiche, ses ventes, le dépôt (clés utiles seulement), les annonces du même numéro (index), le dernier instantané Vinted");
  ok(/\.slice\(0, 100\)/.test(od) && /lots\(invIds, 100\)/.test(od) && /lots\(depots, 200\)/.test(od) && /lots\(users, 100\)/.test(od) && /lots\(numeros, 100\)/.test(od)
    && /\.in\("user_id", usersDesFiches\(lot\)\)/.test(od), "lots bornés (100 à 200 par .in(), comptes du lot seulement, 100 instantanés au plus)");
  ok(/executantsDeclares\(profils\)\.filter/.test(od) && /blocage_lbc:platform_settings->leboncoin->blocage_acces/.test(od), "profils : exécutants des délégations, pause Leboncoin");
  ok(/delete_overdue: retraits \? retraits\.rouges\.length \+ retraits\.oranges\.length : \(deletesOverdue \?\? \[\]\)\.length,/.test(od), "compteur : rouge + orange (le blanc ne fait jamais partir le mail)");
  ok(/🔴 Double vente possible — retraits non terminés > 24 h/.test(od) && /🟠 Retraits non terminés > 24 h — geste attendu de la personne/.test(od) && /⚪ Retraits non terminés > 24 h sans risque de double vente/.test(od),
    "trois blocs : rouge, orange, blanc");
  const iBloc = od.indexOf("!retraits ? section(");
  ok(iBloc > 0 && iBloc < od.indexOf("🔴 Files arrêtées alors que l'extension est ouverte"), "le bloc des retraits ouvre le mail");
  ok(/retraitsIllisibles = String\(\(e as Error\)\?\.message \?\? e\)/.test(od) && /🔴 Retraits \(delete\) non terminés > 24 h — risque de double vente\$\{retraitsIllisibles/.test(od),
    "classement illisible : la liste brute d'avant, avec la cause (jamais une panne du digest)");
  ok(/subject: sujetAvecDoubleVente\(mail\.subject, retraits\?\.rouges\.length \?\? 0\)/.test(od), "l'objet du mail passe par sujetAvecDoubleVente");
  ok(/subject: `\$\{filesArreteesLignes\.length \? `🔴 Files arrêtées \(extension ouverte\)/.test(od), "le reste de l'objet est inchangé");
}

console.log(ko ? `\n✗ ${ko} échec(s) sur ${n}` : `\n✓ ${n}/${n} — les retraits en retard : rouge = double vente possible, orange = geste attendu, blanc = sans risque`);
process.exit(ko ? 1 : 0);
