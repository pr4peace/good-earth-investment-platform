CREATE TABLE payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id UUID NOT NULL REFERENCES agreements(id) ON DELETE CASCADE,
  payout_number INTEGER NOT NULL,
  amount NUMERIC(14, 2) NOT NULL,
  tds_amount NUMERIC(14, 2) NOT NULL,
  payout_date DATE NOT NULL,
  net_amount NUMERIC(14, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'on-hold')),
  paid_date DATE,
  UNIQUE (agreement_id, payout_number)
);
