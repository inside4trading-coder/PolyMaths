-- Delete duplicates keeping only one record per unique activity (using created_at to pick the oldest)
DELETE FROM wallet_activity a
USING wallet_activity b
WHERE a.created_at > b.created_at
  AND a.wallet_address = b.wallet_address
  AND a.market_id = b.market_id
  AND a.timestamp = b.timestamp
  AND a.size = b.size
  AND a.side = b.side;

-- Add unique constraint to prevent future duplicates
ALTER TABLE wallet_activity 
ADD CONSTRAINT wallet_activity_unique_trade 
UNIQUE (wallet_address, market_id, timestamp, size, side);