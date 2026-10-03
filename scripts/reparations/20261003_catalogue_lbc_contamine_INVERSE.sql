-- INVERSE de 20261003_catalogue_lbc_contamine.sql — remet les 10 lignes du
-- catalogue Leboncoin telles qu'avant la réparation (depuis la sauvegarde).
-- ⛔ À ne lancer que sur décision : il remet aussi la contamination.
begin;
update public.platform_category_aspects a
set allowed_values = b.allowed_values, required = b.required
from public._backup_0310_catalogue_lbc b
where b.id = a.id;
commit;
