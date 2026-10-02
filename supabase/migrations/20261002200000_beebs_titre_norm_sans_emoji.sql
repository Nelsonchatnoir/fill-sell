-- ═══════════════════════════════════════════════════════════════════════════
-- BEEBS — LE TITRE « EXACT » DE LA MÉTHODE DU MOMENT DU DÉPÔT, AUX EMOJI PRÈS
-- (02/10 soir, point 1)
-- ═══════════════════════════════════════════════════════════════════════════
-- Cas : ornellaracano, pull Zara déposé sur Beebs le 30/09 (dba189b3, sans
-- numéro : poste en 0.6.79). Le job s'appelle « Pull / tunique longue Zara
-- taille S 💙 », l'annonce relevée « Pull / tunique longue Zara taille S » :
-- Beebs a ôté l'emoji (relevé en base le 02/10 : 6 dépôts sur 6 reliés par
-- leur numéro dont le titre portait un emoji ont perdu TOUS leurs emoji sur
-- Beebs ; 19 annonces Beebs sur 1 538 en portent, déposées hors FillSell).
-- beebs_numeros_par_sequence exigeait le titre EXACT aux espaces près : la
-- fenêtre ne trouvait aucune annonce, le dépôt restait sans numéro, et la
-- retenue silencieuse Beebs (29/09) ignorait son annonce à chaque relevé — sans
-- jamais poser la question « Est-ce cette annonce ? ».
--
-- Changement : beebs_titre_norm retire les pictogrammes (emoji, sélecteurs de
-- variante, liant ZWJ, modificateurs de teint) des DEUX côtés, puis resserre les
-- espaces. Aucun autre caractère ne bouge : lettres, chiffres, ponctuation,
-- tirets typographiques restent comparés à l'identique. Les deux autres preuves
-- de la méthode (rang entre les ancres, photo) sont inchangées ; sans photo
-- identique, c'est la question à la personne, jamais un numéro posé.
-- Seul utilisateur : beebs_numeros_par_sequence (vérifié par pg_proc le 02/10).
-- Retour arrière : supabase/rollbacks/20261002200000_beebs_titre_norm_sans_emoji.sql
-- ═══════════════════════════════════════════════════════════════════════════
SET lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.beebs_titre_norm(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp' AS $f$
  SELECT regexp_replace(btrim(regexp_replace(
           COALESCE(p, ''),
           '[\U0001F000-\U0001FAFF☀-➿⬀-⯿︎️‍⃣]', '', 'g')),
         '\s+', ' ', 'g');
$f$;
