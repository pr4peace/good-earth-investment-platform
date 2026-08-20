CREATE TABLE agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'expired', 'withdrawn')),

  agreement_number TEXT NOT NULL UNIQUE,
  agreement_date DATE NOT NULL,

  client_name TEXT NOT NULL,
  client_age INTEGER NOT NULL,
  client_pan TEXT NOT NULL,
  client_aadhar TEXT NOT NULL,
  client_address TEXT NOT NULL,
  client_relation_type TEXT NOT NULL CHECK (client_relation_type IN ('S/o', 'D/o', 'W/o')),
  client_relation_name TEXT NOT NULL,

  principal NUMERIC(14, 2) NOT NULL,
  rate_of_interest NUMERIC(5, 2) NOT NULL,
  tenure_years NUMERIC(4, 2) NOT NULL,
  lock_in_period_years NUMERIC(4, 2) NOT NULL,
  payout_frequency TEXT NOT NULL CHECK (payout_frequency IN ('monthly', 'quarterly', 'semi-annual', 'annual')),

  start_date DATE NOT NULL,
  end_date DATE NOT NULL,

  first_party_name TEXT NOT NULL DEFAULT 'M/s Good Earth Eco Projects',
  first_party_pan TEXT NOT NULL DEFAULT 'AAIFG8316P',
  first_party_office_address TEXT NOT NULL DEFAULT '',
  first_party_partner_name TEXT NOT NULL DEFAULT 'Parthasarathy S',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL,
  related_salesperson TEXT NOT NULL,

  tds_rate_override NUMERIC(5, 2),
  tds_last_filed_quarter TEXT,
  renewal_notice_sent BOOLEAN NOT NULL DEFAULT false,
  post_dated_check_number TEXT,
  post_dated_check_amount NUMERIC(14, 2),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT NOT NULL
);
