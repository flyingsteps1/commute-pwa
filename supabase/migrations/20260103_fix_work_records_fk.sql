-- Make staff_user_id nullable and set FK to ON DELETE SET NULL
alter table public.work_records
  alter column staff_user_id drop not null;

alter table public.work_records
  drop constraint if exists work_records_staff_user_id_fkey;

alter table public.work_records
  add constraint work_records_staff_user_id_fkey
  foreign key (staff_user_id)
  references auth.users(id)
  on delete set null;

create index if not exists work_records_staff_user_id_idx
  on public.work_records (staff_user_id);
