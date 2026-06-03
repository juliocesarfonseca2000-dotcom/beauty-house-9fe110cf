import { useEffect, useState } from "react";
import { IconUpload, IconTrash, IconArrowsExchange, IconX } from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { TableSkeleton } from "@/components/ui/table-skeleton";

type Photo = {
  id: string;
  url: string;
  category: string | null;
  date: string;
  created_at: string;
  procedure_id: string | null;
  procedures: { name: string } | null;
};
type Procedure = { id: string; name: string };

const BUCKET = "client-photos";

export function PhotosTab({ clientId }: { clientId: string }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState<"antes" | "depois" | "evolucao">("antes");
  const [procedureId, setProcedureId] = useState("");
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [full, setFull] = useState<Photo | null>(null);
  const [compare, setCompare] = useState<{ a?: string; b?: string }>({});

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("client_photos")
      .select("id,url,category,date,created_at,procedure_id,procedures(name)")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setPhotos((data as never) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      supabase.from("client_photos").select("id,url,category,date,created_at,procedure_id,procedures(name)").eq("client_id", clientId).order("created_at", { ascending: false }),
      supabase.from("procedures").select("id,name").eq("active", true).order("name"),
    ]).then(([photosRes, procRes]) => {
      if (!active) return;
      if (photosRes.error) toast.error(photosRes.error.message);
      setPhotos((photosRes.data as unknown as Photo[]) ?? []);
      setProcedures((procRes.data as Procedure[]) ?? []);
      setLoading(false);
    });
    return () => { active = false; };
  }, [clientId]);

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    try {
      for (const file of files) {
        const ext = file.name.split(".").pop() ?? "jpg";
        const photoId = crypto.randomUUID();
        const path = `${clientId}/${photoId}.${ext}`;
        const up = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
        if (up.error) throw up.error;
        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
        const ins = await supabase.from("client_photos").insert({
          client_id: clientId,
          url: pub.publicUrl,
          category,
          procedure_id: procedureId || null,
        });
        if (ins.error) throw ins.error;
      }
      toast.success(`${files.length} foto(s) enviada(s)`);
      e.target.value = "";
      load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const remove = async (p: Photo) => {
    if (!confirm("Excluir esta foto?")) return;
    // Extract storage path from URL
    const marker = `/${BUCKET}/`;
    const idx = p.url.indexOf(marker);
    const path = idx >= 0 ? p.url.slice(idx + marker.length) : null;
    if (path) await supabase.storage.from(BUCKET).remove([path]);
    const { error } = await supabase.from("client_photos").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Foto excluída");
    setCompare((c) => ({ a: c.a === p.url ? undefined : c.a, b: c.b === p.url ? undefined : c.b }));
    load();
  };

  const pickCompare = (url: string) => {
    setCompare((c) => {
      if (c.a === url) return { ...c, a: undefined };
      if (c.b === url) return { ...c, b: undefined };
      if (!c.a) return { ...c, a: url };
      if (!c.b) return { ...c, b: url };
      return { a: url, b: c.a };
    });
  };

  const grouped = {
    antes: photos.filter((p) => p.category === "antes"),
    depois: photos.filter((p) => p.category === "depois"),
    evolucao: photos.filter((p) => p.category === "evolucao" || !p.category),
  };

  return (
    <div className="space-y-5">
      <div className="bh-card p-5">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex rounded-lg border border-border overflow-hidden text-sm">
            {(["antes", "depois", "evolucao"] as const).map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`px-3 py-2 capitalize ${category === c ? "bg-navy text-white" : "bg-card text-text2 hover:bg-bg2"}`}
              >
                {c}
              </button>
            ))}
          </div>
          <label className="px-4 py-2 rounded-lg bg-gold text-navy font-semibold text-sm flex items-center gap-2 cursor-pointer hover:bg-gold/90">
            <IconUpload size={16} />
            {uploading ? "Enviando..." : "Enviar fotos"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={onUpload}
              disabled={uploading}
            />
          </label>
          <select value={procedureId} onChange={(e) => setProcedureId(e.target.value)} className="px-3 py-2 rounded-lg border border-border bg-card text-sm">
            <option value="">Sem procedimento</option>
            {procedures.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div className="text-xs text-text3 ml-auto">
            Categoria selecionada será usada nas novas fotos.
          </div>
        </div>
      </div>

      {compare.a && compare.b && (
        <div className="bh-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <IconArrowsExchange size={18} className="text-gold" />
            <div className="font-display text-lg text-navy">Comparação lado a lado</div>
            <button
              onClick={() => setCompare({})}
              className="ml-auto text-sm text-text3 hover:text-navy"
            >
              limpar
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <img src={compare.a} className="w-full rounded-lg border border-border" alt="A" />
            <img src={compare.b} className="w-full rounded-lg border border-border" alt="B" />
          </div>
        </div>
      )}

      {loading ? (
        <TableSkeleton rows={4} cols={3} />
      ) : photos.length === 0 ? (
        <div className="bh-card p-12 text-center text-text3 text-sm">
          Nenhuma foto enviada ainda.
        </div>
      ) : (
        (["antes", "depois", "evolucao"] as const).map((cat) =>
          grouped[cat].length === 0 ? null : (
            <div key={cat} className="bh-card p-5 space-y-3">
              <div className="font-display text-lg text-navy capitalize">{cat}</div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {grouped[cat].map((p) => {
                  const selected = compare.a === p.url || compare.b === p.url;
                  return (
                    <div key={p.id} className="relative group">
                      <button
                        onClick={() => setFull(p)}
                        className={`block w-full aspect-square rounded-lg overflow-hidden border-2 transition ${selected ? "border-gold ring-2 ring-gold/30" : "border-border hover:border-navy"}`}
                      >
                        <img src={p.url} className="w-full h-full object-cover" alt={`Foto ${cat}`} loading="lazy" />
                      </button>
                      <button onClick={() => pickCompare(p.url)} className="absolute top-1 left-1 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100">
                        comparar
                      </button>
                      <div className="absolute bottom-1 left-1 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded">
                        {new Date(p.date).toLocaleDateString("pt-BR")} · {p.procedures?.name ?? cat}
                      </div>
                      <button
                        onClick={() => remove(p)}
                        className="absolute top-1 right-1 p-1 rounded bg-black/60 text-white opacity-0 group-hover:opacity-100 hover:bg-danger"
                      >
                        <IconTrash size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ),
        )
      )}

      <div className="text-xs text-text3 text-center">
        Selecione 2 fotos para comparar lado a lado.
      </div>
      {full && (
        <div className="fixed inset-0 z-50 bg-navy/90 flex items-center justify-center p-4" onClick={() => setFull(null)}>
          <button type="button" className="absolute top-4 right-4 p-2 rounded-lg bg-card text-navy" onClick={() => setFull(null)}>
            <IconX size={20} />
          </button>
          <img src={full.url} alt="Foto da cliente" className="max-w-full max-h-full object-contain rounded-lg" />
        </div>
      )}
    </div>
  );
}
