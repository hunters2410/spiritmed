-- Run this in your Supabase SQL Editor
-- Creates the edit_approval_requests table for the accountant edit approval workflow

create table if not exists edit_approval_requests (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references branches(id) on delete cascade,
  requestor_id uuid references users(id) on delete cascade,
  requestor_name text not null,
  record_type text not null check (record_type in ('payment', 'bill')),
  record_id text not null,
  record_context text,           -- Human-readable e.g. "Edit payment of $200 for John Doe (INV-123456)"
  reason text,                   -- Reason provided by accountant
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied', 'expired', 'cancelled')),
  reviewed_by uuid references users(id),
  reviewer_name text,
  reviewed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  created_at timestamptz default now()
);

-- Enable Realtime
alter publication supabase_realtime add table edit_approval_requests;

-- Enable RLS
alter table edit_approval_requests enable row level security;

-- Allow authenticated branch members to manage their branch's requests
create policy "branch_members_can_manage_approval_requests"
  on edit_approval_requests for all
  using (
    branch_id = (select branch_id from users where id = auth.uid())
  )
  with check (
    branch_id = (select branch_id from users where id = auth.uid())
  );
