CREATE OR REPLACE FUNCTION public.cloud_ip_ajouter(p_commande text, p_ip inet, p_port integer, p_ville text, p_asn text, p_proxy_url text, p_expire_le timestamp with time zone)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_nom text := 'cloud_proxy_' || regexp_replace(p_commande, '[^0-9A-Za-z]', '', 'g') || '_' || replace(host(p_ip), '.', '_');
  v_rebut boolean := EXISTS (SELECT 1 FROM public.cloud_ips WHERE ip = p_ip AND rebut_le IS NOT NULL);
  v_usure integer := COALESCE((SELECT sum(attributions) FROM public.cloud_ips WHERE ip = p_ip), 0);
  v_id bigint;
BEGIN
  IF COALESCE(btrim(p_commande), '') = '' OR p_ip IS NULL THEN RAISE EXCEPTION 'cloud_ip_ajouter : commande ou IP absente'; END IF;
  IF p_expire_le IS NULL OR p_expire_le <= now() THEN RAISE EXCEPTION 'cloud_ip_ajouter : échéance absente ou passée'; END IF;
  IF COALESCE(p_proxy_url, '') = '' THEN RAISE EXCEPTION 'cloud_ip_ajouter : URL du proxy absente'; END IF;
  PERFORM vault.create_secret(p_proxy_url, v_nom, 'proxy FillSell Cloud ' || host(p_ip));
  INSERT INTO public.cloud_ips (commande, ip, port, ville, asn, secret_nom, expire_le, attributions,
                                etat, rebut_critere, rebut_le)
  VALUES (p_commande, p_ip, p_port, p_ville, p_asn, v_nom, p_expire_le, v_usure,
          CASE WHEN v_rebut THEN 'rebut' ELSE 'achetee' END,
          CASE WHEN v_rebut THEN 'deja_au_rebut' END,
          CASE WHEN v_rebut THEN now() END)
  RETURNING id INTO v_id;
  PERFORM public.cloud_journal(v_id, 'achat', NULL, jsonb_build_object('commande', p_commande, 'expire_le', p_expire_le,
          'deja_au_rebut', v_rebut, 'attributions_reprises', v_usure));
  RETURN v_id;
END;
$function$
