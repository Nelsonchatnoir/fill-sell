// Selftest — ventes Beebs prouvées par la page des ventes (18/10, lot 4).
//   npm run selftest:ventes-beebs-commandes
// Ce qu'il garantit, sur le code LIVRÉ (migration 20261018110000 + réparation des 6 ventes « Ailleurs ») :
//   a. le classement des statuts de commande Beebs (SQL) suit celui de l'extension (etatCommandeBeebs) :
//      toute commande payée est une vente, CANCELLED une annulation, litige / retour / inconnu : rien décidé ;
//   b. le rattachement se fait par l'IDENTIFIANT seulement (jamais un titre), un seul job exact, doute = rien,
//      fiche en stock, aucune ligne inchangée réécrite ; formes bornées ;
//   c. l'interrupteur est éteint par défaut et FAIL-CLOSED (absent = fantôme : rien écrit sur les jobs) ;
//      un bilan de comptes est écrit (aucune donnée personnelle) ;
//   d. une annulation lève la preuve de CETTE source ; une vente déjà enregistrée n'est jamais défaite ici ;
//   e. la réparation des 6 ventes : gardes d'état, sauvegarde, mails / notes / appels sortants comptés
//      avant-après, forme « beebs » des ventes Beebs ; inverse depuis la sauvegarde.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
let n = 0;
const cas = (nom, f) => { f(); n++; console.log(`  ✓ ${nom}`); };
console.log("ventes-beebs-commandes-selftest");

const MIG = lire("supabase/migrations/20261018110000_ventes_beebs_commandes.sql");
const INV = lire("supabase/rollbacks/20261018110000_ventes_beebs_commandes.sql");
const REP = lire("scripts/reparations/20261018_ventes_beebs_ailleurs.sql");
const REPI = lire("scripts/reparations/20261018_ventes_beebs_ailleurs_INVERSE.sql");
const fonction = (nom) => {
  const i = MIG.indexOf(`CREATE OR REPLACE FUNCTION public.${nom}(`);
  assert.ok(i >= 0, `fonction ${nom} absente`);
  return MIG.slice(i, MIG.indexOf("$function$;", i));
};
const CLASSE = fonction("beebs_commande_classe");
const NOTER = fonction("commandes_beebs_noter");

// Lecture du CASE SQL (forme écrite dans la migration : égalités, listes IN, préfixes LIKE).
function classeSql(statut) {
  const s = String(statut ?? "").toUpperCase();
  for (const m of CLASSE.matchAll(/WHEN upper\(coalesce\(p_statut, ''\)\) (LIKE '([A-Z_]+)%'|IN \(([^)]*)\)|= '([A-Z_]+)') THEN '([a-z]+)'/g)) {
    if (m[2] && s.startsWith(m[2])) return m[5];
    if (m[3] && m[3].split(",").map((x) => x.trim().replace(/^'|'$/g, "")).includes(s)) return m[5];
    if (m[4] && s === m[4]) return m[5];
  }
  return "inconnu";
}

cas("a. statuts : le serveur classe comme l'extension (payée = vente ; annulée ; litige/retour/inconnu = rien)", () => {
  const g = {};
  new Function("globalThis", "self", lire("chrome-extension/messagerie.js"))(g, g);
  const M = g.FILLSELL_MESSAGERIE;
  const statuts = ["WAIT_SELLER_CONFIRM", "WAIT_SELLER_CONFIRM_REMINDER", "CONFIRMED_BY_SELLER", "WAITING_GENARATING_LABEL_BY_SELLER",
    "LABEL_PRINTED", "LABEL_PRINTED_WARNING", "IN_DELIVERY", "DELIVERED", "DELIVERED_WARNING", "RETRIEVED_BY_BUYER",
    "APPROVED_BY_BUYER", "SELLER_PAID", "SELLER_PAID_MANUALLY", "CANCELLED", "LITIGATION_RETURN", "LITIGATION_OPEN", "LOST_PARCEL",
    "ARRANGEMENT", "", "QUELQUE_CHOSE"];
  const vente = new Set(["a_confirmer", "a_expedier", "expediee", "livree", "terminee"]);
  for (const s of statuts) {
    const e = M.etatCommandeBeebs(s).etat;
    const attendu = vente.has(e) ? "vente" : e === "annulee" ? "annulee" : "inconnu";
    assert.equal(classeSql(s), attendu, `${s || "(vide)"} : extension « ${e} » → serveur « ${attendu} »`);
  }
  assert.equal(classeSql("cancelled"), "annulee", "casse ignorée");
});

cas("b. rattachement par l'IDENTIFIANT seulement : un seul job Beebs publié de CE compte, doute = rien, jamais un titre", () => {
  assert.ok(/j\.user_id = v_user AND j\.platform = 'beebs' AND j\.status = 'published'[\s\S]{0,160}btrim\(coalesce\(j\.platform_listing_id, ''\)\) = v_id/.test(NOTER));
  assert.ok(/IF array_length\(v_jobs, 1\) > 1 THEN c_doute := c_doute \+ 1; CONTINUE; END IF;/.test(NOTER), "deux jobs = doute");
  assert.ok(!/titre|title|ilike|similarity/i.test(NOTER.replace(/--[^\n]*/g, "")), "aucun titre, aucune ressemblance (hors commentaires)");
  assert.ok(/IF NOT coalesce\(v_stock, false\) THEN c_fiche_vendue/.test(NOTER), "fiche déjà vendue : rien");
  assert.ok(/c_deja := c_deja \+ 1; CONTINUE;\s+-- preuve déjà là : aucune réécriture/.test(NOTER), "aucune ligne inchangée réécrite");
  assert.ok(/v_ref !~ '\^\[A-Za-z0-9_-\]\{6,80\}\$'/.test(NOTER) && /v_id !~ '\^\[0-9\]\{6,\}\$'/.test(NOTER), "formes bornées");
  assert.ok(/jsonb_array_elements\(p_rows\) LIMIT 10/.test(NOTER) && /jsonb_array_elements_text\(v_produits\) x LIMIT 10/.test(NOTER), "10 commandes, 10 produits");
  assert.ok(/'listing_id', v_id, 'state', 'sold', 'exact', true,\s+'source', 'commande_beebs'/.test(NOTER), "preuve = forme de ventes_prouvees_a_enregistrer (page_annonce_sold)");
  assert.ok(/'unavailable_since', coalesce\(c\.platform_fields ->> 'unavailable_since',/.test(NOTER), "date de la commande : une vente ancienne n'envoie jamais de mail");
});

cas("c. interrupteur éteint, fail-closed (absent = fantôme) ; bilan de COMPTES ; droits", () => {
  assert.ok(/INSERT INTO public\.coin_config \(key, value\) VALUES \('ventes_beebs_commandes', 0\) ON CONFLICT \(key\) DO NOTHING;/.test(MIG));
  assert.ok(/v_ecrit := coalesce\(\(SELECT c\.value FROM coin_config c WHERE c\.key = 'ventes_beebs_commandes'\), 0\) = 1;/.test(NOTER));
  // Toute écriture sur un job est sous v_ecrit.
  const maj = [...NOTER.matchAll(/UPDATE cross_post_jobs/g)].length;
  assert.equal(maj, 1);
  assert.ok(/IF v_ecrit THEN\s+UPDATE cross_post_jobs c/.test(NOTER), "fantôme : aucune preuve posée");
  assert.ok(/IF NOT v_ecrit THEN c_levees := c_levees \+ 1;\s+ELSIF signal_vente_lever/.test(NOTER), "fantôme : aucune preuve levée");
  assert.ok(/INSERT INTO usage_logs \(user_id, feature, metadata\) VALUES \(v_user, 'ventes_beebs_commandes', v_bilan\)/.test(NOTER));
  assert.ok(/interval '6 hours'/.test(NOTER), "lecture sans commande : un bilan au plus par 6 h");
  assert.ok(/unnest\(ARRAY\['liens', 'illisibles', 'requetes'\]\) k\s+WHERE coalesce\(p_lecture ->> k, ''\) ~ '\^\[0-9\]\{1,6\}\$'/.test(NOTER), "lecture : des entiers seulement");
  assert.ok(/IF auth\.uid\(\) IS NOT NULL AND p_user IS NOT NULL AND p_user <> auth\.uid\(\) THEN\s+RAISE EXCEPTION 'utilisateur non autorisé';/.test(NOTER));
  assert.ok(/REVOKE ALL ON FUNCTION public\.commandes_beebs_noter\(jsonb, uuid, jsonb\) FROM PUBLIC, anon;/.test(MIG));
  assert.ok(/GRANT EXECUTE ON FUNCTION public\.commandes_beebs_noter\(jsonb, uuid, jsonb\) TO authenticated, service_role;/.test(MIG));
  assert.ok(/DROP FUNCTION IF EXISTS public\.commandes_beebs_noter\(jsonb, uuid, jsonb\);/.test(INV) && /DELETE FROM public\.coin_config WHERE key = 'ventes_beebs_commandes';/.test(INV), "inverse complet");
});

cas("d. annulée : la preuve de CETTE source est levée ; une vente enregistrée n'est jamais défaite ici", () => {
  assert.ok(/j\.platform_fields #>> '\{sale_evidence,source\}' = 'commande_beebs'\s+AND j\.platform_fields #>> '\{sale_evidence,commande\}' = v_ref LOOP/.test(NOTER));
  assert.ok(/signal_vente_lever\(v_job, 'commande_beebs_annulee'/.test(NOTER));
  assert.ok(/c_annulee_apres := c_annulee_apres \+ \(SELECT count\(\*\)/.test(NOTER), "déjà vendue : comptée seulement");
  assert.ok(!/DELETE FROM ventes|vente_commande_annulee_vinted|UPDATE ventes|UPDATE inventaire/.test(NOTER), "aucune vente ni fiche touchée");
});

cas("e. réparation des 6 ventes : gardes, sauvegarde, forme « beebs », zéro mail / note / appel sortant, inverse", () => {
  for (const id of [77407, 87308, 94454, 125115, 142259, 158347]) assert.ok(REP.includes(String(id)), `vente ${id}`);
  assert.ok(/o\.cle = 'annonce:beebs:' \|\| v\.annonce_id/.test(REP) && /j\.status = 'sold' AND btrim\(j\.platform_listing_id\) = v\.annonce_id/.test(REP), "preuve : reçu du job Beebs vendu, numéro exact");
  assert.ok(/IF to_regclass\('public\._backup_1810_ventes_beebs_ailleurs'\) IS NOT NULL THEN/.test(REP), "jamais deux fois");
  assert.ok(/UPDATE public\.ventes SET plateforme = 'beebs', plateforme_code = 'beebs'/.test(REP));
  assert.ok(/UPDATE public\.inventaire SET plateforme = 'beebs'/.test(REP));
  assert.ok(/count\(\*\) FROM public\.email_logs\) <> \(SELECT mails FROM _cpt\)/.test(REP) && /count\(\*\) FROM public\.push_ventes\) <> \(SELECT notes FROM _cpt\)/.test(REP)
    && /count\(\*\) FROM net\.http_request_queue\) <> \(SELECT appels FROM _cpt\)/.test(REP), "mails, notes et appels sortants comptés");
  assert.ok(!/UPDATE public\.push_ventes|INSERT INTO public\.(ventes|push_ventes|email_logs)/.test(REP), "aucune note ni mail écrit");
  assert.ok(/FROM public\._backup_1810_ventes_beebs_ailleurs b\s+WHERE b\.quoi = 'vente'/.test(REPI) && /DROP TABLE public\._backup_1810_ventes_beebs_ailleurs;/.test(REPI));
});

console.log(`ventes-beebs-commandes-selftest : ${n} cas verts`);
