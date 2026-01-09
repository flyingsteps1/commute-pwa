create or replace view public._debug_columns as
select
  table_name,
  column_name,
  is_nullable,
  data_type,
  udt_name
from information_schema.columns
where table_schema = 'public';

create or replace view public._debug_fks_to_auth_users as
select
  c.conname,
  c.conrelid::regclass::text as table_name,
  pg_get_constraintdef(c.oid) as definition
from pg_constraint c
where c.contype = 'f'
  and c.confrelid = 'auth.users'::regclass;

create or replace view public._debug_profiles_columns as
select
  column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'profiles'
order by ordinal_position;
