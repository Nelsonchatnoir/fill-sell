# `retrait_annonces` compte N pour 1 — diagnostic

**16/09/2026. Diagnostic seul : RIEN n'est corrigé, aucune ligne d'`usage_logs`
n'est touchée.**

---

## a) La cause : un geste sans accusé de réception, et sans verrou

**Ce n'est pas un écouteur en double, ni un effet React rejoué, ni une boucle
sur une liste.** C'est l'utilisateur qui tape plusieurs fois, parce que rien ne
lui répond — et chaque tap lance une suppression complète et indépendante.

Le chemin `suppression_article` (`delItem` → `performItemDeletion`, App.jsx) :

| | |
|---|---|
| verrou de ré-entrance | **aucun** |
| bouton désactivé pendant l'exécution | **non** |
| retrait optimiste de la carte | **non** (`delItem` ne touche pas `items`) |
| durée avant que l'écran bouge | `buildDeletePlan` + inserts + `fetchAll` — **1 à 2 s sur mobile** |

Pendant cette seconde ou deux, la carte reste à l'écran, le bouton reste actif,
et **aucun indicateur ne dit que quelque chose se passe**. L'utilisateur
retape. Chaque tap refait tout le parcours.

### Pourquoi les rafales sont si SERRÉES (7 lignes en 27 ms)

C'est le point qui trompe : 27 ms, ce n'est pas l'écart entre les taps, c'est
l'écart entre les **fins** des exécutions. Le 1er tap fait le trajet complet
(plan + insert + update + delete + log). Les suivants trouvent un article déjà
supprimé : `buildDeletePlan` rend une liste vide, `inventaire.delete()` efface
0 ligne **sans erreur**, et ils arrivent donc au journal beaucoup plus vite.
Ils rattrapent le premier et atterrissent en grappe.

### La preuve que c'est bien CE chemin, et lui seul

Toutes les rafales relevées depuis l'ouverture du journal (13/09) :

| Compte | Chemin | N | Étalement |
|---|---|---:|---:|
| seghirdeborah711 | `suppression_article` | 2 | 2 ms |
| seghirdeborah711 | `suppression_article` | 4 | 304 ms |
| yohan05022004 | `suppression_article` | 4 | 250 ms |
| akrimolacrymale | `suppression_article` | 4 | 129 ms |
| **nicolas.svobodny** | `suppression_article` | **7** | 82 ms |
| axelco2019 (Xouxou) | `suppression_article` | 7 | 27 ms |

**Six rafales, six fois `suppression_article`. Zéro sur les deux autres
chemins.** Et ce n'est pas un hasard de volume — c'est que les deux autres ont
la garde qui manque ici :

```js
// StockTab.jsx, armRemoveJob → chemin logo_stock
async function armRemoveJob(item, platform) {
  if (removeBusy) return null;      // ⬅ verrou de ré-entrance
  ...
  setRemoveBusy(platform);          // ⬅ et l'écran passe en « retrait… »
```

`logo_stock` : **15 lignes, 15 gestes réels, 0 en trop.**
`bandeau_hors_ligne` : 5 lignes, 5 gestes (volume trop faible pour conclure que
sa protection est solide — `armRemovals` n'a pas de verrou explicite non plus,
il est seulement lancé depuis un bandeau qui disparaît).

### ⚠️ Deux des trois cas signalés ne sont PAS des doublons

- **Camille201292 (la.mode.licyca), 14 lignes à 17:04-17:05 : toutes légitimes.**
  Chemin `logo_stock`, **7 articles différents × 2 plateformes** (Leboncoin puis
  Beebs sur chacun), espacées de 1 à 6 secondes. C'est exactement ce qu'elle a
  fait. Rien à corriger de ce côté.
- **Akld Producer, 11:49 : ligne normale, nom trompeur.** Il a supprimé un
  article qui n'avait jamais été publié (`n_annonces: 0`). Le journal le note
  **par conception** (règle du 13/09 : une suppression d'article est
  irréversible même sans annonce). C'est le défaut de nommage du § d), pas un
  bug de comptage.

---

## b) ⛔ OUI, LA MÊME CAUSE DUPLIQUE LES JOBS DE RETRAIT — et c'est mesuré

C'est la question qui compte, et la réponse est la mauvaise.

`buildDeletePlan` a bien une garde : les plateformes qui portent déjà un job
`delete` actif (`retraitsEnCours`) sortent de `online`. **Mais c'est une garde
lue-puis-écrite.** Entre la lecture du plan et l'insert des jobs il y a un
aller-retour réseau. Deux taps qui tombent dans cette fenêtre lisent tous les
deux « aucun retrait en cours » et insèrent tous les deux le lot complet.

**Relevé en base — jobs `delete` en double sur la MÊME annonce :**

| Date | Compte | Plateformes doublées | Écart |
|---|---|---|---:|
| 17/08 15:34:59 | 0a24c951 | **vinted ×2 ET leboncoin ×2** | 68 ms |
| 27/08 15:10:46 | 0a24c951 | **vinted ×2 ET leboncoin ×2** | 47 ms |
| 01/09 07:54:56 | 0a24c951 | vinted ×2 | 16 ms |

5 cas sous 5 secondes, **5 jobs de retrait en trop**, 1 compte touché.
Les deux plateformes doublées EN MÊME TEMPS signent le chemin
`suppression_article` (il arme toutes les plateformes d'un coup) — `logo_stock`,
lui, n'arme qu'une plateforme par clic.

**Et ces jobs ont été EXÉCUTÉS** : ils sont tous en `status='deleted'`.
L'extension a donc ouvert un onglet, navigué et tenté un second retrait sur une
annonce déjà partie. Ça n'a pas cassé — mais c'est du travail fait deux fois
sur le parcours le plus irréversible de l'app.

> **Le scénario que tu redoutais est réel.** Sur les 6 rafales du journal, les
> articles n'avaient aucune annonce en ligne (`n_annonces: 0`) : seul le journal
> a gardé la trace. Sur un article réellement publié sur 4 plateformes, 7 taps
> arment jusqu'à **28 jobs de retrait** au lieu de 4. Ce n'est pas théorique :
> c'est déjà arrivé à 2 plateformes à la fois, deux fois.

**Ampleur limitée pour l'instant** (5 jobs en trop, 1 compte) parce que la
fenêtre de course est courte et qu'il faut taper vite. Elle s'élargit sur
mobile, sur réseau lent, et sur un article avec beaucoup de plateformes — c'est
-à-dire exactement là où l'utilisateur est le plus tenté de retaper.

---

## c) De combien le compteur est faux

Depuis l'ouverture du journal (13/09) :

| Chemin | Lignes brutes | Gestes réels | En trop |
|---|---:|---:|---:|
| `suppression_article` | **56** | **34** | **+22 (+65 %)** |
| `logo_stock` | 15 | 15 | 0 |
| `bandeau_hors_ligne` | 5 | 5 | 0 |
| **TOTAL** | **76** | **54** | **+22 (+41 %)** |

**Qui lit ce compteur :** personne automatiquement. `ops-digest` ne compte que
`lens_identify` ; aucune vue SQL, aucune edge function ne lit
`retrait_annonces`. Il n'est lu qu'à la main, en SQL. **Donc : aucun tableau de
bord n'est faux aujourd'hui, mais toute requête passée ou future qui compte les
lignes brutes surestime les suppressions d'articles de ~65 %.**

Dédoublonnage correct, à utiliser tant que ce n'est pas corrigé :

```sql
-- une rafale = même user + mêmes métadonnées à moins de 10 s
select count(*) filter (where rang = 1 or created_at - t0 > interval '10 seconds')
from (
  select u.*, row_number() over (partition by u.user_id, u.metadata order by u.created_at) as rang,
         min(u.created_at) over (partition by u.user_id, u.metadata) as t0
  from usage_logs u where u.feature = 'retrait_annonces'
) r;
```

---

## d) Le défaut de conception : un nom pour deux gestes

Tu as raison, et le cas Akld le montre en une ligne : `retrait_annonces` mélange

- **« je supprime un article de mon stock »** — geste local, irréversible, qui
  peut ne toucher AUCUNE plateforme (Akld : 0 annonce ; Xouxou : 0 annonce) ;
- **« je retire mes annonces des plateformes »** — geste distant, qui crée de
  vrais jobs `delete` et fait disparaître des annonces (Camille).

Le `chemin` les distingue dans les métadonnées. Le **nom de la feature** ne les
distingue pas — et c'est le nom qu'on lit dans les mesures.

### Ce que je propose

**Deux features, et un geste peut en émettre les deux.**

| Feature | Émise quand | Ce qu'elle mesure |
|---|---|---|
| `suppression_article` | à chaque suppression d'article, **toujours** | l'attrition du stock |
| `retrait_annonces` | **seulement si `n_annonces > 0`** | des annonces réellement retirées des plateformes |

Une suppression d'un article publié sur 3 plateformes émet donc **deux** lignes :
une `suppression_article` (1 article) et une `retrait_annonces` (3 annonces).
Chaque compteur redevient lisible seul, sans avoir à filtrer sur `chemin`.
`chemin` reste tel quel, comme sous-qualification de la voie empruntée.

⚠️ **Frontière de lecture.** Les 76 lignes existantes gardent leur nom — c'est
la trace, on n'y touche pas. Toute requête qui traverse la date de bascule doit
donc lire `feature='retrait_annonces'` **et** `metadata->>'chemin'` pour la
période d'avant. À écrire dans le commit du correctif, pas à redécouvrir dans
six mois.

---

## Le correctif, quand tu le diras

Trois choses, dans cet ordre d'importance :

1. **Un verrou de ré-entrance sur `delItem`/`performItemDeletion`**, comme
   `removeBusy` d'`armRemoveJob`. C'est lui qui ferme la fenêtre de course des
   jobs — le point (b), le seul qui ait des conséquences réelles.
2. **Un accusé de réception immédiat** : bouton désactivé + carte retirée de la
   liste dès le clic. C'est la cause première : sans réponse, on retape.
3. **La séparation des deux features** (§ d).

Le (1) et le (2) se tiennent : le verrou empêche le dégât, le retour d'écran
empêche le geste. L'un sans l'autre laisse un utilisateur qui tape dans le vide.
