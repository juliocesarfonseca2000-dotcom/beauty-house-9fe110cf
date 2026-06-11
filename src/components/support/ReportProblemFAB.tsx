import { useState } from "react";
import { IconBug, IconX, IconSend } from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export function ReportProblemFAB() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  if (!user) return null;

  const submit = async () => {
    const trimmed = msg.trim();
    if (trimmed.length < 5) {
      toast.error("Descreva o problema (mínimo 5 caracteres)");
      return;
    }
    setBusy(true);
    const page = typeof window !== "undefined" ? window.location.pathname : null;
    const user_agent = typeof navigator !== "undefined" ? navigator.userAgent : null;
    const created_at = new Date().toISOString();
    const { data: inserted, error } = await supabase.from("support_tickets").insert({
      user_id: user.id,
      user_email: user.email,
      user_name: user.name,
      page,
      user_agent,
      message: trimmed,
    }).select("id").single();
    if (error) {
      setBusy(false);
      toast.error(error.message);
      return;
    }
    // Dispara email — Edge Function atualiza email_sent / email_sent_at / email_error
    let ok = true;
    try {
      const { error: fnErr } = await supabase.functions.invoke("send-support-email", {
        body: {
          ticket_id: inserted?.id,
          user_name: user.name,
          user_email: user.email,
          page,
          message: trimmed,
          user_agent,
          created_at,
        },
      });
      if (fnErr) {
        ok = false;
        console.error("send-support-email falhou:", fnErr);
      }
    } catch (e) {
      ok = false;
      console.error("send-support-email exception:", e);
    }
    setBusy(false);
    toast.success(
      ok
        ? "Chamado enviado! Obrigado, vamos verificar"
        : "Chamado registrado (email para o admin falhou — verifique o painel Chamados)"
    );
    setMsg("");
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Reportar problema"
        aria-label="Reportar problema"
        className="fixed bottom-20 md:bottom-6 right-4 z-30 w-11 h-11 rounded-full bg-navy text-gold shadow-lg hover:bg-navy2 flex items-center justify-center border border-gold/40"
      >
        <IconBug size={20} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-navy/60 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <div className="font-display text-lg text-navy">Reportar problema</div>
              <button type="button" onClick={() => setOpen(false)} className="p-1.5 rounded hover:bg-bg2 text-text2">
                <IconX size={18} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <label className="block text-xs font-semibold text-text2 uppercase tracking-wide">
                O que aconteceu?
              </label>
              <textarea
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
                rows={5}
                maxLength={1500}
                placeholder="Descreva o problema com o máximo de detalhes possível..."
                className="w-full px-3 py-2 rounded-lg border border-border text-sm"
                autoFocus
              />
              <div className="text-[11px] text-text3">
                Enviamos junto: página atual, seu usuário e hora.
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-4 py-2 rounded-lg border border-border text-text2 hover:bg-bg2 text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={busy}
                  className="px-4 py-2 rounded-lg bg-gold text-white font-semibold hover:bg-gold2 disabled:opacity-50 text-sm flex items-center gap-2"
                >
                  <IconSend size={16} /> {busy ? "Enviando..." : "Enviar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
