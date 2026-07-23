CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS sources (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, url TEXT NOT NULL UNIQUE, enabled BOOLEAN NOT NULL DEFAULT true,
 last_synced_at TIMESTAMPTZ, last_error TEXT, config_count INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS configs (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), fingerprint CHAR(64) NOT NULL UNIQUE, uri TEXT NOT NULL, protocol TEXT NOT NULL,
 host TEXT, port INTEGER, country CHAR(2), label TEXT, source_id UUID REFERENCES sources(id) ON DELETE SET NULL,
 imported_at TIMESTAMPTZ NOT NULL DEFAULT now(), last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(), is_public BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS configs_explorer_idx ON configs(protocol, country, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS configs_latency_idx ON configs(protocol);
CREATE TABLE IF NOT EXISTS test_results (
 id BIGSERIAL PRIMARY KEY, config_id UUID NOT NULL REFERENCES configs(id) ON DELETE CASCADE, status TEXT NOT NULL CHECK (status IN ('queued','running','working','failed','timeout')),
 latency_ms INTEGER, speed_bps BIGINT, country CHAR(2), error_code TEXT, tested_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS test_results_config_tested_idx ON test_results(config_id, tested_at DESC);
CREATE TABLE IF NOT EXISTS imports (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), filename TEXT, total INTEGER NOT NULL DEFAULT 0, accepted INTEGER NOT NULL DEFAULT 0, rejected INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'processing', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), completed_at TIMESTAMPTZ
);
INSERT INTO sources (name, url) VALUES ('TUry / Config', 'https://raw.githubusercontent.com/TuryTury0/Config/main/config.txt') ON CONFLICT (url) DO NOTHING;
