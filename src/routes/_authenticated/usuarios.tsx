import { createFileRoute } from "@tanstack/react-router";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { IconPlus, IconEdit, IconTrash, IconX, IconSettings } from "@tabler/icons-react";
import { supabase, type AppUser, type Permissions } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { createAppUser, updateAppUser, deleteAppUser } from "@/lib/users.functions";
import { EvaluatorBadge } from "@/components/ui/evaluator-badge";
import { SystemSettingsModal } from "@/components/system/SystemSettingsModal";
import { PasswordInput } from "@/components/ui/password-input";
import { Link } from "@tanstack/react-router";



export const Route = createFileRoute("/_authenticated/usuarios")({
  component: UsersPage,
});

const PERM_LABELS: Array<[keyof Permissions, string]> = [
  ["dash", "Dashboard"],
  ["agenda", "Agenda"],
  ["lembretes", "Lembretes"],
  ["clientes", "Clientes"],
  ["ficha", "Ficha & Sessões"],
  ["fechar", "Fechar Pacote"],
  ["procedimentos", "Procedimentos"],
  ["estoque", "Estoque"],
  ["financeiro", "Financeiro"],
  ["relatorios", "Relatórios"],
  ["escala", "Escala & Ponto"],
  ["meu_ponto", "Meu Ponto"],
  ["usuarios", "Usuários"],
];

const DEFAULT_PERMS_BY_ROLE: Record<AppUser["role"], Permissions> = {
  admin: {
    dash: true, agenda: true, lembretes: true, clientes: true, ficha: true, fechar: true,
    procedimentos: true, estoque: true, financeiro: true, relatorios: true, usuarios: true, escala: true, meu_ponto: false,
  },
  receptionist: {
    dash: true, agenda: true, lembretes: true, clientes: true, ficha: true, fechar: true,
    procedimentos: true, estoque: true, financeiro: false, relatorios: false, usuarios: false, escala: true, meu_ponto: false,
  },
  professional: {
    dash: true, agenda: true, lembretes: true, clientes: true, ficha: true, fechar: false,
    procedimentos: false, estoque: false, financeiro: false, relatorios: false, usuarios: false, escala: false, meu_ponto: true,
  },
};

function UsersPage() {
  const { user: me } = useAuth();
  const [rows, setRows] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<AppUser | null>(null);
  const [creating, setCreating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);


  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("app_users").select("*").order("name");
    if (error) toast.error(error.message);
    setRows((data as AppUser[]) ?? []);
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  if (me?.role !== "admin") {
    return <div className="bh-card p-12 text-center text-text3">Apenas administradores podem gerenciar usuários.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2 items-center">
        <Link to="/escala" className="px-3 py-2 rounded-lg border border-border text-text2 hover:bg-bg2 text-sm font-semibold">Ver escala geral</Link>
        <button
          onClick={() => setSettingsOpen(true)}
          className="p-2 rounded-md text-text3 hover:text-navy hover:bg-bg2"
          title="Configurações do sistema"
        >
          <IconSettings size={16} />
        </button>
        <button onClick={() => setCreating(true)} className="px-4 py-2.5 rounded-lg bg-gold text-white font-semibold hover:bg-gold2 flex items-center gap-2">
          <IconPlus size={18} /> Novo usuário
        </button>
      </div>



      <div className="bh-card overflow-x-auto">
        {loading ? (
          <TableSkeleton rows={5} cols={4} />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-bg2 text-text2">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Nome</th>
                <th className="text-left px-4 py-3 font-semibold">Email</th>
                <th className="text-left px-4 py-3 font-semibold">Cargo</th>
                <th className="text-left px-4 py-3 font-semibold">Papel</th>
                <th className="text-left px-4 py-3 font-semibold">Status</th>
                <th className="text-right px-4 py-3 font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u, i) => (
                <tr key={u.id} className={i % 2 ? "bg-bg2/40" : ""}>
                  <td className="px-4 py-3 font-semibold text-navy">
                    <span className="inline-flex items-center gap-2">
                      {u.name}
                      {u.is_evaluator && <EvaluatorBadge />}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-text2">{u.email}</td>
                  <td className="px-4 py-3 text-text2">{u.cargo ?? "—"}</td>
                  <td className="px-4 py-3"><span className="bh-badge bg-navy/10 text-navy">{u.role}</span></td>
                  <td className="px-4 py-3">
                    <span className={`bh-badge ${u.active ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>
                      {u.active ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => setEdit(u)} className="p-1.5 rounded-md hover:bg-bg2 text-navy" title="Editar">
                      <IconEdit size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {(creating || edit) && (
        <UserModal
          initial={edit}
          onClose={() => { setEdit(null); setCreating(false); }}
          onSaved={() => { setEdit(null); setCreating(false); load(); }}
        />
      )}
      {settingsOpen && <SystemSettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}


type DaySchedule = { start: string; end: string; active: boolean };
type WorkSchedule = Record<string, DaySchedule>;

const DEFAULT_SCHEDULE: WorkSchedule = {
  monday:    { start: "09:00", end: "18:00", active: true },
  tuesday:   { start: "09:00", end: "18:00", active: true },
  wednesday: { start: "09:00", end: "18:00", active: true },
  thursday:  { start: "09:00", end: "18:00", active: true },
  friday:    { start: "09:00", end: "18:00", active: true },
  saturday:  { start: "08:00", end: "14:00", active: true },
  sunday:    { start: "09:00", end: "18:00", active: false },
};

const DAYS = [
  { key: "monday",    label: "Segunda" },
  { key: "tuesday",   label: "Terça" },
  { key: "wednesday", label: "Quarta" },
  { key: "thursday",  label: "Quinta" },
  { key: "friday",    label: "Sexta" },
  { key: "saturday",  label: "Sábado" },
  { key: "sunday",    label: "Domingo" },
];

function UserModal({ initial, onClose, onSaved }: { initial: AppUser | null; onClose: () => void; onSaved: () => void }) {
  const { user: me } = useAuth();
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AppUser["role"]>(initial?.role ?? "professional");
  const [cargo, setCargo] = useState(initial?.cargo ?? "");
  const [isEval, setIsEval] = useState(initial?.is_evaluator ?? false);
  const [active, setActive] = useState(initial?.active ?? true);
  const [showInAgenda, setShowInAgenda] = useState<boolean>(initial?.show_in_agenda ?? true);
  const [agendaOrder, setAgendaOrder] = useState<number>(initial?.agenda_order ?? 999);
  const [perms, setPerms] = useState<Permissions>(initial?.permissions ?? DEFAULT_PERMS_BY_ROLE.professional);
  const [workSchedule, setWorkSchedule] = useState<WorkSchedule>(
    (initial as AppUser & { work_schedule?: WorkSchedule })?.work_schedule ?? DEFAULT_SCHEDULE
  );
  const [busy, setBusy] = useState(false);

  const createFn = useServerFn(createAppUser);
  const updateFn = useServerFn(updateAppUser);
  const deleteFn = useServerFn(deleteAppUser);

  const onRoleChange = (r: AppUser["role"]) => {
    setRole(r);
    if (!isEdit) setPerms(DEFAULT_PERMS_BY_ROLE[r]);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return toast.error("Nome e email obrigatórios");
    if (!isEdit && !password) return toast.error("Senha obrigatória");

    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) return toast.error("Sessão expirada");

    setBusy(true);
    try {
      if (isEdit && initial) {
        await updateFn({
          data: {
            accessToken: token,
            id: initial.id,
            patch: { name, role, cargo: cargo || null, is_evaluator: isEval, permissions: perms, active, show_in_agenda: showInAgenda, agenda_order: agendaOrder, work_schedule: workSchedule },
            password: password || undefined,
          },
        });
      } else {
        await createFn({
          data: {
            accessToken: token, email, password, name,
            role, cargo: cargo || null, is_evaluator: isEval, permissions: perms,
            show_in_agenda: showInAgenda, agenda_order: agendaOrder, work_schedule: workSchedule,
          },
        });
      }
      toast.success(isEdit ? "Atualizado!" : "Criado!");

      onSaved();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!initial) return;
    if (initial.id === me?.id) return toast.error("Você não pode excluir o próprio usuário.");
    if (!window.confirm(`Excluir ${initial.name}? Esta ação não pode ser desfeita.`)) return;
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) return toast.error("Sessão expirada");
    setBusy(true);
    try {
      await deleteFn({ data: { accessToken: token, id: initial.id } });
      toast.success("Usuário excluído.");
      onSaved();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-navy/60 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-2xl my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="font-display text-2xl text-navy">{isEdit ? "Editar usuário" : "Novo usuário"}</div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-bg2 text-text2"><IconX size={18} /></button>
        </div>
        <form onSubmit={save} className="p-6 space-y-4">


          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Nome*"><input value={name} onChange={(e) => setName(e.target.value)} className={inp} required /></Field>
            <Field label="Email*"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inp} required disabled={isEdit} /></Field>
            <Field label={isEdit ? "Nova senha (opcional)" : "Senha*"}>
              <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} className={inp} required={!isEdit} minLength={6} />
            </Field>
            <Field label="Cargo">
              <input value={cargo} onChange={(e) => setCargo(e.target.value)} className={inp} placeholder="Massagista, Esteticista..." />
            </Field>
            <Field label="Papel">
              <select value={role} onChange={(e) => onRoleChange(e.target.value as AppUser["role"])} className={inp}>
                <option value="professional">Profissional</option>
                <option value="receptionist">Recepcionista</option>
                <option value="admin">Administrador</option>
              </select>
            </Field>
            <Field label="Status">
              <div className="flex gap-3 items-center pt-2">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Ativo</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isEval} onChange={(e) => setIsEval(e.target.checked)} /> Avaliadora</label>
              </div>
            </Field>
          </div>

          <div>
            <div className="text-xs font-semibold text-text2 uppercase tracking-wide mb-2">Permissões de acesso aos módulos</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 bh-card p-4">
              {PERM_LABELS.map(([k, label]) => (
                <label key={k} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={perms[k]} onChange={(e) => setPerms((p) => ({ ...p, [k]: e.target.checked }))} />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {role === "professional" && (
            <label className="flex items-center gap-3 text-sm cursor-pointer p-3 bg-bg2 rounded-lg border border-border">
              <input
                type="checkbox"
                checked={showInAgenda}
                onChange={(e) => setShowInAgenda(e.target.checked)}
                className="w-4 h-4 accent-gold"
              />
              <div>
                <div className="font-semibold text-navy">📅 Aparece na grade da Agenda</div>
                <div className="text-xs text-text3">Desmarque para colaboradoras que não fazem atendimento (limpeza, suporte)</div>
              </div>
            </label>
          )}

          {role === "professional" && showInAgenda && (
            <div className="p-3 bg-bg2 rounded-lg border border-border">
              <div className="text-sm font-semibold text-navy mb-2">Ordem na agenda</div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAgendaOrder((o) => Math.max(1, o - 1))}
                  className="px-3 py-2 rounded-lg border border-border hover:bg-bg3 font-bold"
                >
                  ←
                </button>
                <span className="px-4 py-2 rounded-lg border border-border bg-card min-w-[60px] text-center font-semibold">
                  {agendaOrder}
                </span>
                <button
                  type="button"
                  onClick={() => setAgendaOrder((o) => o + 1)}
                  className="px-3 py-2 rounded-lg border border-border hover:bg-bg3 font-bold"
                >
                  →
                </button>
              </div>
              <div className="text-xs text-text3 mt-1">Menor número = mais à esquerda na agenda</div>
            </div>
          )}

          {role === "professional" && (
            <div className="space-y-2 mt-4 p-3 bg-bg2 rounded-lg border border-border">
              <div className="text-sm font-semibold text-navy">🕐 Horário de Trabalho</div>
              {DAYS.map(({ key, label }) => (
                <div key={key} className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={workSchedule[key].active}
                    onChange={(e) => setWorkSchedule((prev) => ({ ...prev, [key]: { ...prev[key], active: e.target.checked } }))}
                    className="accent-gold w-4 h-4"
                  />
                  <span className="text-sm w-16 text-navy">{label}</span>
                  <input
                    type="time"
                    value={workSchedule[key].start}
                    disabled={!workSchedule[key].active}
                    onChange={(e) => setWorkSchedule((prev) => ({ ...prev, [key]: { ...prev[key], start: e.target.value } }))}
                    className="border border-border rounded px-2 py-1 text-sm disabled:opacity-40"
                  />
                  <span className="text-sm text-text2">até</span>
                  <input
                    type="time"
                    value={workSchedule[key].end}
                    disabled={!workSchedule[key].active}
                    onChange={(e) => setWorkSchedule((prev) => ({ ...prev, [key]: { ...prev[key], end: e.target.value } }))}
                    className="border border-border rounded px-2 py-1 text-sm disabled:opacity-40"
                  />
                </div>
              ))}
            </div>
          )}


          <div className="flex justify-between gap-2 pt-2">
            {isEdit ? (
              <button type="button" onClick={remove} disabled={busy} className="px-4 py-2 rounded-lg border border-danger text-danger text-sm font-semibold hover:bg-danger/10 flex items-center gap-1.5">
                <IconTrash size={16} /> Excluir
              </button>
            ) : <div />}
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-text2 hover:bg-bg2">Cancelar</button>
              <button type="submit" disabled={busy} className="px-5 py-2 rounded-lg bg-navy text-white font-semibold hover:bg-navy2 disabled:opacity-50">
                {busy ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </form>


      </div>
    </div>
  );
}

const inp = "w-full px-3 py-2 rounded-lg border border-border bg-card focus:outline-none focus:ring-2 focus:ring-gold/40 text-sm disabled:bg-bg2 disabled:text-text3";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs font-semibold text-text2 uppercase tracking-wide mb-1.5">{label}</label>{children}</div>;
}
