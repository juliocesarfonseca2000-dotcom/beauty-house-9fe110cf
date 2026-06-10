-- Allow "dayoff" (and the other UI types) in staff_absences.type
ALTER TABLE public.staff_absences DROP CONSTRAINT IF EXISTS staff_absences_type_check;
ALTER TABLE public.staff_absences
  ADD CONSTRAINT staff_absences_type_check
  CHECK (type IN ('vacation','absent','dayoff','leave'));
