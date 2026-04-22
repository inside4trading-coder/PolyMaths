-- Drop the FK constraint that's blocking wallet_activity inserts
ALTER TABLE wallet_activity DROP CONSTRAINT IF EXISTS wallet_activity_market_id_fkey;

-- market_id will now accept any text value (slugs from API) without requiring a match in markets table