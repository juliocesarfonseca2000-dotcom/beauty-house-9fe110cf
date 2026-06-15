import { createServerFn } from "@tanstack/react-start";

// Server-only admin operations for app users.
// Verifies the caller's JWT, ensures admin role, then performs action via service role.

const SUPABASE_URL = "https://kfdjnysgfvlxnnfsemnr.supabase.co";

async function assertAdmin(accessToken: string) {
  const serviceKey = process.env.BH_SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("Service role não configurado no servidor.");

  // Validate JWT
  const ures = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${accessToken}` },
  });
  if (!ures.ok) throw new Error("Sessão inválida.");
  const u = (await ures.json()) as { id: string };

  // Confirm admin
  const rres = await fetch(`${SUPABASE_URL}/rest/v1/app_users?select=role&id=eq.${u.id}`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  const arr = (await rres.json()) as Array<{ role: string }>;
  if (!arr[0] || arr[0].role !== "admin") throw new Error("Apenas administradores.");
  return { serviceKey };
}

type CreateInput = {
  accessToken: string;
  email: string;
  password: string;
  name: string;
  role: "admin" | "receptionist" | "professional";
  cargo: string | null;
  is_evaluator: boolean;
  permissions: Record<string, boolean>;
  show_in_agenda?: boolean;
};


export const createAppUser = createServerFn({ method: "POST" })
  .inputValidator((data: CreateInput) => data)
  .handler(async ({ data }) => {
    const { serviceKey } = await assertAdmin(data.accessToken);

    const cu = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: "POST",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: data.email,
        password: data.password,
        email_confirm: true,
        user_metadata: { name: data.name },
      }),
    });
    if (!cu.ok) throw new Error((await cu.text()) || "Falha ao criar no Auth.");
    const created = (await cu.json()) as { id: string };

    const ins = await fetch(`${SUPABASE_URL}/rest/v1/app_users`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        id: created.id,
        name: data.name,
        email: data.email,
        role: data.role,
        cargo: data.cargo,
        is_evaluator: data.is_evaluator,
        permissions: data.permissions,
        active: true,
        show_in_agenda: data.show_in_agenda ?? true,
      }),

    });
    if (!ins.ok) throw new Error((await ins.text()) || "Falha ao gravar perfil.");
    return { ok: true, id: created.id };
  });

type UpdateInput = {
  accessToken: string;
  id: string;
  patch: {
    name?: string;
    role?: "admin" | "receptionist" | "professional";
    cargo?: string | null;
    is_evaluator?: boolean;
    permissions?: Record<string, boolean>;
    active?: boolean;
  };
  password?: string;
};

export const updateAppUser = createServerFn({ method: "POST" })
  .inputValidator((data: UpdateInput) => data)
  .handler(async ({ data }) => {
    const { serviceKey } = await assertAdmin(data.accessToken);

    const up = await fetch(`${SUPABASE_URL}/rest/v1/app_users?id=eq.${data.id}`, {
      method: "PATCH",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(data.patch),
    });
    if (!up.ok) throw new Error((await up.text()) || "Falha ao atualizar perfil.");

    if (data.password) {
      const pw = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${data.id}`, {
        method: "PUT",
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ password: data.password }),
      });
      if (!pw.ok) throw new Error("Perfil ok mas senha falhou: " + (await pw.text()));
    }
    return { ok: true };
  });

type DeleteInput = { accessToken: string; id: string };

export const deleteAppUser = createServerFn({ method: "POST" })
  .inputValidator((data: DeleteInput) => data)
  .handler(async ({ data }) => {
    const { serviceKey } = await assertAdmin(data.accessToken);
    const h = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };

    // Limpa referências (FK) antes de excluir para evitar 23503
    const nullifyRefs: Array<[string, string]> = [
      ["appointments", "professional_id"],
      ["clients", "evaluator_id"],
      ["sessions", "professional_id"],
      ["packages", "professional_id"],
      ["income", "professional_id"],
    ];
    await Promise.all(
      nullifyRefs.map(([table, col]) =>
        fetch(`${SUPABASE_URL}/rest/v1/${table}?${col}=eq.${data.id}`, {
          method: "PATCH",
          headers: h,
          body: JSON.stringify({ [col]: null }),
        }).catch(() => null),
      ),
    );

    const delRow = await fetch(`${SUPABASE_URL}/rest/v1/app_users?id=eq.${data.id}`, {
      method: "DELETE",
      headers: h,
    });
    if (!delRow.ok) {
      const msg = await delRow.text();
      throw new Error(msg || "Falha ao remover perfil (registros vinculados).");
    }
    const del = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${data.id}`, {
      method: "DELETE",
      headers: h,
    });
    if (!del.ok) throw new Error((await del.text()) || "Falha ao remover do Auth.");
    return { ok: true };
  });
