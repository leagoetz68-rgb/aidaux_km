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

-- Km effectués pour le compte d'un bénéficiaire
CREATE TABLE IF NOT EXISTS frais_km_benef_trajets (
  id TEXT PRIMARY KEY,
  salarie TEXT NOT NULL,
  mois TEXT NOT NULL,          -- format 'YYYY-MM'
  beneficiaire TEXT NOT NULL,
  date DATE NOT NULL,
  depart TEXT NOT NULL,
  arrivee TEXT NOT NULL,
  km NUMERIC NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_frais_km_benef_salarie_mois
ON frais_km_benef_trajets (salarie, mois);

-- Signature du bénéficiaire en fin de mois (verrouille la feuille)
CREATE TABLE IF NOT EXISTS frais_km_benef_signatures (
  salarie TEXT NOT NULL,
  mois TEXT NOT NULL,
  beneficiaire TEXT NOT NULL,
  signataire TEXT NOT NULL,     -- bénéficiaire ou son représentant
  signature TEXT NOT NULL,      -- image PNG (data URL)
  km_total NUMERIC NOT NULL,    -- total attesté au moment de la signature
  nb_trajets INTEGER NOT NULL,
  signe_le TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (salarie, mois, beneficiaire)
);
