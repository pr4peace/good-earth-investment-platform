# Investment Agreement Management System — Master Plan

**Status**: Design Phase | **Approach**: Multi-AI Orchestration  
**Created**: August 2026 | **Owner**: Prashanth (GoodEarth)

---

## System Overview

A unified agreement management + calendar reminder system for tracking investment payouts, TDS, and agreement renewal dates. Multiple teams (investment managers, salespeople, accounts) get automated notifications tied to actual payout schedules.

**Scope (Phase 1 — New Agreements)**:
- Agreement creation from standard template
- Automatic payout schedule generation
- Calendar-based reminder system
- Multi-recipient notifications
- Internal TDS tracking

**Future (Phase 2 — Existing Agreements)**:
- Bulk import from existing data
- Backfill calendar for active agreements

---

## Data Model

### Agreement Record
```
{
  // Identity
  id: string (UUID)
  status: "draft" | "active" | "expired" | "withdrawn"
  
  // Agreement Metadata
  agreement_number: string (auto-generated, e.g., "AG-2026-001")
  agreement_date: date (execution date)
  
  // KYC — Second Party (Client)
  client: {
    name: string
    age: number
    pan: string (stored masked: show only last 4 digits in UI)
    aadhar: string (stored masked: show only last 4 digits in UI)
    address: string
    relation_type: string ("S/o" | "D/o" | "W/o")
    relation_name: string (parent/guardian name)
  }
  
  // Investment Terms (from form input)
  principal: number (₹ amount)
  rate_of_interest: number (% per annum, e.g., 8.5)
  tenure_years: number
  lock_in_period_years: number (usually same as tenure)
  payout_frequency: "monthly" | "quarterly" | "semi-annual" | "annual"
  
  // Dates
  start_date: date (investment begins)
  end_date: date (maturity date, auto-calculated: start_date + tenure_years)
  
  // First Party (GoodEarth)
  first_party: {
    name: string ("M/s Good Earth Eco Projects")
    pan: string ("AAIFG8316P")
    office_address: string (fixed)
    partner_name: string (fixed: "Parthasarathy S")
  }
  
  // Tracking
  created_at: timestamp
  created_by: string (investment manager email)
  related_salesperson: string (email who brought the client)
  
  // TDS & Compliance
  tds_rate_override: number (% , optional; null means use system default of 10%)
  tds_last_filed_quarter: string (e.g., "Q1-2026", null if not filed)
  renewal_notice_sent: boolean (flag for 30-day reminder)
  post_dated_check_number: string (optional)
  post_dated_check_amount: number (principal + total interest)
  
  // System
  updated_at: timestamp
  updated_by: string (last editor email)
}
```

### Payout Schedule (auto-generated from Agreement)
```
{
  agreement_id: string
  payouts: [
    {
      payout_number: number (1, 2, 3...)
      amount: number (calculated: principal × rate / 12 or per frequency)
      tds_amount: number (calculated per India TDS rates)
      payout_date: date
      net_amount: number (amount - tds)
      status: "pending" | "paid" | "on-hold"
      paid_date: date (optional)
    }
  ]
}
```

### Calendar Event (auto-generated from Schedule)
```
{
  event_id: string
  agreement_id: string
  payout_number: number
  event_type: "interest_payout" | "tds_filing" | "renewal_check" | "agreement_expiry"
  trigger_date: date (when reminder goes out)
  due_date: date (actual payout or filing date)
  amount: number (if payout)
  recipients: [
    {
      role: "investment_manager" | "salesperson" | "accounts"
      email: string
      notification_type: "email" | "in-app" (future)
    }
  ]
  status: "pending" | "notified" | "completed"
  notified_at: timestamp (optional)
}
```

---

## Workflow: New Agreement Creation

### Step 1: Data Entry (Investment Manager)
**Input**: KYC details + investment terms  
**No document upload**. Manual entry only.

```
Form Fields:
┌─ KYC Section ──────────────────┐
│ Client Name                    │
│ Aadhar (last 4 digits display) │
│ PAN (last 4 digits display)    │
└────────────────────────────────┘

┌─ Investment Terms ─────────────┐
│ Principal Amount (₹)           │
│ Annual Rate of Interest (%)    │
│ Tenure (months)                │
│ Investment Start Date          │
│ Payout Frequency               │
│ (system calculates end_date)   │
└────────────────────────────────┘

┌─ Metadata ─────────────────────┐
│ Investment Manager (auto-fill) │
│ Related Salesperson (select)   │
└────────────────────────────────┘
```

### Step 2: System Calculations (Internal)
**Trigger**: On form submit

1. **Calculate end_date**: `start_date + tenure_months`
2. **Generate Payout Schedule**:
   - For each payout date (based on frequency):
     - Amount = `(principal × rate) / (12 × frequency_divisor)`
     - TDS = `amount × tds_rate(amount)` (per India rules)
     - Net = `amount - tds`
3. **Create Calendar Events**:
   - Interest payout reminders (7 days before each payout)
   - TDS filing reminders (quarterly: Jan 31, Apr 30, Jul 31, Oct 31)
   - Renewal check reminder (30 days before expiry)
   - Expiry notification (3 days before end_date)

### Step 3: Agreement & Calendar Storage
**Trigger**: Auto-save after Step 2

- Save Agreement record
- Save Payout Schedule
- Create Calendar events in internal system
- Mark as "active"

### Step 4: Notification Setup
**Trigger**: Calendar event due_date approaches

- 7 days before: Notify accounts team + investment manager
- 3 days before: Notify salesperson (renewal check)
- On due_date: Final reminder to all parties

---

## Multi-AI Orchestration Strategy

### Role Definitions

#### Claude Code (Orchestrator)
- **Owns**: System architecture, data flow, integration points, decision logic
- **Decides**: Which tasks go to Gemini, which need Codex verification, when to halt
- **Runs**: High-level workflow, error handling, cross-system sync
- **Prompt**: (See section below)

#### Gemini (Coder)
- **Owns**: Implementation details, API calls, utility functions, calculations
- **Does**: Writes data access layer, TDS calculation, payout schedule generation, event creation
- **Does NOT**: Make architectural decisions or approve overall system flow
- **Prompt**: (See section below)

#### Codex (Checker / QA)
- **Owns**: Verification, edge cases, regulatory compliance (TDS rates, date calculations)
- **Does**: Reviews Gemini's implementation, catches calculation errors, validates India-specific tax rules
- **Flags**: Logical inconsistencies, missing edge cases, inconsistencies with spec
- **Prompt**: (See section below)

### Data Flow
```
┌─────────────────────┐
│  Claude Code        │ Receives user input, orchestrates flow
│  (Orchestrator)     │
└──────────┬──────────┘
           │
           ├─→ "Gemini, generate payout schedule for this agreement"
           │   └─→ Gemini returns: [payout_1, payout_2, ...]
           │       Claude Code validates input via Codex
           │
           ├─→ "Codex, verify these payouts for TDS correctness"
           │   └─→ Codex returns: ✓ or [errors]
           │       Claude Code logs result
           │
           ├─→ "Gemini, create calendar events from schedule"
           │   └─→ Gemini returns: [event_1, event_2, ...]
           │
           └─→ Save all records, trigger notifications
```

---

## Orchestrator Prompt (Claude Code)

```
You are the orchestrator for an investment agreement management system.
Your job is to:

1. RECEIVE: Form submission with client KYC + investment terms
2. VALIDATE: All required fields present, data types correct, dates sensible
3. DELEGATE:
   - Ask Gemini to generate: payout schedule, calendar events, post-dated check amount
   - Ask Codex to verify: TDS rates, date logic, total interest calculations
4. INTEGRATE: Combine verified results into agreement record
5. STORE: Persist agreement + payouts + calendar events + audit trail entry
6. NOTIFY: Set up email reminders (7 days before payout, etc.)

Rules:
- ALWAYS ask Codex to verify Gemini's output before storing
- HALT & return errors if Codex flags calculation errors
- Log complete flow: input → gemini_output → codex_check → final_result
- Log to audit_trail: who created, when, what fields
- Do NOT assume TDS rates — ALWAYS ask Codex for current rates
- For any date ambiguity (weekends, partial months), ask Codex

Agreement Creation Flow:

Input form: {
  client_name, client_age, client_pan, client_aadhar, client_address,
  principal, rate, tenure_years, lock_in_years, start_date, frequency,
  created_by (investment manager), related_salesperson
}

1. Validate input:
   - All required fields present ✓
   - principal > 0 ✓
   - rate > 0 ✓
   - tenure_years >= lock_in_years ✓
   - start_date is valid ✓
   - frequency in [monthly, quarterly, semi-annual, annual] ✓

2. Calculate auto fields:
   - end_date = start_date + tenure_years (delegate to Gemini)
   - agreement_number = auto-generate (AG-YYYY-XXX)
   - agreement_date = today

3. Ask Gemini:
   "Generate payout schedule for this agreement:
    - Principal: ₹[principal]
    - Annual Rate: [rate]%
    - Tenure: [tenure_years] years
    - Payout Frequency: [frequency]
    - Start Date: [start_date]
    - End Date: [end_date]
    
    Return: [{payout_number, payout_date, interest_amount, tds_amount, net_amount}, ...]"
   
   Gemini returns: [payout_1, payout_2, ..., payout_N]

4. Ask Codex:
   "Verify this payout schedule:
    - TDS rate applied: [verify against current India rules]
    - Payout dates: [verify no payouts after end_date]
    - Interest amounts: [verify calculations are correct]
    - Total interest: [sum and compare to expected]
    - Edge cases: [leap months, weekends, etc.]
    
    Return: ✓ (approved) or [list of errors]"
   
   Codex returns: ✓ or [errors]

5. If Codex flags errors:
   - Log error in audit trail
   - Return error to user: "Please check: [errors]"
   - Do NOT create agreement
   - Do NOT create calendar events

6. If Codex approves (✓):
   - Create agreement record (status: "active")
   - Create payout records (status: "pending")
   - Ask Gemini: "Generate calendar events for this agreement"
     Returns: [{event_type, trigger_date, due_date, recipients}, ...]
   - Create calendar event records
   - Create audit trail entry (action: "created", changed_by: investment_manager)

7. Notify setup:
   - Trigger daily cron job to check for reminders
   - Schedule emails to go out at 9 AM IST for each event

8. Respond to user:
   "✓ Agreement [AG-YYYY-XXX] created successfully.
    - Client: [name]
    - Principal: ₹[amount]
    - Tenure: [tenure_years] years
    - Payouts: [frequency] for [N] times
    - Maturity: [end_date]
    - TDS: [total_tds]
    - Notifications: Reminders set for investment manager, salesperson, accounts team"
```

---

## Gemini Prompt (Coder)

```
You are the implementation layer for an investment agreement system.
Your job is to:

1. RECEIVE: Clear task requests from Claude Code (the orchestrator)
2. CODE: Implement the specific task (calculations, data generation, API calls)
3. RETURN: Structured output (JSON), not prose

Primary Tasks:

### Task A: Generate Payout Schedule
Input: {
  principal: number (₹),
  rate_of_interest: number (% p.a.),
  start_date: date (YYYY-MM-DD),
  end_date: date (YYYY-MM-DD, auto-calculated from tenure),
  payout_frequency: "monthly" | "quarterly" | "semi-annual" | "annual"
}

Output: [{
  payout_number: number (1, 2, 3, ...),
  payout_date: date (YYYY-MM-DD),
  interest_amount: number (gross, before TDS),
  tds_amount: number (to be verified by Codex),
  net_amount: number (interest_amount - tds_amount),
  status: "pending"
}, ...]

Logic:
1. Calculate payment frequency interval (monthly: 1 month, quarterly: 3 months, etc.)
2. Generate payout dates from start_date to end_date based on interval
3. For each payout_date:
   - interest_amount = (principal × rate) / (12 / interval_months)
   - tds_amount = interest_amount × 0.10 (placeholder; Codex will verify actual rate)
   - net_amount = interest_amount - tds_amount
4. Return list of payouts (sorted by payout_date)

### Task B: Create Calendar Events
Input: {
  agreement_id: string,
  payout_schedule: [payout objects],
  start_date: date,
  end_date: date,
  client_name: string
}

Output: [{
  event_type: string ("interest_payout" | "tds_filing" | "renewal_check" | "agreement_expiry"),
  trigger_date: date (when reminder email goes out),
  due_date: date (actual date of action),
  amount: number (optional, for interest_payout),
  recipients_by_role: {
    investment_manager: boolean,
    salesperson: boolean,
    accounts_team: boolean
  }
}, ...]

Logic:
1. For each payout in payout_schedule:
   - Create event: type="interest_payout", due_date=payout_date, trigger_date=(payout_date - 7 days)
   - Recipients: investment_manager=true, accounts_team=true, salesperson=false

2. For TDS filing (quarterly):
   - Dates: Jan 31, Apr 30, Jul 31, Oct 31 of each year within agreement tenure
   - Create events within the agreement period
   - Recipients: accounts_team=true, investment_manager=false, salesperson=false
   - Trigger: 7 days before filing date

3. For renewal check:
   - event_type="renewal_check", due_date=(end_date - 30 days), trigger_date=(end_date - 30 days)
   - Recipients: salesperson=true, investment_manager=true, accounts_team=false

4. For agreement expiry:
   - event_type="agreement_expiry", due_date=end_date, trigger_date=(end_date - 3 days)
   - Recipients: investment_manager=true, accounts_team=true, salesperson=true

### Task C: Generate Post-Dated Check Amount
Input: {
  principal: number,
  total_interest: number (sum of all interest_amounts from payout_schedule)
}
Output: {
  pdc_amount: number (principal + total_interest),
  pdc_amount_in_words: string ("Rupees ... Only")
}

Logic:
- pdc_amount = principal + total_interest
- Convert number to Indian rupees words format

### Task D: Format Notification Message
Input: {
  event_type: string,
  client_name: string,
  agreement_id: string,
  payout_number: number (optional),
  payout_date: date,
  amount: number,
  recipient_role: string
}
Output: {
  email_subject: string,
  email_body: string (HTML-friendly, plain text)
}

Examples:
- Interest Payout: "Payout #N due on [date] for [client]. Amount: ₹[net_amount] (TDS: ₹[tds])"
- TDS Filing: "TDS filing due [date]. Total TDS for Q[X]: ₹[total]"
- Renewal Check: "Agreement [ID] expires in 30 days. Check renewal status with [client]."
- Expiry: "Agreement [ID] expires [date]. Final payout: ₹[amount]. Update status in system."

---

### Rules & Style
- Write reusable, named functions: generate_payout_schedule(), create_calendar_events(), etc.
- Return ONLY valid JSON (no markdown, no prose)
- Include inline comments explaining date calculations & formulas
- If you're unsure about TDS rates or India-specific rules, FLAG IT: "FLAG: TDS rate 10% assumed, verify with Codex"
- Do NOT make architecture decisions; follow Claude Code's instructions exactly
- Timezone: Assume all dates in IST; no timezone conversions needed
- Rounding: Round amounts to 2 decimals (₹ 123.45)
```

---

## Codex Prompt (Checker / QA)

```
You are the quality assurance and compliance layer for an investment agreement system.
Your job is to:

1. RECEIVE: Gemini's payout schedule and calendar events
2. VERIFY: Against India tax rules, date logic, consistency
3. APPROVE or FLAG: Return ✓ (approved) or [list of errors]

---

### Verification Task 1: TDS Rate Verification

Current India TDS Rates (as of August 2026):
- Interest income on fixed deposits (resident individuals):
  * Up to ₹5 lakhs p.a.: No TDS
  * ₹5 lakhs to ₹10 lakhs p.a.: 10% TDS
  * Above ₹10 lakhs p.a.: 10% TDS (standard)
- Tax ID for individuals: Report under Section 194A of Income Tax Act

Rules:
- TDS applies to GROSS interest (before any deductions)
- If principal is a loan or investment by non-resident, different rules apply (FLAG)
- If investor has submitted Form 15H/15G, TDS may be waived (FLAG)
- Reinvestment provisions: If TDS > ₹10k, investor can claim relief (inform, don't apply in system)

For this system:
- Assume resident individual investors (default)
- Apply 10% TDS on interest payouts (standard rate)
- If Gemini flagged uncertainty: request clarification on investor status
- If principal > ₹50 lakhs: FLAG for review (high value, may have special compliance)

Verification Checklist:
- [ ] Gemini applied TDS = interest_amount × 0.10 ✓
- [ ] TDS amount is realistic (not 0, not >20%) ✓
- [ ] Client status unclear? → FLAG: "Verify client is resident individual"

---

### Verification Task 2: Date Logic & Calendar Events

Date Rules:
1. start_date < end_date (always)
2. All payout_dates fall within [start_date, end_date]
3. Payout dates respect frequency:
   - Monthly: 28-31 days apart (account for varying month lengths)
   - Quarterly: 90-92 days apart
   - Semi-annual: 180-184 days apart
   - Annual: 365-366 days apart
4. No payouts scheduled after end_date
5. Leap year handling: Feb has 29 days (check if start_date or any payout_date is in a leap year)

TDS Filing Dates (quarterly):
- Q1 (Jan-Mar): File by Jan 31
- Q2 (Apr-Jun): File by Apr 30
- Q3 (Jul-Sep): File by Jul 31
- Q4 (Oct-Dec): File by Oct 31
- Verify: Events created only for quarters within agreement period

Renewal Check:
- Trigger: 30 days before end_date
- Example: If end_date = 2027-08-20, renewal_check trigger = 2027-07-21

Agreement Expiry:
- Trigger: 3 days before end_date
- Example: If end_date = 2027-08-20, expiry_trigger = 2027-08-17

Verification Checklist:
- [ ] start_date < end_date ✓
- [ ] All payout_dates in [start_date, end_date] ✓
- [ ] Payout frequency intervals correct (±2 days tolerance for month-end edge cases) ✓
- [ ] No duplicate payout_dates ✓
- [ ] TDS filing events only created for quarters within tenure ✓
- [ ] Renewal check date = end_date - 30 days ✓
- [ ] Expiry event date = end_date - 3 days ✓

---

### Verification Task 3: Payout Schedule Consistency

Calculations:
- Interest per payout = (principal × annual_rate) / number_of_payouts_per_year
  * Monthly (12/year): principal × rate / 12
  * Quarterly (4/year): principal × rate / 4
  * Semi-annual (2/year): principal × rate / 2
  * Annual (1/year): principal × rate / 1
- Net interest = interest - (interest × 0.10) = interest × 0.90

Sum Validation:
- Total interest = sum of all interest_amounts
- Expected total = principal × rate × tenure_years (for simple interest)
- Tolerance: ±₹10 (rounding errors across many payouts okay)

Example Check:
Principal: ₹100,000
Rate: 8% p.a.
Tenure: 1 year
Frequency: Monthly (12 payouts)
- Interest per payout: 100000 × 0.08 / 12 = ₹666.67 → round to ₹666.67 or ₹667 (be consistent)
- TDS per payout: 666.67 × 0.10 = ₹66.67
- Net per payout: 666.67 - 66.67 = ₹600
- Total interest: 666.67 × 12 = ₹8000 ✓
- Total TDS: 66.67 × 12 = ₹800 ✓
- Post-Dated Check: 100000 + 8000 = ₹108,000 ✓

Verification Checklist:
- [ ] Interest formula applied correctly ✓
- [ ] TDS = interest × 0.10 ✓
- [ ] Net = interest - TDS ✓
- [ ] Total interest within ±₹10 of expected ✓
- [ ] No negative amounts ✓
- [ ] All amounts rounded to ₹0.00 consistently ✓

---

### Verification Task 4: Edge Cases & Compliance

Check For:
1. **Leap Year Months**: If payout_date or end_date falls in Feb of leap year
   - Don't adjust payout amounts, just verify date is valid
   - Example: Feb 29, 2024 is valid; Feb 29, 2025 is not (2025 is not a leap year)

2. **Weekend Payouts**: If payout_date falls on Saturday/Sunday
   - FLAG: "Payout [N] on [date] is [day_of_week]. Clarify: shift to Friday?"
   - Don't adjust automatically (depends on business policy)

3. **Principal Boundaries**:
   - FLAG if principal < ₹10,000 (too small, compliance risk)
   - FLAG if principal > ₹1 crore (high value, may need special approvals)

4. **Tenure Boundaries**:
   - FLAG if tenure_years > 5 (unusual, may need review)
   - FLAG if tenure_years < 0.5 (too short, compliance risk)

5. **Interest Rate Outliers**:
   - FLAG if rate < 4% (below market, may indicate error)
   - FLAG if rate > 15% (above market, verify intent)

6. **Multiple Agreements**:
   - If you see same client_pan in multiple active agreements:
     FLAG: "Client [name] has multiple active agreements. Verify no conflicts."

---

### Output Format

Return ONLY valid JSON:

If all checks pass:
```json
{
  "status": "approved",
  "message": "✓ All validations passed.",
  "total_payouts": 12,
  "total_interest": 8000,
  "total_tds": 800,
  "calendar_events": 16,
  "warnings": []
}
```

If issues found:
```json
{
  "status": "flagged",
  "message": "❌ [N] issues found. Review below.",
  "errors": [
    "Error 1: [specific issue]",
    "Error 2: [specific issue]"
  ],
  "warnings": [
    "Warning 1: [potential issue]",
    "Warning 2: [potential issue]"
  ]
}
```

---

### Rules & Style
- Be strict on calculations & India tax compliance
- Be conservative on edge cases: FLAG rather than assume
- If unsure about current TDS rates or regulations, state assumption clearly
- Do NOT approve if critical errors exist (math, dates, compliance)
- Do warn on edge cases but allow approval if they're non-critical
- Assume timezone: IST (no UTC conversions)
```

---

## Authentication & Authorization

### Roles & Permissions

| Role | Can Create Agreement | Can View Own Agreements | Can View All | Can Edit Agreement | Can Access TDS/Interest Summary | Can Mark Payout Paid |
|---|---|---|---|---|---|---|
| **Admin** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Investment Manager** | ✓ | ✓ (created by them) | ✗ | ✓ | ✓ | ✓ |
| **Salesperson** | ✗ | ✓ (agreements they brought) | ✗ | ✗ | ✗ | ✗ |
| **Accounts Team** | ✗ | ✓ | ✓ | ✗ | ✓ | ✓ |

### Implementation
- **Google OAuth 2.0**: Sign in via Google account
- **Role assignment**: On first login or admin panel (TBD in Phase 2)
- **Session management**: JWT tokens, stored in browser localStorage

---

## Notification System

### Recipients & Triggers

| Event Type | Trigger | Recipients | Message |
|---|---|---|---|
| **Interest Payout Due** | 7 days before payout_date (9 AM IST) | Investment Manager, Accounts | "Payout #N due on [date] for [client]. Amount: ₹[amount - tds]" |
| **TDS Filing Due** | 7 days before quarter-end (9 AM IST) | Accounts | "TDS filing due [date]. Total TDS for Q[X]: ₹[amount]" |
| **Renewal Check** | 30 days before end_date (9 AM IST) | Salesperson, Investment Manager | "Agreement expires in 30 days. Check with [client] on renewal/withdrawal." |
| **Agreement Expiry** | 3 days before end_date (9 AM IST) | Investment Manager, Accounts | "Agreement [ID] expires on [date]. Final payout: ₹[amount]. Update status in system." |

### Notification Channels (Phase 1)
- **Email** (via SendGrid)
- **In-app notifications** (dashboard, Phase 2)

### Email Service
- **Provider**: SendGrid (free tier: 100 emails/day)
- **Timing**: All reminders at 9 AM IST daily
- **Scheduler**: Node-schedule (cron job runs daily, checks all agreements, sends batched emails)

---

## In-App Calendar & Reminders (Phase 1)

### Design
- **View**: Monthly/weekly calendar showing:
  - Payout dates (color: blue)
  - TDS filing dates (color: red)
  - Renewal check dates (color: yellow)
  - Agreement expiry dates (color: orange)
- **Details**: Click any event to see agreement details, payout amount, recipients notified
- **Filter**: By role (show relevant events) or by agreement_id

### Google Calendar Sync
- **Phase 2 feature**: Push events to Google Calendar after sync is working
- **For now**: In-app calendar is the source of truth

---

## Audit Trail

### Minimal Logging Strategy
Log only **important changes** to avoid information overload.

### What to Log
- **Agreement created**: timestamp, created_by, agreement_id
- **Agreement modified**: timestamp, modified_by, field changed (principal/rate/tenure/dates), old_value → new_value, notes (optional)
- **Agreement status changed**: timestamp, changed_by, old_status → new_status (e.g., draft → active → expired)
- **Payout marked as paid**: timestamp, marked_by, payout_number, actual_date, actual_amount (if differs from scheduled)
- **TDS filed**: timestamp, filed_by, quarter, total_tds_amount

### Data Structure
```
{
  audit_id: string
  agreement_id: string
  action_type: "created" | "modified" | "status_changed" | "payout_paid" | "tds_filed"
  changed_by: string (user email)
  timestamp: datetime
  field_changed: string (optional, e.g., "rate")
  old_value: any (optional)
  new_value: any (optional)
  notes: string (optional, user can add context)
}
```

### UI
- View audit trail as a timeline on the agreement detail page
- Show: who, what changed, when, why (notes)

---

## Reference Template & Agreement Generation

### Template Analysis (Investment_Agreement_Draft_New.docx)

**Structure**:
1. **Header & Date**: Day, Month, Year (blanks to fill)
2. **Parties**:
   - First Party: Good Earth Eco Projects, PAN AAIFG8316P (fixed)
   - Second Party: Client name, age, PAN, Aadhar, address (from form)
3. **WHEREAS Clause**: Standard project context (mostly fixed, some blanks)
4. **Key Terms** (to fill from form):
   - Investment Amount (Principal)
   - Rate of Interest (% p.a.)
   - Tenure (years)
   - Lock-in Period (years)
   - Start Date
   - Maturity Date (auto-calculated)
   - Payment Schedule (table with dates, amounts, interest, TDS)
   - Post-dated check amount (equal to principal + final interest)
5. **Terms & Conditions** (mostly fixed):
   - Lock-in period confirmation
   - Interest payout schedule (monthly/quarterly/etc.)
   - TDS deduction clause
   - Penalty for late payment (18% p.a.)
   - Early withdrawal clause (2% interest reduction)
   - Representations & warranties
   - Indemnity clause
6. **Signature Block**: First Party, Second Party, 2 Witnesses

---

### Form Fields (User Input)

**Section 1: Agreement Date**
- `agreement_day` (1-31)
- `agreement_month` (1-12)
- `agreement_year` (auto-fill current year, editable)

**Section 2: KYC — Second Party (Client)**
- `client_name` (string, required)
- `client_age` (number, required)
- `client_pan` (string, 10-char, masked for display)
- `client_aadhar` (string, 12-char, masked for display: show only last 4 digits)
- `client_address` (string, required)
- `client_relation` (S/o, D/o, W/o) + `client_parent_name`

**Section 3: Investment Terms**
- `principal_amount` (₹, required, e.g., 100000)
- `rate_of_interest` (% p.a., required, e.g., 8.5)
- `tenure_years` (number, required, e.g., 1, 2, 3)
- `lock_in_period_years` (number, required, usually same as tenure)
- `start_date` (date picker, required)
- `payout_frequency` (dropdown: monthly, quarterly, semi-annual, annual)

**Section 4: Metadata (auto-filled / system)**
- `maturity_date` (auto-calculated: start_date + tenure_years)
- `investment_manager_email` (auto-fill from logged-in user)
- `related_salesperson_email` (dropdown select from team)

---

### System-Calculated Fields

**For Payout Schedule Table**:
- **Payout Dates**: Based on `payout_frequency` and `start_date`
- **Interest Amount per Payout**: `(principal × rate) / (12 × frequency_divisor)`
  - Monthly: divisor = 1
  - Quarterly: divisor = 0.25
  - Semi-annual: divisor = 0.5
  - Annual: divisor = 1
- **TDS per Payout**: `interest_amount × tds_rate` (Codex defines current rate)
- **Net Interest**: `interest_amount - tds`
- **Table Structure**:
  | Principal | Payable From | Payable To | No. of Days | On or Before | Interest | TDS | Net Interest |
  | ---|---|---|---|---|---|---|---|
  | [auto] | [date 1] | [date 2] | [auto] | [date] | [calc] | [calc] | [calc] |
  | ... | ... | ... | ... | ... | ... | ... | ... |

**For Post-Dated Check**:
- Amount = `principal + (total_interest_for_all_payouts)`
- Filled as: "Rs. [amount]/- (Rupees [amount in words] Only)"

---

### Agreement Generation Process

**Step 1: Form Submission**
- User fills all form fields (above)
- Client-side validation: required fields, format checks

**Step 2: System Calculations** (Gemini)
- Calculate: maturity_date, payout_schedule, TDS per payout, post-dated check amount
- Generate payout schedule table (HTML or markdown)

**Step 3: Verification** (Codex)
- Verify TDS rates per current India rules
- Verify date logic (no payouts after maturity)
- Verify total interest sum

**Step 4: Document Generation** (Phase 1 — DECIDED)
- Generate a filled-in **PDF immediately** on agreement creation (using `pdfkit` or equivalent HTML→PDF renderer), in addition to storing the JSON record and HTML dashboard view.

**Step 5: Storage**
- Save: Agreement record + Payout Schedule + Audit trail entry (created_by, timestamp)
- Create: Calendar events for each payout, TDS filing, renewal check, expiry

---

### For Development

**Template Sections to Map**:
1. Extract exact text for fixed sections (WHEREAS, Terms & Conditions, Signatures)
2. Define placeholder syntax: `{{CLIENT_NAME}}`, `{{PRINCIPAL}}`, `{{MATURITY_DATE}}`, etc.
3. Keep template text in database (or template file) for agreement regeneration
4. If user edits agreement (Phase 2), flag in audit trail + recalculate affected fields

**PDF Export** (Phase 2):
- Use library like: `python-docx` (Node version: `docx-templates`) or `pdfkit` (HTML→PDF)
- Convert HTML dashboard view → PDF with header, footer, page breaks
- Embed watermark: "INTERNAL USE ONLY" until client-facing is approved

---

## TDS Tracking & Quarterly Filing

### Process
1. **Daily**: Track all payouts made, accumulate TDS
2. **Quarterly** (Jan 31, Apr 30, Jul 31, Oct 31):
   - Calendar event triggers 7 days before
   - Accounts team reviews: payout_schedule.tds_amount for all agreements in quarter
   - System shows summary: "Q1 2026 TDS: ₹X across Y agreements"
   - Manual filing step (outside this system, but flagged)
3. **Post-Filing**: Accounts updates `tds_last_filed_quarter` in agreement record

### Calculation (India Standard)
- TDS rate on interest: ~10% (standard residential; varies by type)
- Applied to gross payout, not net
- Reinvestment provisions apply (depends on income bracket)
- System flags "Review with accountant if principal > 15L" (phase 2)

---

## Technical Stack (Decided)

### Backend
- **Data Store**: PostgreSQL (via Railway) — modern, scalable, handles complex queries for future features
- **Scheduler**: Node-schedule (cron jobs for daily reminder checks)
- **Email Service**: SendGrid (free tier: 100 emails/day, reliable)
- **API**: Express.js (Node.js)
- **Hosting**: Railway (full stack + DB in one place)

### Frontend
- **Framework**: React or Vue (Claude Code will decide)
- **Dashboard**: View agreements, upcoming payouts, TDS summary
- **Form**: Create new agreement (this phase)
- **Calendar View**: In-app calendar (not Google Calendar syncing yet, Phase 2)

### Authentication
- **Google OAuth 2.0**: Single sign-on (simpler than email/password)
- **Role-based access control**: Investment Manager, Salesperson, Accounts Team, Admin

### Multi-AI Integration
- **Claude Code**: Orchestrator (defines flows, system architecture, integrations)
- **Gemini**: Coder (implements functions, API calls, calculations)
- **Codex**: Checker (verifies TDS, date logic, edge cases)

---

## Phase 1 Deliverables (New Agreements)

### MVP (Web App)
- [ ] PostgreSQL schema + Railway setup
- [ ] Google OAuth login + role-based access control (manual admin role assignment)
- [ ] Agreement creation form (KYC + terms, data entry only)
- [ ] Payout schedule generator (Gemini, Codex verification), weekend payout dates shifted to preceding Friday
- [ ] TDS calculator (flat 10% default, per-agreement override field)
- [ ] PDF agreement document generation (pdfkit or equivalent), generated immediately on agreement creation
- [ ] In-app calendar (month/week view of events)
- [ ] Calendar event creation + storage
- [ ] Email notification system (SendGrid, daily 9 AM IST cron job)
- [ ] Role-based dashboard (Investment Manager, Accounts, Salesperson views)
- [ ] Audit trail (minimal: key changes + notes)
- [ ] Agreement detail page + timeline
- [ ] Test suite (edge cases: leap years, partial months, high amounts, TDS correctness, weekend-shift dates, PDF generation)

### Reference
- [ ] Extract & analyze Word template provided by Prashanth
- [ ] Map template sections to form fields
- [ ] Finalize field names + validation rules

## Phase 2 Deliverables

- [ ] Google Calendar sync (push events)
- [ ] Payout tracking UI (mark as paid, record actual amount/date)
- [ ] Bulk import flow (existing agreements)
- [ ] Client-facing agreement delivery (email the Phase 1 PDF to clients)
- [ ] Advanced filtering + reporting (TDS summary by quarter, etc.)
- [ ] In-app notifications + notification center
- [ ] Role assignment UI (admin panel, upgrade from manual DB assignment)

---

## Open Questions / Calibration Needed — RESOLVED

### Immediate (for Phase 1 dev)
1. **TDS Rates**: Flat 10% applied by default, with a per-agreement override field (`tds_rate_override`) so an admin/investment manager can set a different rate on a specific agreement when needed.
2. **Weekends**: If a payout_date (or any trigger/due date) falls on Saturday/Sunday, automatically shift it to the preceding Friday. No manual flagging needed for this case.
3. **Agreement Generation Format**: Generate a PDF immediately in Phase 1 (not deferred to Phase 2). Use `pdfkit` (or equivalent HTML→PDF renderer) to produce a client-ready document right after agreement creation, in addition to storing the JSON record.
4. **Role Assignment**: Manual admin assignment. New users default to no/minimal access until an Admin assigns a role via an admin panel or direct DB/table entry.
5. **Payout Tracking UI** (Phase 2): Mark paid via checkbox? Form with date + amount fields? Bulk actions? *(still open — deferred to Phase 2 planning)*

### Deferred (Phase 2)
1. **Existing Agreements**: How will bulk import data be structured? CSV columns?
2. **Early Withdrawal**: How to handle mid-term redemption? Create new end_date + recalculate?
3. **Client Notifications**: Do clients get payout/expiry emails, or internal-only? (Phase 2)
4. **Google Calendar**: Push to shared GoodEarth calendar or per-user calendars?

---

## Implementation Roadmap

### Week 1: Foundation
1. **Setup**: PostgreSQL schema (Railway), Google OAuth, Express backend scaffold
2. **Data Model**: Create tables (agreements, payouts, calendar_events, audit_trail)
3. **Forms**: Build agreement creation form (KYC + terms validation)
4. **Payout Generator**: Implement schedule calculation (Gemini codes, Codex verifies)

### Week 2: Core Features
5. **Calendar Engine**: Event creation, storage, in-app calendar UI
6. **PDF Generation**: Fill agreement template, produce client-ready PDF on creation
7. **Email System**: SendGrid integration, notification templates, daily cron job
8. **Dashboard**: Role-based views (Investment Manager, Accounts, Salesperson)
9. **Audit Trail**: Implement logging + timeline UI

### Week 3: Polish & Testing
10. **Testing**: Edge cases (leap years, partial months, TDS correctness, weekend-shift dates, PDF rendering)
11. **Error Handling**: Validation, graceful failures
12. **Documentation**: API specs, deployment guide
13. **Phase 2 Planning**: Gather feedback, prioritize next features

---

## Notes for Claude Code Session

- **Orchestrator Mindset**: Define what Gemini codes, what Codex checks, how results flow back
- **Role-Based Access**: Implement at middleware level (protect all routes)
- **Error Handling**: Fail gracefully if email doesn't send; log for retry
- **Timezone**: Assume IST (India Standard Time) for all reminders
- **Multi-AI Workflow**: 
  - Claude Code: Architecture, integration, orchestration
  - Gemini: Payout schedule, TDS calculation, email formatting
  - Codex: Verify TDS rates, date logic, edge cases

---

**Status**: Ready for Claude Code  
**Last Updated**: August 20, 2026  
**Owner**: Prashanth (GoodEarth)  
**Stack**: Node.js + Express, PostgreSQL (Railway), React, SendGrid, Google OAuth
