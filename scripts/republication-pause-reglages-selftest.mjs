// selftest:republication-pause-reglages — (15/10, lot A, Louis — compte
// Amiral) « Tout mettre en pause » puis « Tout relancer » rend EXACTEMENT les
// réglages d'avant ; une plateforme que FillSell a quittée (Opla) n'est plus
// active nulle part ; l'écran dit la même chose que la config.
// Faits du 15/10 (journaux de l'API, sub = Louis) : pause 14/10 20:13:57,
// reprise 15/10 08:55:48 (active_le identique à la microseconde sur Vinted,
// Leboncoin, Beebs ET Opla), puis CINQ écritures d'horaires champ par champ
// entre 08:58:43 et 08:59:11 (64, 66, 66, 63, 62 octets : { platform, fuseau,
// de | a }) — les créneaux 08:00-23:59 / 00:00-23:59 viennent de ces gestes,
// pas de la pause. Rejeu annulé de 20261015100000 sur la prod (15/10 ~09:53) :
// pause puis reprise → Vinted 15:00-23:59, Leboncoin 08:00-15:00, Beebs
// 00:00-08:00 inchangés ; Opla reste arrêtée (plateforme_sortie) ; 3 actives.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = path.dirname(fileURLToPath(import.meta.url));
const lire = (p) => fs.readFileSync(path.join(ici, '..', p), 'utf8').replace(/\r\n/g, '\n');
let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; console.log(`  ✓ ${msg}`); };

const mig = lire('supabase/migrations/20261015100000_plateforme_quittee_jamais_active.sql');
const inv = lire('supabase/rollbacks/20261015100000_plateforme_quittee_jamais_active_INVERSE.sql');
const bloc = (debut, finMarque) => {
  const i = mig.indexOf(debut);
  const j = finMarque ? mig.indexOf(finMarque, i + debut.length) : mig.length;
  return mig.slice(i, j < 0 ? mig.length : j);
};
const reglage = bloc('CREATE OR REPLACE FUNCTION public.republish_planifiee_reglage(', 'CREATE OR REPLACE FUNCTION public.republish_planifiee_pause_generale(');
const pause = bloc('CREATE OR REPLACE FUNCTION public.republish_planifiee_pause_generale(', 'CREATE OR REPLACE FUNCTION public.republish_planifiee_regler(');
const regler = bloc('CREATE OR REPLACE FUNCTION public.republish_planifiee_regler(', '-- Les réglages déjà posés');

console.log('1. La pause ne touche jamais aux créneaux');
ok(!/'de'|'a'\s*,|'creneau'/.test(pause.replace(/--.*$/gm, '')), 'pause_generale n’écrit ni de, ni a, ni creneau (seulement actif, dates, motif, mémoire)');
ok(/CONTINUE WHEN NOT COALESCE\(\(v_cur ->> 'pause_generale'\)::boolean, false\);/.test(pause), 'la reprise ne rallume QUE ce que la pause a éteint');

console.log('2. Une plateforme quittée n’est plus active nulle part');
ok(/CREATE OR REPLACE FUNCTION public\.republish_planifiee_pf_sortie\(p_platform text\)/.test(mig)
  && /lower\(COALESCE\(p_platform, ''\)\) \|\| '_sortie_le'/.test(mig), 'pf_sortie lit la clé <pf>_sortie_le (Opla : opla_sortie_le), aucune liste en dur');
ok(/IF public\.republish_planifiee_pf_sortie\(v_pf\) THEN v_invalide := 'plateforme_sortie'; END IF;/.test(reglage), 'réglage d’une plateforme quittée : invalide, donc jamais actif (balayage, état, actives, part égale)');
ok(/IF public\.republish_planifiee_pf_sortie\(v_pf\) THEN[\s\S]*?'arret_motif', 'plateforme_sortie'[\s\S]*?CONTINUE;/.test(pause), '« Tout relancer » ne rallume plus une plateforme quittée, et ne la compte pas');
ok(/IF v_actif AND public\.republish_planifiee_pf_sortie\(v_pf\) THEN\s*RETURN jsonb_build_object\('ok', false, 'reason', 'plateforme_sortie'/.test(regler), 'le réglage refuse de la rallumer (l’arrêter reste permis)');
ok(/_backup_1510_plateforme_sortie/.test(mig) && /REVOKE ALL ON public\._backup_1510_plateforme_sortie FROM PUBLIC, anon, authenticated;/.test(mig)
  && /'arret_motif', 'plateforme_sortie'\), true\)/.test(mig), 'réglages existants passés par la même règle, sauvegarde fermée à l’API');
ok(/Définitions de départ : pg_get_functiondef EN PROD/.test(mig) && /DROP FUNCTION IF EXISTS public\.republish_planifiee_pf_sortie\(text\);/.test(inv)
  && /FROM public\._backup_1510_plateforme_sortie b/.test(inv), 'parti de la prod ; inverse prêt (définitions d’avant + réglages sauvegardés)');
ok(!/republish_espacement|republish_pause_apres|republish_plafond_jour/.test(mig.replace(/--.*$/gm, '')), 'cadence intacte : aucune clé d’espacement, de pause ni de plafond touchée');

console.log('3. L’écran dit la même chose que la config');
const hook = lire('src/hooks/useRepublicationPlanifiee.js');
const pg = hook.slice(hook.indexOf('const pauseGenerale = useCallback('), hook.indexOf('return { etat, etatMulti'));
ok(!/plateformes:\s*_n/.test(pg), 'la réponse de la pause garde la LISTE des plateformes (plus de « — » partout ni d’interrupteur éteint à tort)');
ok(/if \(!Array\.isArray\(reste\.plateformes\)\) \{ await lire\(\); return data; \}/.test(pg), 'sans liste lisible : on relit, on n’affiche pas un état vide');
const app = lire('src/components/RepublicationPlanifiee.jsx');
ok(/pfsVisibles\.filter\(\(pf\) => parPlateforme\?\.\[pf\]\?\.actif === true\)\.length/.test(app), '« N/M actives » compte les lignes montrées qui tournent (plus 4/4 avec Opla cachée)');
const ligne = app.slice(app.indexOf('function LignePlateforme('), app.indexOf('export function RepublicationPlanifieePlateformes('));
ok(!/s\.inconnu \? '—'/.test(ligne) && /lecture…/.test(ligne), 'une ligne sans état dit « lecture… » (ou « illisible »), jamais un « — » muet');
ok(/plateforme_sortie: fr \?/.test(app), 'refus « plateforme quittée » dit en français');
ok(/plateformesPlanifieesVisibles/.test(lire('src/tabs/StockTab.jsx')), 'le Stock lit la même liste (même hook, même réponse)');

console.log(`\n✓ republication-pause-reglages : ${n} contrôles verts`);
