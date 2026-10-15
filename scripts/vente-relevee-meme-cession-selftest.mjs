// selftest:vente-relevee-meme-cession — (15/10, lot H) Une vente Vinted déjà
// ENREGISTRÉE par la lecture des commandes (commande_ref, annonce_id = numéro
// exact de l'annonce) clôt la carte « Vendue » et passe la fiche vendue —
// jamais une deuxième vente, jamais un mail. Cas fondateurs : Pedro grays
// (Pull Lacoste, vente 105996 du 02/10) et Hassan Said (Chaussures Strole,
// vente 85028 du 27/09) — fiche restée « en stock » malgré la vente.
// Rejeu annulé sur la prod le 15/10 : 2 cartes closes, 0 vente créée, 2 notes
// nées « déclarées » (aucun mail), arriéré de l'ops-digest 3 → 1.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const mig = lire('supabase/migrations/20261015120000_vente_relevee_meme_cession.sql');
const inv = lire('supabase/rollbacks/20261015120000_vente_relevee_meme_cession_INVERSE.sql');
let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; console.log(`  ✓ ${msg}`); };
const fn = (nom) => { const i = mig.indexOf(`CREATE OR REPLACE FUNCTION public.${nom}(`); return mig.slice(i, mig.indexOf('$function$;', i)); };
const quoi = fn('vente_relevee_meme_cession');
const clore = fn('signal_vente_clore_vente_relevee');
const reco = fn('signaux_vente_reconcilier');

console.log('1. Les deux preuves ensemble, jamais une seule');
ok(/j\.platform IS DISTINCT FROM 'vinted'/.test(quoi) && /v_annonce := nullif\(btrim\(j\.platform_listing_id\), ''\);/.test(quoi), 'Vinted, sur le numéro EXACT de l\'annonce (jamais le titre)');
ok(/v\.commande_ref IS NOT NULL AND btrim\(coalesce\(v\.annonce_id, ''\)\) = v_annonce/.test(quoi), 'la vente vient de la COMMANDE Vinted de cette annonce');
ok(/IF v_n <> 1 THEN RETURN NULL; END IF;/.test(quoi) && /coalesce\(i\.quantite, 1\) > 1 THEN RETURN NULL/.test(quoi) && /i\.statut IS DISTINCT FROM 'stock'/.test(quoi), 'une seule vente, fiche en stock à un seul exemplaire (jamais une fiche à quantité)');
ok(/o\.cle = 'annonce:vinted:' \|\| v_annonce/.test(quoi), 'aucun reçu existant pour cette annonce (jamais deux fois)');
const iDem = reco.indexOf('signal_vente_vu_en_ligne'); const iRel = reco.indexOf('vente_relevee_meme_cession(c.id)');
ok(iDem > 0 && iRel > iDem, 'une carte démentie par le relevé (annonce revue en ligne) n\'arrive jamais jusqu\'ici');

console.log('2. Ce que fait la règle');
ok(/signal_vente_clore_meme_cession\(p_job, p_vente, p_par\)/.test(clore), 'reçu « même cession » et job « vendu » par la fonction existante');
ok(/set_config\('fillsell\.vente_declaree', '1', true\)/.test(clore) && /UPDATE public\.inventaire SET quantite = 0, statut = 'vendu'/.test(clore), 'fiche vendue, en vente DÉCLARÉE (aucun mail, aucun push)');
ok(!/INSERT INTO public\.ventes\b/.test(mig) && !/enregistrer_vente_atomique\(/.test(mig.replace(/--.*$/gm, '')), 'aucune vente créée');
ok(/public\.vente_relevee_meme_cession\(p_job\) IS DISTINCT FROM p_vente/.test(clore), 'revérifiée au moment d\'agir');
ok(/DROP FUNCTION IF EXISTS public\.vente_relevee_meme_cession\(uuid\);/.test(inv) && /CREATE OR REPLACE FUNCTION public\.signaux_vente_reconcilier/.test(inv), 'inverse prêt');

console.log(`\n✓ vente-relevee-meme-cession : ${n} contrôles verts`);
