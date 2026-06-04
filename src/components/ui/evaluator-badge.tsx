// Selo dourado reutilizável para avaliadoras (★).
export function EvaluatorBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${className}`}
      style={{ background: "#FEF3C7", color: "#B8963E" }}
      title="Avaliadora"
    >
      ★ Avaliadora
    </span>
  );
}

// Apenas a estrela dourada (para inline com nomes em selects, etc).
export function EvaluatorStar({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block ${className}`}
      style={{ color: "#B8963E" }}
      title="Avaliadora"
    >
      ★
    </span>
  );
}
