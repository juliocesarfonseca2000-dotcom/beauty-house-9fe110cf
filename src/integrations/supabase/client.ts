import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://kfdjnysgfvlxnnfsemnr.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_lHwERM7EwqkIMpQWdnZP1A_fesLCk9E";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});

export type Permissions = {
  dash: boolean;
  agenda: boolean;
  clientes: boolean;
  ficha: boolean;
  fechar: boolean;
  procedimentos: boolean;
  estoque: boolean;
  financeiro: boolean;
  relatorios: boolean;
  usuarios: boolean;
};

export type AppUser = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "receptionist" | "professional";
  cargo: string | null;
  is_evaluator: boolean;
  permissions: Permissions;
  active: boolean;
};
