-- ═══════════════════════════════════════════════════════════════════════════
-- LA PASSE DE RAPPROCHEMENT EN TRANCHES (12/10, cas ferreirasab)
-- ═══════════════════════════════════════════════════════════════════════════
-- Cause : la fonction edge `rapprochement` (v19) calculait toute la passe d'un
-- compte en une invocation. Une fonction edge n'a que 2 s de CPU par appel
-- (tous plans) ; le compte de ferreirasab (3 082 nœuds, 59 028 lectures de
-- photos de vêtements d'enfant sur fond blanc) en demandait 3,5 : « CPU Time
-- exceeded » à chaque passe (12/10, 09:01 → 09:30 UTC, 2,4 à 3,2 s), puis le
-- disjoncteur arrêtait le compte. Désormais (_shared/rapprochement/tranches.js)
-- la passe se découpe en unités bornées, reprises d'une invocation à l'autre :
--   · rapprochement_tranches : ce qu'une invocation a calculé (parts des
--     tiroirs, liste des candidates, morceaux de paires évaluées), sous la
--     signature des données lues (chantier) ; tout est effacé quand la passe
--     aboutit, et toute ligne d'un autre chantier du compte est effacée au
--     début d'un nouveau. Table interne, comme veille_cpu : service_role seul,
--     RLS sans politique (rien n'est visible de l'app).
--   · rapprochement_v3_empreintes_compactes : les empreintes d'une liste de
--     photos en hexadécimal (3,2 Mo au lieu de 9 pour ferreirasab) — chaque
--     invocation les relit. Mêmes lignes que rapprochement_v3_empreintes, même
--     lecture côté moteur (photos.js : photoDepuisCompacte ≡ photoDepuisEmpreinte) :
--     16 chiffres hexa pour une chaîne de 64 bits, { "brut": valeur } sinon.
-- Rien d'autre ne change : rapprochement_v3_lire, rapprochement_v3_appliquer,
-- le disjoncteur et l'ops-digest restent tels quels.

CREATE TABLE IF NOT EXISTS public.rapprochement_tranches (
  user_id  uuid        NOT NULL,
  chantier text        NOT NULL,
  cle      text        NOT NULL,
  contenu  text        NOT NULL,
  cree_le  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, chantier, cle)
);
CREATE INDEX IF NOT EXISTS rapprochement_tranches_cree_le ON public.rapprochement_tranches (cree_le);
ALTER TABLE public.rapprochement_tranches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rapprochement_tranches FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rapprochement_tranches TO service_role;

CREATE OR REPLACE FUNCTION public.rapprochement_v3_empreinte_hexa(p jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN p IS NULL OR jsonb_typeof(p) = 'null' THEN NULL
    WHEN jsonb_typeof(p) = 'string' AND (p #>> '{}') ~ '^[01]{64}$'
      THEN to_jsonb(lpad(to_hex((p #>> '{}')::bit(64)::bigint), 16, '0'))
    ELSE jsonb_build_object('brut', p)
  END;
$function$;

CREATE OR REPLACE FUNCTION public.rapprochement_v3_empreintes_compactes(p_urls text[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
    'e', COALESCE((
      SELECT jsonb_agg(jsonb_build_array(
               e.url,
               rapprochement_v3_empreinte_hexa(to_jsonb(e.dhash)),
               rapprochement_v3_empreinte_hexa(to_jsonb(e.phash)),
               CASE WHEN jsonb_typeof(e.variantes) IN ('object', 'array') THEN 1 ELSE 0 END)
             || (SELECT jsonb_agg(x.v ORDER BY x.o) FROM (
                   SELECT k.o * 2 o, CASE WHEN jsonb_typeof(e.variantes) = 'object' AND jsonb_typeof(e.variantes -> k.k) = 'array'
                                            AND jsonb_array_length(e.variantes -> k.k) = 2
                                          THEN COALESCE(rapprochement_v3_empreinte_hexa(e.variantes -> k.k -> 0), jsonb_build_object('brut', NULL)) END v
                     FROM unnest(ARRAY['c70', 'p85', 'g45', 'g60', 'g35']) WITH ORDINALITY k(k, o)
                   UNION ALL
                   SELECT k.o * 2 + 1, CASE WHEN jsonb_typeof(e.variantes) = 'object' AND jsonb_typeof(e.variantes -> k.k) = 'array'
                                            AND jsonb_array_length(e.variantes -> k.k) = 2
                                          THEN COALESCE(rapprochement_v3_empreinte_hexa(e.variantes -> k.k -> 1), jsonb_build_object('brut', NULL)) END
                     FROM unnest(ARRAY['c70', 'p85', 'g45', 'g60', 'g35']) WITH ORDINALITY k(k, o)) x))
        FROM photo_empreintes e WHERE e.url = ANY (p_urls)), '[]'::jsonb),
    'illisibles', COALESCE((SELECT jsonb_agg(x.url) FROM photo_empreintes_echecs x WHERE x.url = ANY (p_urls)), '[]'::jsonb));
$function$;

REVOKE ALL ON FUNCTION public.rapprochement_v3_empreinte_hexa(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rapprochement_v3_empreintes_compactes(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rapprochement_v3_empreinte_hexa(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.rapprochement_v3_empreintes_compactes(text[]) TO service_role;
