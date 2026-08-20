CREATE TABLE audit_trail (
  audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id UUID NOT NULL REFERENCES agreements(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('created', 'modified', 'status_changed', 'payout_paid', 'tds_filed')),
  changed_by TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  field_changed TEXT,
  old_value TEXT,
  new_value TEXT,
  notes TEXT
);
