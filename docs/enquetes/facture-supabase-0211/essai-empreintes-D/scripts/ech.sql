select count(*) as n,
  count(*) filter (where largeur <= 400 and hauteur <= 400) as reduites,
  min(calculee_le) as debut, max(calculee_le) as fin
from photo_empreintes
where url like 'https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/%'
  and source in ('empreintes-urls','doublons-balayage')
  and calculee_le >= '2026-11-02 14:55:00+01'
