// Le palier d'un compte : la règle vit dans supabase/functions/_shared/palier.js
// depuis le 05/10 (une seule source pour l'app, les fonctions edge et, en SQL,
// palier_de / palier_au_moins). Ce fichier garde les imports de l'app.
export * from "../../supabase/functions/_shared/palier.js";
