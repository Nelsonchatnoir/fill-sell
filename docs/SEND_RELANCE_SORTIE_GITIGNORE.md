# send-relance — comment la remettre sous git sans exposer de secret

*Proposition du 19/09/2026. Rien n'est appliqué : ce document décrit le geste,
il ne le fait pas.*

## Pourquoi c'est un problème aujourd'hui

`.gitignore:69` exclut tout `supabase/functions/send-relance/`. Conséquence :
**847 lignes de code applicatif n'existent nulle part dans le dépôt.** Pas
d'historique, pas de revue, pas de `git diff` possible, et surtout : aucune
source de vérité quand deux sessions travaillent en parallèle.

Le seul filet actuel est la fonction déployée elle-même — on peut la
retélécharger (`supabase functions download`, ou l'API des Edge Functions, qui
rend les fichiers du bundle). C'est ce qui a servi le 19/09 au soir pour
trancher une divergence supposée. Ça marche, mais ça veut dire que la
sauvegarde du code, c'est la prod.

## Ce qui justifie vraiment l'exclusion — et ce qui ne la justifie pas

Relevé sur le fichier, ce soir :

| Contenu | Lignes / volume | Doit rester hors dépôt ? |
|---|---|---|
| `const SECRET = "…"` | 1 ligne | **OUI** — c'est un identifiant partagé en clair |
| Adresses e-mail d'utilisateurs en dur | **111 adresses distinctes** | **OUI** — données personnelles |
| Corps `ARCH("vNNN")` (stubs déjà vidés) | 60 déclarations | non — ils ne contiennent aucun texte |
| Corps encore complets (403, cookies Samira, Eric, démo) | ~5 | non — textes génériques, aucun nom |
| Les 4 segments de réactivation (A/B/C/D) | ~110 lignes | non — textes de campagne, aucun destinataire |
| Le reste : verrous, pagination, fenêtre horaire, appels à la porte | ~600 lignes | **non** — c'est de la logique, elle mérite une revue |

**Deux choses sur 847 lignes justifient l'exclusion.** Tout le reste est
exclu par effet de bord.

## Le geste, en trois temps

### 1. Le secret sort du code

```ts
// Avant
const SECRET = "…";
// Après
const SECRET = Deno.env.get("SEND_RELANCE_SECRET");
if (!SECRET) return json({ error: "secret non configuré" }, 500);
```

Posé une fois comme secret de fonction (`supabase secrets set`), il n'apparaît
plus jamais dans un fichier. ⚠️ Le secret actuel est **compromis de fait** : il
a vécu en clair sur disque et dans les bundles déployés. Le changer à cette
occasion, ne pas le recycler.

### 2. Les adresses sortent du code — elles n'y ont jamais eu leur place

C'est de la **donnée**, pas du code. `ALL_EMAILS` existe pour lier
`adresse → sujet + corps` ; il suffit d'enlever l'adresse de cette liaison.

Le point d'entrée porte DÉJÀ l'adresse : `?only_to=<adresse>__<suffixe>`. La
liste en dur ne sert qu'à retrouver le corps. On la réindexe donc **par
suffixe seul** :

```ts
// Avant : { to: "prenom.nom@exemple.fr__cookies_0809", subject: …, html: … }
// Après : { cle: "cookies_0809",                       subject: …, html: … }
// et l'appel devient ?cle=cookies_0809&to=<adresse>
```

Zéro adresse dans le fichier, et le comportement ne change pas d'un iota — le
destinataire était déjà fourni à l'appel.

Si un jour il faut garder la trace de qui a reçu quoi, `email_logs` le fait
depuis le 19/09 (type `relance_manuelle:<suffixe>`, colonne `email`). Ce n'est
plus au code de porter cette mémoire.

### 3. On retire l'exclusion, on commite, on pose une garde

```
# .gitignore — supprimer les 3 lignes 67-69
```

Puis une garde qui refuse la régression, en pre-commit ou en CI :

```sh
# Aucune adresse e-mail littérale, aucun secret littéral dans la fonction
grep -nE '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' \
     supabase/functions/send-relance/index.ts \
  | grep -v 'support@fillsell.app' && exit 1
grep -nE 'const SECRET\s*=\s*"' supabase/functions/send-relance/index.ts && exit 1
```

`support@fillsell.app` est notre propre boîte d'expédition : elle reste.

## Ce que ça change concrètement

- `git log` redevient possible sur 847 lignes qui pilotent de vrais envois ;
- deux sessions parallèles cessent de se marcher dessus en silence : un
  `git status` montre qui a touché quoi ;
- le code cesse d'avoir la prod pour seule sauvegarde ;
- et le fichier redevient relisable — aujourd'hui personne ne peut le
  reviewer, il n'apparaît dans aucune diff.

## Ordre recommandé

1. changer le secret (il est compromis), le poser en variable d'environnement ;
2. réindexer `ALL_EMAILS` par suffixe, retirer les 111 adresses ;
3. vérifier que la fonction répond toujours (`?cle=…&to=…`, sans envoyer) ;
4. retirer les lignes du `.gitignore`, commiter le fichier ;
5. poser la garde grep.

Les étapes 1 et 2 ne doivent PAS être faites pendant qu'une autre session
écrit dans le même fichier : c'est le seul exemplaire.
