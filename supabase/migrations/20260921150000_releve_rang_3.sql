-- ═══════════════════════════════════════════════════════════════════════════
-- UN ÉTAT LU SUR L'ANNONCE DU VENDEUR NE SE FAIT PAS ÉCRASER PAR UN SCAN
-- (2026-09-21, GO explicite de Nico)
-- ═══════════════════════════════════════════════════════════════════════════
-- `inventaire_attributs_rang` (posée le 07/09) ne connaît pas les sources
-- `releve_*` : elles tombaient donc dans le `ELSE 0`, le rang le plus bas de
-- l'échelle. Conséquence mécanique, dans `inventaire_attributs_fusion` :
--
--     rang(nouveau) >= rang(ancien)  →  on écrit
--
-- un `lens` (rang 1) ou un `vinted_liste` (rang 2) écrasait une valeur LUE SUR
-- LA PAGE DU VENDEUR. C'est la même règle que celle posée aujourd'hui pour le
-- texte — « ce qui vient de son annonce fait foi » — appliquée à l'état, à la
-- taille, à la marque, à la couleur et à la matière.
--
-- LE RANG RETENU : 3, comme `capture`. Les deux sont la même chose — une
-- lecture de la page de l'annonce — et `>=` fait donc gagner la PLUS RÉCENTE
-- des deux, ce qui est le comportement voulu. `vinted_detail` (4) et `manuel`
-- (5) continuent de primer : le détail Vinted est plus riche qu'un relevé de
-- liste, et une saisie de la personne prime sur tout.
--
-- ⛔ AUCUNE VALEUR PASSÉE N'EST RÉÉCRITE. Cette migration ne touche que la
--    fonction de rang : elle décide des fusions À VENIR. Mesuré avant
--    application, et rapporté à Nico sans rien changer : 629 lignes sur 477
--    articles porteraient aujourd'hui une valeur différente si la règle avait
--    existé (237 états, 163 tailles, 147 marques, 74 couleurs, 8 matières).
--
-- ⚠️ `backfill_job` (1 282 attributs, 482 articles) est AUSSI inconnue de la
--    fonction, donc au rang 0. Elle n'entre PAS dans cette migration : Nico n'a
--    tranché que les `releve_*`. Signalé, pas décidé.
--
-- PRÉFIXE, PAS LISTE FERMÉE : `starts_with(p_source, 'releve_')` couvre les
-- quatre relevés d'aujourd'hui (beebs, leboncoin, ebay, opla) ET le prochain.
-- Une liste nommée se périme au premier relevé ajouté, et elle se périmerait
-- EN SILENCE — la valeur retomberait au rang 0 sans que rien ne le dise.

CREATE OR REPLACE FUNCTION public.inventaire_attributs_rang(p_source text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE
    WHEN p_source = 'manuel'                    THEN 5
    WHEN p_source = 'vinted_detail'             THEN 4
    WHEN p_source = 'capture'                   THEN 3
    WHEN starts_with(p_source, 'releve_')       THEN 3
    WHEN p_source = 'vinted_liste'              THEN 2
    WHEN p_source = 'lens'                      THEN 1
    ELSE 0 END;
$function$;

-- ── SAUVEGARDE : le corps EXACT d'avant, pour revenir en une commande ───────
-- (relu en prod le 21/09 par pg_get_functiondef avant d'écrire cette migration)
--
-- CREATE OR REPLACE FUNCTION public.inventaire_attributs_rang(p_source text)
--  RETURNS integer
--  LANGUAGE sql
--  IMMUTABLE
-- AS $function$
--   SELECT CASE p_source
--     WHEN 'manuel'        THEN 5
--     WHEN 'vinted_detail' THEN 4
--     WHEN 'capture'       THEN 3
--     WHEN 'vinted_liste'  THEN 2
--     WHEN 'lens'          THEN 1
--     ELSE 0 END;
-- $function$;
