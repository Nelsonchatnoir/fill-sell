import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        // Constantes injectées à la compilation par Vite (`define`,
        // vite.config.js:38-41) : elles n'existent pas dans le source, seul le
        // bundle les porte. Sans cette déclaration, no-undef les signalait
        // alors que le code est correct — et App.jsx les lit déjà derrière un
        // `typeof … !== 'undefined'`, ce qui couvre le cas du dev non buildé.
        // ⚠️ Toute nouvelle clé de `define` doit être ajoutée ICI aussi.
        __FILLSELL_APP_BUILD__: 'readonly',
        __FILLSELL_EXT_MIN_BUILD__: 'readonly',
      },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      // ⚠️ varsIgnorePattern '^[A-Z_]' exempte TOUT identifiant capitalisé :
      // un import de composant React orphelin ou une constante morte ne sont
      // jamais signalés (constaté le 04/09 en supprimant RepubBlocActif —
      // RefreshCw, ChevronUp et REPUB_DUREES sont restés muets). Angle mort
      // connu, à vérifier à la main lors des suppressions.
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },

  // ── EDGE FUNCTIONS (2026-09-04) ────────────────────────────────────────────
  // supabase/functions/**/*.ts n'était couvert par AUCUNE configuration :
  // eslint répondait « File ignored because no matching configuration was
  // supplied ». Toute la logique serveur — plafond de republication, pause de
  // respiration, paliers, orchestration des ventes — vivait donc hors de tout
  // contrôle statique, alors que c'est le code le plus difficile à tester.
  //
  // Réglage choisi après mesure sur le parc réel :
  //   · `no-unused-vars` de base DÉSACTIVÉE — elle doublonne la version TS et
  //     comptait chaque erreur deux fois (get-pending-jobs affichait 16
  //     « erreurs » pour 8 sites) ;
  //   · les `_` en tête sont ignorés (vars, args ET liaisons de catch) : le
  //     code serveur écrit `catch (_e) { /* best-effort */ }` partout, c'est
  //     une convention, pas un oubli ;
  //   · `no-explicit-any` en WARNING : 131 occurrences, c'est un chantier à
  //     part et il ne doit pas masquer les 23 vraies erreurs.
  // Résultat : 23 erreurs + 131 warnings sur l'ensemble, et get-pending-jobs
  // ressort à ZÉRO. AUCUNE n'est corrigée dans ce commit — décision Nico.
  ...tseslint.configs.recommended.map(c => ({ ...c, files: ['supabase/functions/**/*.ts'] })),
  {
    files: ['supabase/functions/**/*.ts'],
    languageOptions: {
      // Deno, pas Node : globals.worker couvre fetch/Request/Response/crypto,
      // et `Deno` lui-même est déclaré à la main.
      globals: { ...globals.worker, Deno: 'readonly' },
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', {
        varsIgnorePattern: '^_', argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
])
