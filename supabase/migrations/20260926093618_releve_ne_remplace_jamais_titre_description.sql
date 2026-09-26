-- ═══════════════════════════════════════════════════════════════════════════
-- UN RELEVÉ NE REMPLACE JAMAIS UN TITRE NI UNE DESCRIPTION (2026-09-26)
-- ═══════════════════════════════════════════════════════════════════════════
-- APPLIQUÉE le 26/09 (GO Nico) — version enregistrée 20260926093618. SQL
-- exécuté = ce fichier, commentaires d'en-tête abrégés.
-- Jouée à blanc avant (article de test de Nico, transaction annulée) :
--   E1 PATCH extension sur titre/description non vides → gardés, prix écrit ;
--   E2 PATCH extension sur titre/description vides → remplis ;
--   E3 app web, E4 app mobile, E5 synchro Vinted (POST), E6 serveur
--   (service_role), E7 sans requête (cron, migration) → écrits comme avant.
-- Vérifié après : trigger actif (BEFORE UPDATE OF titre, description).
-- CONSTAT (preuve France 0.6.69) : la capture d'un relevé recopie dans le
-- stock le titre (et la description) de la plateforme dès que la personne ne
-- les a pas retouchés elle-même — règle « on suit la plateforme » de
-- reporterCaptureSurArticle (extension, depuis la 0.6.49, 21/09). Le titre du
-- stock suit donc la DERNIÈRE plateforme relevée : anglais (eBay), coupé
-- (listes), « Marque générique … » (Opla). Mesuré le 26/09 : 20 comptes,
-- ~99 articles candidats.
--
-- LA RÈGLE (Nico) : un relevé ne remplace JAMAIS un titre ou une description
-- existants ; il ne remplit que ce qui est vide.
--
-- ⛔ SERVEUR SEUL, sans nouvelle extension. La seule écriture de l'extension
--    qui touche titre/description d'un article EXISTANT est le PATCH de
--    reporterCaptureSurArticle (inventaire?id=eq.…). On le reconnaît à coup
--    sûr — prouvé sur de vraies requêtes le 26/09 (diagnostic 20260926092254) :
--    méthode PATCH, en-tête Origin « chrome-extension://… », jeton d'un
--    utilisateur. Dans ce seul cas, un titre ou une description NON VIDES
--    sont gardés tels quels ; vides, ils sont remplis comme avant.
-- ⛔ AUCUN EFFET sur :
--    · l'app web et mobile (origine fillsell.app / capacitor), donc Lens,
--      l'écran de publication, la fiche, la publication en lot ;
--    · le serveur (fonctions edge, triggers, service_role) ;
--    · le premier import (INSERT) et la synchro du dressing Vinted, qui
--      écrit SES propres fiches par upsert (POST), jamais par PATCH ;
--    · tous les autres champs de la capture (photos, prix, marque, attributs).

create or replace function public.inventaire_releve_garde_textes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_h jsonb;
begin
  begin
    if coalesce(current_setting('request.method', true), '') <> 'PATCH' then return new; end if;
    if coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'authenticated' then return new; end if;
    v_h := nullif(current_setting('request.headers', true), '')::jsonb;
    if coalesce(v_h ->> 'origin', '') not like 'chrome-extension://%' then return new; end if;
    if nullif(btrim(old.titre), '') is not null and new.titre is distinct from old.titre then
      new.titre := old.titre;
    end if;
    if nullif(btrim(old.description), '') is not null and new.description is distinct from old.description then
      new.description := old.description;
    end if;
  exception when others then
    -- Jamais un point de panne : l'écriture passe comme avant.
    raise warning 'inventaire_releve_garde_textes (article %) : %', new.id, sqlerrm;
  end;
  return new;
end;
$$;
revoke all on function public.inventaire_releve_garde_textes() from public, anon, authenticated;

drop trigger if exists inventaire_releve_garde_textes on public.inventaire;
create trigger inventaire_releve_garde_textes
  before update of titre, description on public.inventaire
  for each row
  execute function public.inventaire_releve_garde_textes();
