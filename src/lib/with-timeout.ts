// Aborta promises lentas (rede travada, supabase fora do ar etc.)
// para o botão "Salvando..." nunca ficar eterno.
export function withTimeout<T>(p: PromiseLike<T>, ms = 12000, label = "Operação"): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`${label} demorou demais (${Math.round(ms / 1000)}s). Verifique sua conexão e tente novamente.`)),
      ms,
    );
    Promise.resolve(p).then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}
