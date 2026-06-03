import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase, type AppUser } from "@/integrations/supabase/client";
import { withTimeout } from "@/lib/with-timeout";

type AuthCtx = {
  user: AppUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (uid: string) => {
    const { data, error } = await withTimeout(
      supabase.from("app_users").select("*").eq("id", uid).maybeSingle(),
      8000,
      "Carregamento do usuário",
    );
    if (error) throw error;
    return data as AppUser | null;
  };

  const refresh = async () => {
    try {
      const { data } = await withTimeout(supabase.auth.getSession(), 8000, "Verificação da sessão");
      if (data.session?.user) setUser(await loadProfile(data.session.user.id));
      else setUser(null);
    } catch (error) {
      console.error("Falha ao carregar sessão:", error);
      setUser(null);
    }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      await refresh();
      if (mounted) setLoading(false);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, session) => {
      try {
        const nextUser = session?.user ? await loadProfile(session.user.id) : null;
        if (mounted) setUser(nextUser);
      } catch (error) {
        console.error("Falha ao atualizar sessão:", error);
        if (mounted) setUser(null);
      }
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return <Ctx.Provider value={{ user, loading, signIn, signOut, refresh }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}
