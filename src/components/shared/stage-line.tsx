import { Suspense } from "react";

// "Where this item stands in the whole trail", filled in after the list itself has appeared: the list used to wait
// for these extra reads before showing anything.
async function Label({ labels, id }: { labels: Promise<Map<string, string>>; id: string }) {
  const text = (await labels).get(id);
  return text ? <>{text}</> : null;
}

export function StageLine({ labels, id, className = "block text-xs text-muted-foreground" }: { labels: Promise<Map<string, string>>; id: string; className?: string }) {
  return (
    <span className={className}>
      <Suspense fallback={null}>
        <Label labels={labels} id={id} />
      </Suspense>
    </span>
  );
}
