// Autotest de supabase/functions/_shared/lbc-localisation.js — la commune
// retapée à la republication Leboncoin, jamais le lieu-dit (XEWER, 25/09).
//   node scripts/lbc-localisation-selftest.mjs
import { localisationLbcATaper } from "../supabase/functions/_shared/lbc-localisation.js";

let ko = 0;
const verifie = (nom, cond, detail = "") => {
  if (cond) console.log(`ok   ${nom}`);
  else { ko++; console.log(`KO   ${nom} ${detail}`); }
};

// Le cas fondateur : relevé en base sur d1f94cbe / 5fe3fb95 / 04664706.
{
  const { loc, change } = localisationLbcATaper({
    voie: null, ville: "Saint-Yrieix-sur-Charente", code_postal: "16710",
    libelle: "Saint-Yrieix-sur-Charente 16710 Les Rochers", pose_par: "x",
  });
  verifie("lieu-dit retiré du libellé", change && loc.libelle === "Saint-Yrieix-sur-Charente 16710", JSON.stringify(loc));
  verifie("lieu-dit gardé en trace", loc.lieu_dit === "Les Rochers" && loc.libelle_annonce === "Saint-Yrieix-sur-Charente 16710 Les Rochers");
  verifie("champs structurés intacts", loc.ville === "Saint-Yrieix-sur-Charente" && loc.code_postal === "16710" && loc.pose_par === "x");
}
// Quartier de grande ville (relevé du parc).
{
  const { loc, change } = localisationLbcATaper({ ville: "Marseille", code_postal: "13006", libelle: "Marseille 13006 Lodi" });
  verifie("quartier retiré", change && loc.libelle === "Marseille 13006" && loc.lieu_dit === "Lodi");
}
// Déjà à la commune : rien ne bouge (France et comptes identiques).
{
  const e = { ville: "Roost-Warendin", code_postal: "59286", libelle: "Roost-Warendin 59286" };
  const { loc, change } = localisationLbcATaper(e);
  verifie("commune seule inchangée", !change && loc.libelle === e.libelle && !("lieu_dit" in loc));
}
// Réparé à la main ce soir : idempotent.
{
  const { change } = localisationLbcATaper({ ville: "Saint-Yrieix-sur-Charente", code_postal: "16710", libelle: "Saint-Yrieix-sur-Charente 16710" });
  verifie("idempotent", !change);
}
// Sans ville ou sans code postal : on ne fabrique rien.
{
  const a = localisationLbcATaper({ ville: null, code_postal: "91160", libelle: "91160" });
  const b = localisationLbcATaper({ ville: "Lyon", code_postal: null, libelle: "Lyon 3e" });
  verifie("sans ville : inchangé", !a.change && a.loc.libelle === "91160");
  verifie("sans code postal : inchangé", !b.change && b.loc.libelle === "Lyon 3e");
}
// Libellé d'une autre forme : commune recomposée, pas de lieu-dit inventé.
{
  const { loc, change } = localisationLbcATaper({ ville: "La Hague", code_postal: "50440", libelle: "Landemer 50440" });
  verifie("autre forme : commune, sans lieu-dit deviné", change && loc.libelle === "La Hague 50440" && !("lieu_dit" in loc));
}
verifie("null → null", localisationLbcATaper(null).loc === null);

if (ko) { console.log(`\n${ko} échec(s)`); process.exit(1); }
console.log("\nlbc-localisation : tout passe");
