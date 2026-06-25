import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { IconTrash, IconUpload } from "@tabler/icons-react";
import { toast } from "sonner";
import { withTimeout } from "@/lib/with-timeout";

const BUCKET = "client-photos";
const PREFIX = (clientId: string) => `ficha-antiga/${clientId}/`;

export function FichaAntigaTab({ clientId }: { clientId: string }) {
  const { user: me } = useAuth();
  const canEdit = me?.role === "admin" || me?.role === "receptionist" || me?.is_evaluator === true;
  const [uploading, setUploading] = useState(false);
  const queryClient = useQueryClient();

  const { data: photos = [], isLoading } = useQuery({
    queryKey: ["ficha-antiga", clientId],
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .list(PREFIX(clientId), { sortBy: { column: "created_at", order: "desc" } });
      if (error) throw error;
      const urls = await Promise.all(
        (data ?? []).map(async (f) => {
          const { data: signed } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(`${PREFIX(clientId)}${f.name}`, 3600);
          return { name: f.name, url: signed?.signedUrl ?? "", path: `${PREFIX(clientId)}${f.name}` };
        })
      );
      return urls.filter((u) => u.url);
    },
  });

  const reload = () => queryClient.invalidateQueries({ queryKey: ["ficha-antiga", clientId] });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    try {
      for (const file of files) {
        const ext = file.name.split(".").pop();
        const path = `${PREFIX(clientId)}${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error } = await withTimeout(
          supabase.storage.from(BUCKET).upload(path, file, { upsert: false }),
          12000,
          "Upload da ficha"
        );
        if (error) throw error;
      }
      toast.success("Ficha enviada com sucesso!");
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar ficha");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleDelete = async (path: string) => {
    if (!confirm("Excluir esta foto da ficha?")) return;
    await supabase.storage.from(BUCKET).remove([path]);
    reload();
  };

  return (
    <div className="space-y-4">
      {canEdit && (
        <label className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gold/10 border border-gold/30 text-gold text-sm font-semibold cursor-pointer hover:bg-gold/20 w-fit">
          <IconUpload size={16} />
          {uploading ? "Enviando..." : "Enviar foto da ficha antiga"}
          <input type="file" accept="image/*" multiple className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
      )}

      {isLoading ? (
        <div className="text-text3 text-sm">Carregando...</div>
      ) : photos.length === 0 ? (
        <div className="text-text3 text-sm py-8 text-center">Nenhuma foto de ficha antiga cadastrada.</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {photos.map((p) => (
            <div key={p.path} className="relative group rounded-lg overflow-hidden border border-border bg-bg2 aspect-[3/4]">
              <img src={p.url} alt="Ficha antiga" className="w-full h-full object-cover" />
              {canEdit && (
                <button
                  type="button"
                  onClick={() => handleDelete(p.path)}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-danger text-white opacity-0 group-hover:opacity-100 transition"
                >
                  <IconTrash size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
