# Point 1 (02/11 soir) — mesure des recalculs d'empreintes (lecture seule)

Scripts lancés depuis le dépôt ; données gardées hors dépôt (dossier temporaire de la session).
- `f.sql` : comptes de `photo_empreintes` et de `storage.objects` (24 h).
- `i1.sql`, `i2.sql` : export des empreintes du bucket (url, calculée le, sans variantes) et des fichiers du bucket
  (nom, eTag, taille, créé le) — croisés EN LOCAL (une jointure en base a dépassé le délai et a été coupée par elle).
- `cmp.mjs` : instantané du 02/11 16:27 (`empreintes-A.ndjson` de l'essai à blanc) contre la base → recalculs d'une URL.
- `croise.mjs` : empreintes 24 h / 30 j par dossier, même fichier sous une autre URL, même contenu (eTag + taille).
- `jours.mjs` : empreintes par jour et âge du fichier empreinté.
- `dups.mjs` : les copies identiques (même compte, quels dossiers), part depuis le 15/10 et sur 24 h.
- `identiques2.mjs` : deux copies identiques ont-elles la même empreinte stockée ? (dimensions, dates).
- `q.sh` : une requête SQL en lecture seule, lignes en JSON.
