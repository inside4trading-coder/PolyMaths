
ALTER TABLE bot_positions 
  ADD COLUMN close_reason text DEFAULT NULL;

UPDATE bot_positions 
  SET close_reason = 'redeem' 
  WHERE closed_at IS NOT NULL 
    AND (outcome = 'Redeemed' 
         OR EXISTS (SELECT 1 FROM unnest(reasons) r WHERE r ILIKE '%REDEEM%'));

UPDATE bot_positions 
  SET close_reason = 'trade' 
  WHERE closed_at IS NOT NULL 
    AND close_reason IS NULL;
