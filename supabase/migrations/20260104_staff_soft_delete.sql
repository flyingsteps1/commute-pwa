-- Soft delete support for staff management
alter table public.staff_public
  add column if not exists is_active boolean not null default true;

update public.staff_public
  set is_active = true
  where is_active is null;

alter table public.profiles
  add column if not exists deleted_at timestamptz;

create index if not exists staff_public_workplace_active_idx
  on public.staff_public (workplace_id, is_active);
