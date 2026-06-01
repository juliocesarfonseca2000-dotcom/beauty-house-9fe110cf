import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/trocar-senha")({
  component: ChangePasswordPage,
});

function ChangePasswordPage() {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 6) return toast.error("Mínimo de 6 caracteres");
    if (pw !== pw2) return toast.error("As senhas não coincidem");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Senha alterada");
    setPw(""); setPw2("");
  };

  return (
    <div className="max-w-md mx-auto bh-card p-6">
      <div className="font-display text-2xl text-navy mb-4">Trocar senha</div>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-text2 uppercase mb-1.5">Nova senha</label>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-text2 uppercase mb-1.5">Confirmar</label>
          <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border" />
        </div>
        <button disabled={busy} className="w-full py-2.5 rounded-lg bg-navy text-white font-semibold disabled:opacity-50">
          {busy ? "Salvando..." : "Salvar"}
        </button>
      </form>
    </div>
  );
}
