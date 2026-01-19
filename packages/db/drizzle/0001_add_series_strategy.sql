-- Add series-based strategy columns
ALTER TABLE strategies 
ADD COLUMN IF NOT EXISTS series_slug varchar(200),
ADD COLUMN IF NOT EXISTS limit_price numeric(10,6) DEFAULT '0.49',
ADD COLUMN IF NOT EXISTS position_size_usdc numeric(18,2) DEFAULT '50';

-- Make legacy columns nullable (for backward compatibility)
ALTER TABLE strategies 
ALTER COLUMN market_id DROP NOT NULL,
ALTER COLUMN yes_token_id DROP NOT NULL,
ALTER COLUMN no_token_id DROP NOT NULL,
ALTER COLUMN yes_limit_price DROP NOT NULL,
ALTER COLUMN no_limit_price DROP NOT NULL,
ALTER COLUMN yes_size DROP NOT NULL,
ALTER COLUMN no_size DROP NOT NULL;

-- Add index on series_slug
CREATE INDEX IF NOT EXISTS strategies_series_slug_idx ON strategies(series_slug);

-- Update defaults for safety parameters
ALTER TABLE strategies 
ALTER COLUMN min_liquidity_usdc SET DEFAULT '10',
ALTER COLUMN max_slippage_from_midpoint SET DEFAULT '0.02',
ALTER COLUMN leg_timeout_ms SET DEFAULT 30000,
ALTER COLUMN frequency_seconds SET DEFAULT 60;
