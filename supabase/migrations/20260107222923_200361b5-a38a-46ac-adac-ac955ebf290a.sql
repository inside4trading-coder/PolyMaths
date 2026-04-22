-- Add a deterministic signature for wallet_activity rows to prevent duplicate inserts
ALTER TABLE public.wallet_activity
ADD COLUMN IF NOT EXISTS signature text;

-- Backfill signature for existing rows (stable hash)
UPDATE public.wallet_activity
SET signature = md5(
  lower(wallet_address)
  || '|' || coalesce(market_id, '')
  || '|' || coalesce(market_question, '')
  || '|' || coalesce(outcome, '')
  || '|' || coalesce(side, '')
  || '|' || coalesce(price::text, '')
  || '|' || size::text
  || '|' || activity_type
  || '|' || timestamp::text
)
WHERE signature IS NULL;

-- Remove duplicates keeping the earliest created_at per signature
WITH ranked AS (
  SELECT
    id,
    signature,
    row_number() OVER (PARTITION BY signature ORDER BY created_at ASC, id ASC) AS rn
  FROM public.wallet_activity
)
DELETE FROM public.wallet_activity wa
USING ranked r
WHERE wa.id = r.id
  AND r.rn > 1;

-- Enforce uniqueness going forward
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'wallet_activity_signature_key'
  ) THEN
    ALTER TABLE public.wallet_activity
      ADD CONSTRAINT wallet_activity_signature_key UNIQUE (signature);
  END IF;
END $$;

-- Make signature required going forward
ALTER TABLE public.wallet_activity
ALTER COLUMN signature SET NOT NULL;

-- Helpful index for wallet history reads
CREATE INDEX IF NOT EXISTS idx_wallet_activity_wallet_ts
ON public.wallet_activity (wallet_address, timestamp DESC);