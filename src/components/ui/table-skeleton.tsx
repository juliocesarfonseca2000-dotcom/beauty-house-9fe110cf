// Skeleton de tabela — substitui "Carregando..." e dá sensação de velocidade
export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden">
      <div className="bg-bg2 px-5 py-3 flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="h-3 bg-border/60 rounded animate-pulse flex-1" />
        ))}
      </div>
      <div className="divide-y">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="px-5 py-4 flex gap-4">
            {Array.from({ length: cols }).map((_, c) => (
              <div
                key={c}
                className="h-3 bg-border/40 rounded animate-pulse flex-1"
                style={{ animationDelay: `${(r * cols + c) * 40}ms` }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="bh-card p-5 space-y-3">
      <div className="h-4 bg-border/60 rounded animate-pulse w-1/3" />
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-3 bg-border/40 rounded animate-pulse"
          style={{ width: `${60 + Math.random() * 35}%`, animationDelay: `${i * 80}ms` }}
        />
      ))}
    </div>
  );
}

export function ListSkeleton({ items = 5 }: { items?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: items }).map((_, i) => (
        <div
          key={i}
          className="bh-card p-4 flex items-center gap-3"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <div className="h-10 w-10 rounded-full bg-border/50 animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-border/60 rounded animate-pulse w-2/5" />
            <div className="h-3 bg-border/40 rounded animate-pulse w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
