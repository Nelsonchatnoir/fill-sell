-- Nettoyage de essai-reel-preuve-vue-en-ligne.sql (compte d'essai hoosslocal) :
-- jobs, fiches, ventes éventuelles et notes d'essai. email_logs gardé (preuve).
delete from push_ventes where user_id = '5322fa18-c194-458b-a222-7ee4093c4968' and annonce_id in ('ESSAI-0610-R', 'ESSAI-0610-A');
delete from ventes where user_id = '5322fa18-c194-458b-a222-7ee4093c4968' and inventaire_id in (1791306100001, 1791306100002);
delete from cross_post_jobs where user_id = '5322fa18-c194-458b-a222-7ee4093c4968' and platform_listing_id in ('ESSAI-0610-R', 'ESSAI-0610-A');
delete from inventaire where user_id = '5322fa18-c194-458b-a222-7ee4093c4968' and id in (1791306100001, 1791306100002);
