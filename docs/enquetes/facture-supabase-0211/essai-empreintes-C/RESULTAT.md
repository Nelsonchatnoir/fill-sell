# Essai à blanc C — empreinte sans transformation, redressée et réduite comme Supabase (02/11 soir)

Lundi 02/11/2026, 18:55 → 21:15 (heure de Paris). Rien d'écrit ni de déployé en prod, 0 requête vers
`/storage/v1/render/`, lecture seule de la base. Conclusions chiffrées seulement : aucune donnée client, aucun cas
nommé ; les données de travail ont été supprimées.

## Verdict

**Pas de bascule proposée : la méthode C n'a pas zéro pire.** Elle est bien plus proche de l'actuelle que l'essai B et
ne fait aucune action automatique fausse, mais sur les 200 décisions qui changent encore, 74 sont pires, 82 meilleures,
37 équivalentes, 7 indécidables : des paires au bord d'un seuil, qui basculent dans les deux sens.

| décisions | comparées | changent | meilleures | pires | équivalentes | indécidables |
|---|---|---|---|---|---|---|
| Moteur v3, passe du cron | 1 229 (838 comptes) | **0** | — | — | — | — |
| Moteur v3, tout le stock rejugé | 6 494 | 60 sujets (29 comptes) | 11 | 13 | 31 | 5 |
| Doublons (« même article ? ») | 38 685 035 paires | 58 niveaux | 25 | 27 | 4 | 2 |
| Lecteurs JS (dépôt ↔ annonce, annonce ↔ fiche) | 30 015 paires | 54 | 30 | 24 | 0 | 0 |
| fiches_meme_photo_questions | 564 / 571 paires | 27 | 16 | 10 | 1 | 0 |
| fusion_photo_tick | 1 033 annonces | 1 | 0 | 0 | 1 | 0 |
| **Total** | | **200** | **82** | **74** | **37** | **7** |

Actions automatiques (fusion, rattachement « même ») dans ces 200 cas : fausses avec C **0**, avec A **1** ; justes
manquées : C 21, A 28. Les pires de C sont des questions (perdues ou fausses) et des « même » ramenés à « proche ».
Jugement : titre d'abord, photos regardées pour 48 cas.

## 1. La méthode C
Sur l'originale (`/storage/v1/object/public/…`) : redressée selon l'orientation EXIF, réduite dans 400 × 400 (contain,
jamais agrandie, moyenne des surfaces), puis le calcul d'empreinte d'aujourd'hui, inchangé. Les photos hors bucket ne
passaient pas par la transformation : leur calcul ne change pas.

Sonde de 500 photos (dont les 50 grands écarts de l'essai B) :
| variante | dHash identique | pHash identique | Δ dHash moyen | grands écarts ≥ 20 bits restants (sur 50) |
|---|---|---|---|---|
| B, originale | 59 % | 67 % | 3,46 | 50 |
| C0, redressée | 66 % | 74 % | 0,63 | 3 |
| **C1, redressée + réduite (retenue)** | **80 %** | **93 %** | **0,32** | **0** |
| C2, C1 + JPEG q80 | 70 % | 88 % | 0,56 | 2 |

## 2. Tout le bucket recalculé
63 828 photos lues (2 052 fichiers supprimés du stockage, hors comparaison), 18,1 Go. Orientation EXIF : 48 photos.
dHash identique **80,5 %** (essai B : 66,9 %), écarts ≥ 5 bits 237 (B : 364), ≥ 20 bits **0** (B : 50) ; pHash
identique 92,0 % (B : 72,9 %), ≥ 5 bits 2 (B : 96). Temps local par photo : médiane 118 ms, 99e centile 491 ms ;
originale moyenne 283 Ko.

## 3. Les seuils
250 428 444 paires de photos : les seuils actuels sont déjà les meilleurs pour chaque règle ; tout décalage augmente
les désaccords (ex. identique d ≤ 5 et p ≤ 8 : 1 058 désaccords ; d ≤ 6 : 4 363 ; d ≤ 4 : 4 453 — proche d ≤ 10 :
29 531 ; 9 : 135 369 ; 11 : 175 865). Ce qui reste est un bruit symétrique de 1-2 bits, qu'aucun seuil ne rattrape.

## 4. Ce que ça veut dire
Au bord d'un seuil, la décision tient à 1-2 bits que la réduction + recompression du service tire d'une façon, et
toute autre méthode d'une autre. Zéro pire n'est atteignable qu'en reproduisant la transformation à l'octet (libvips en
WebAssembly, réglages d'imgproxy) : essai D, non fait. Garder les empreintes actuelles et calculer les nouvelles en C
mélangerait les méthodes : exclu.

## 5. Coût par cycle
| option | transformations | egress en plus | décisions |
|---|---|---|---|
| Garder l'identique | ≈ 47 000 à 78 000 photos neuves → **≈ 235 à 390 $**, croît avec les utilisateurs | 0 | identiques |
| Méthode C | **0 $** | ≈ +12 à 20 Go (0 à ≈ 1,8 $) ; une fois 18 Go | 82 meilleures, 74 pires, 0 action automatique fausse |
| D, transformation reproduite à l'octet (non essayée) | 0 $ | idem C | identiques si l'octet est atteint |
