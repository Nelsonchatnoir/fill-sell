ALTER TABLE inventaire ADD COLUMN IF NOT EXISTS plateforme text;
ALTER TABLE ventes ADD COLUMN IF NOT EXISTS plateforme text;
