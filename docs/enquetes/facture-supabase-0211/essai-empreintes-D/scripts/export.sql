select url, dhash, phash, couleur, variantes, largeur, hauteur, calculee_le
from photo_empreintes
where url like 'https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/%'
  and source in ('empreintes-urls','doublons-balayage')
  and calculee_le >= '2026-11-02 14:55:00+01'
  and largeur <= 400 and hauteur <= 400
