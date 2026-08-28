-- Run this in your Supabase SQL Editor to set up the Accounting tables.
-- Enables a complete double-entry ledger system.

-- 1. CHART OF ACCOUNTS TABLE
create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references branches(id) on delete cascade,
  code text not null,
  name text not null,
  type text not null check (type in ('asset', 'liability', 'equity', 'revenue', 'expense')),
  sub_type text,
  is_system boolean default false,
  is_active boolean default true,
  description text,
  parent_id uuid references accounts(id) on delete set null,
  created_at timestamptz default now(),
  constraint unique_branch_account_code unique (branch_id, code)
);

-- Enable Realtime for accounts
alter publication supabase_realtime add table accounts;

-- Enable RLS for accounts
alter table accounts enable row level security;
create policy "branch_members_manage_accounts" on accounts for all
  using (branch_id = (select branch_id from users where id = auth.uid()))
  with check (branch_id = (select branch_id from users where id = auth.uid()));


-- 2. JOURNAL ENTRIES TABLE
create table if not exists journal_entries (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references branches(id) on delete cascade,
  entry_number text not null,
  entry_date date not null default current_date,
  description text,
  reference_type text, -- 'bill', 'payment', 'expense', 'manual'
  reference_id text,   -- links to bill_id, payment_id, expense_id
  is_posted boolean default true,
  created_by uuid references users(id) on delete set null,
  posted_by uuid references users(id) on delete set null,
  posted_at timestamptz default now(),
  created_at timestamptz default now(),
  constraint unique_branch_entry_number unique (branch_id, entry_number)
);

-- Enable Realtime for journal_entries
alter publication supabase_realtime add table journal_entries;

-- Enable RLS for journal_entries
alter table journal_entries enable row level security;
create policy "branch_members_manage_journal_entries" on journal_entries for all
  using (branch_id = (select branch_id from users where id = auth.uid()))
  with check (branch_id = (select branch_id from users where id = auth.uid()));


-- 3. JOURNAL LINES TABLE (DEBITS & CREDITS)
create table if not exists journal_lines (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid references journal_entries(id) on delete cascade,
  account_id uuid references accounts(id) on delete cascade,
  description text,
  debit numeric(18,2) not null default 0.00,
  credit numeric(18,2) not null default 0.00,
  created_at timestamptz default now()
);

-- Enable Realtime for journal_lines
alter publication supabase_realtime add table journal_lines;

-- Enable RLS for journal_lines
alter table journal_lines enable row level security;
create policy "branch_members_manage_journal_lines" on journal_lines for all
  using (
    journal_entry_id in (
      select id from journal_entries 
      where branch_id = (select branch_id from users where id = auth.uid())
    )
  )
  with check (
    journal_entry_id in (
      select id from journal_entries 
      where branch_id = (select branch_id from users where id = auth.uid())
    )
  );

-- INDEXES FOR PERFORMANCE
create index if not exists idx_accounts_type on accounts(type);
create index if not exists idx_journal_entries_date on journal_entries(entry_date);
create index if not exists idx_journal_lines_account on journal_lines(account_id);
create index if not exists idx_journal_lines_entry on journal_lines(journal_entry_id);
