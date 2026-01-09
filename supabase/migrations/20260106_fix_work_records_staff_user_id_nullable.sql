BEGIN;

-- Allow staff_user_id to be null
ALTER TABLE public.work_records
  ALTER COLUMN staff_user_id DROP NOT NULL;

-- Drop existing FK on staff_user_id (if any), regardless of name
DO $$
DECLARE
  fk_name text;
BEGIN
  SELECT con.conname
    INTO fk_name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY (con.conkey)
   WHERE nsp.nspname = 'public'
     AND rel.relname = 'work_records'
     AND att.attname = 'staff_user_id'
     AND con.contype = 'f'
   LIMIT 1;

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.work_records DROP CONSTRAINT %I', fk_name);
  END IF;
END
$$;

-- Recreate FK with ON DELETE SET NULL if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY (con.conkey)
     WHERE nsp.nspname = 'public'
       AND rel.relname = 'work_records'
       AND att.attname = 'staff_user_id'
       AND con.contype = 'f'
  ) THEN
    ALTER TABLE public.work_records
      ADD CONSTRAINT work_records_staff_user_id_fkey
      FOREIGN KEY (staff_user_id)
      REFERENCES auth.users (id)
      ON DELETE SET NULL;
  END IF;
END
$$;

COMMIT;
