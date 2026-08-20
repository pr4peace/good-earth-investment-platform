CREATE TABLE calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id UUID NOT NULL REFERENCES agreements(id) ON DELETE CASCADE,
  payout_number INTEGER,
  event_type TEXT NOT NULL CHECK (event_type IN ('interest_payout', 'tds_filing', 'renewal_check', 'agreement_expiry')),
  trigger_date DATE NOT NULL,
  due_date DATE NOT NULL,
  amount NUMERIC(14, 2),
  recipients JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'notified', 'completed')),
  notified_at TIMESTAMPTZ
);
