-- INVERSE de 20261108_nicotest_retour_free.sql : remet la ligne sauvegardée (drapeaux et fin de période d'avant).
UPDATE public.profiles p
   SET is_premium = b.is_premium, is_pro = b.is_pro, is_business = b.is_business, subscription_period_end = b.subscription_period_end
  FROM public._backup_0811_nicotest_free b
 WHERE p.id = b.id
RETURNING p.id, p.is_premium, p.is_pro, p.is_business, p.subscription_period_end;
