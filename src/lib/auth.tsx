import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
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
  const userRef = useRef<AppUser | null>(null);
  const loadingProfileRef = useRef<string | null>(null);

  const setAuthUser = (next: AppUser | null) => {
    userRef.current = next;
    setUser(next);
  };

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
      if (data.session?.user) setAuthUser(await loadProfile(data.session.user.id));
      else setAuthUser(null);
    } catch (error) {
      console.error("Falha ao carregar sessão:", error);
    }
  };

  useEffect(() => {
    let mounted = true;
    const syncProfile = (uid: string) => {
      if (userRef.current?.id === uid || loadingProfileRef.current === uid) return;
      loadingProfileRef.current = uid;
      void loadProfile(uid).then((nextUser) => {
        if (mounted) setAuthUser(nextUser);
      }).catch((error) => {
        console.error("Falha ao atualizar sessão:", error);
        if (mounted && !userRef.current) setAuthUser(null);
      }).finally(() => {
        if (loadingProfileRef.current === uid) loadingProfileRef.current = null;
      });
    };
    (async () => {
      await refresh();
      if (mounted) setLoading(false);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") return;
      if (event === "SIGNED_OUT") {
        if (mounted) setAuthUser(null);
        return;
      }
      if (session?.user) syncProfile(session.user.id);
      else if (mounted) setAuthUser(null);
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
    setAuthUser(null);
  };

  return <Ctx.Provider value={{ user, loading, signIn, signOut, refresh }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}
