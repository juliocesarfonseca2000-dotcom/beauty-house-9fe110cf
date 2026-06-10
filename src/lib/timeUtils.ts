// Utilitários para cálculo de ponto

export type TimeEntry = {
  id?: string;
  user_id: string;
  date: string;
  clock_in: string | null;
  break_start: string | null;
  break_end: string | null;
  clock_out: string | null;
  note: string | null;
};

export function computeTotalMinutes(e: Pick<TimeEntry, "clock_in" | "break_start" | "break_end" | "clock_out">): number {
  if (!e.clock_in || !e.clock_out) return 0;
  const inMs = new Date(e.clock_in).getTime();
  const outMs = new Date(e.clock_out).getTime();
  let total = (outMs - inMs) / 60000;
  if (e.break_start && e.break_end) {
    const bs = new Date(e.break_start).getTime();
    const be = new Date(e.break_end).getTime();
    if (be > bs) total -= (be - bs) / 60000;
  }
  return Math.max(0, Math.round(total));
}

export function formatHM(min: number): string {
  if (!min || min <= 0) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${String(m).padStart(2, "0")}`;
}

export function entryStatus(e: TimeEntry | null | undefined): "none" | "in" | "break" | "out" {
  if (!e || !e.clock_in) return "none";
  if (e.clock_out) return "out";
  if (e.break_start && !e.break_end) return "break";
  return "in";
}

export function formatHM_HHmm(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
