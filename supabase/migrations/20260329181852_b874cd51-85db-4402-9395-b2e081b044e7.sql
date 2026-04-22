-- Step 1: Add 'source' column to wallet_activity
ALTER TABLE wallet_activity ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'api';

-- Step 2: Add check constraint for source values  
ALTER TABLE wallet_activity ADD CONSTRAINT chk_wallet_activity_source CHECK (source IN ('api', 'onchain'));

-- Step 3: Unique partial index on transaction_hash
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_activity_txhash ON wallet_activity(transaction_hash) WHERE transaction_hash IS NOT NULL;