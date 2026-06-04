import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { IconEye, IconEyeOff } from "@tabler/icons-react";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { user, loading, signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/", replace: true });
  }, [loading, user, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await signIn(email, password);
      toast.success("Bem-vinda!");
      navigate({ to: "/", replace: true });
    } catch (err) {
      toast.error("Email ou senha inválidos");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy px-4">
      <div className="w-full max-w-md bh-card p-8">
        <div className="text-center mb-8">
          <div className="font-display text-3xl text-navy">Beauty House</div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-text2 uppercase tracking-wide mb-1.5">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold transition"
              placeholder="seuemail@beautyhouse.com"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text2 uppercase tracking-wide mb-1.5">Senha</label>
            <div className="relative">
              <input
                type={show ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 pr-10 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold transition"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text3 hover:text-navy"
              >
                {show ? <IconEyeOff size={18} /> : <IconEye size={18} />}
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full py-2.5 rounded-lg bg-navy text-white font-semibold tracking-wide hover:bg-navy2 transition disabled:opacity-50"
          >
            {busy ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
