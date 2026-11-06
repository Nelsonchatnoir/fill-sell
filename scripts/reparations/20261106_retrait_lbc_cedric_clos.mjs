// (06/11, ordre de Nico, point 11) Retrait Leboncoin 1b7be2d6 de Cédric GRIZSTYLE (annonce 3303036848), en boucle depuis le
// 05/11 (410 « Cette annonce est désactivée » lu dans la fenêtre de modération, chaque lecture comptée comme un essai).
// Aucun essai depuis le 05/11 à 23:04 (heure de Paris ; prochain prévu 23:34, jamais venu) : la clôture est écrite par la CLÔTURE DU SERVEUR, mot pour mot
// celle de handler-watch (ecrireRetraitDejaAbsent : champsRetraitDejaAbsent, puis copiesAClore / clotureCopie de
// _shared/retrait-deja-absent.js) — deleted, error NULL, deja_absente, aucun message au vendeur, copie publiée close
// « pas une vente ». Preuve : la page publique relue le 06/11 à 09:57 (heure de Paris) depuis leboncoin.fr — HTTP 410,
// <h1>Cette annonce est désactivée</h1>, aucune annonce dans la page —, 11 h 30 après le dépôt FillSell (05/11 22:27),
// bien après la fenêtre de modération de 2 h. (Le relevé « Mes annonces » l'avait vue « active » à 22:30 ; Leboncoin
// l'a désactivée avant 22:48.)
//   node scripts/reparations/20261106_retrait_lbc_cedric_clos.mjs <lecture.json> > 20261106_retrait_lbc_cedric_clos.sql
// lecture.json : { retrait, pubs } relus juste avant (SELECT seulement). Le SQL produit sauvegarde, écrit en
// compare-and-swap (retrait encore « pending », copie encore « published »), et a son inverse.
import { readFileSync } from "node:fs";
import { champsRetraitDejaAbsent, copiesAClore, clotureCopie, numeroAnnonceDuJob } from "../../supabase/functions/_shared/retrait-deja-absent.js";

const { retrait: j, pubs } = JSON.parse(readFileSync(process.argv[2], "utf8"));
if (j?.id !== "1b7be2d6-fef6-4cbb-ba8b-71994e021449" || j.status !== "pending" || j.action !== "delete") throw new Error("retrait inattendu");
const numero = numeroAnnonceDuJob(j);
if (numero !== "3303036848") throw new Error(`numéro inattendu : ${numero}`);
const le = new Date().toISOString();
const par = "réparation 06/11 (Nico, point 11) : 410 relu 11 h 30 après le dépôt";
const verdict = {
  numero, vente: null, delete_confirmed_by: "etat_annonce",
  preuve: { source: "page_publique", etat: "unavailable", http: 410, h1: "Cette annonce est désactivée", lu_le: "2026-11-06T08:57:31.351Z",
    url: "https://www.leboncoin.fr/ad/vetements/3303036848", depot_le: "2026-11-05T21:27:45.168Z", heures_apres_depot: 11.5,
    lu_par: "Claude (onglet leboncoin.fr de Nico, lecture seule), ordre de Nico du 06/11" },
};
const pf = champsRetraitDejaAbsent(j.platform_fields, { verdict, platform: "leboncoin", erreur: j.error ?? null, statut: j.status, par, maintenantIso: le });
const copies = copiesAClore(pubs ?? [], j, numero).map((s) => ({ id: s.id, patch: clotureCopie(s.platform_fields, { le, retraitId: j.id, numero }) }));
const lit = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`;
const txt = (s) => (s == null ? "NULL" : `'${String(s).replace(/'/g, "''")}'`);
console.log(`-- Produit par scripts/reparations/20261106_retrait_lbc_cedric_clos.mjs le ${le}. Inverse : 20261106_retrait_lbc_cedric_clos_INVERSE.sql.
BEGIN;
DO $garde$ BEGIN
  IF to_regclass('public._backup_0611_retrait_lbc_cedric') IS NOT NULL THEN RAISE EXCEPTION 'script déjà passé : rien n''est écrit'; END IF;
END $garde$;
CREATE TABLE public._backup_0611_retrait_lbc_cedric AS
SELECT now() AS le, j.id, j.status, j.error, j.platform_fields FROM public.cross_post_jobs j
 WHERE j.id IN ('${j.id}'${copies.map((c) => `, '${c.id}'`).join("")});
ALTER TABLE public._backup_0611_retrait_lbc_cedric ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0611_retrait_lbc_cedric FROM PUBLIC, anon, authenticated;
DO $ecrit$ DECLARE n int; BEGIN
  UPDATE public.cross_post_jobs SET status = 'deleted', error = NULL, platform_fields = ${lit(pf)}
   WHERE id = '${j.id}' AND action = 'delete' AND status = 'pending';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'le retrait a bougé (statut lu : pending) : rien n''est écrit'; END IF;
END $ecrit$;
${copies.map((c) => `UPDATE public.cross_post_jobs SET status = ${txt(c.patch.status)}, error = ${txt(c.patch.error)}, platform_fields = ${lit(c.patch.platform_fields)}
 WHERE id = '${c.id}' AND status = 'published';`).join("\n")}
SELECT j.id, j.action, j.status, j.error, j.platform_fields->'deja_absente'->'preuve'->>'http' http, j.platform_fields->>'retrait_par' retrait_par
  FROM public.cross_post_jobs j JOIN public._backup_0611_retrait_lbc_cedric b ON b.id = j.id;
COMMIT;`);
console.error(`retrait ${j.id} → deleted (deja_absente) ; ${copies.length} copie(s) close(s) : ${copies.map((c) => c.id).join(", ")}`);
