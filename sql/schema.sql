CREATE TABLE IF NOT EXISTS frais_km_trajets (
  id TEXT PRIMARY KEY,
  salarie TEXT NOT NULL,
  mois TEXT NOT NULL,        -- format 'YYYY-MM'
  date DATE NOT NULL,
  depart TEXT NOT NULL,
  arrivee TEXT NOT NULL,
  km NUMERIC NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_frais_km_salarie_mois
ON frais_km_trajets (salarie, mois);

CREATE TABLE IF NOT EXISTS frais_km_settings (
  salarie TEXT PRIMARY KEY,
  domicile TEXT
);
