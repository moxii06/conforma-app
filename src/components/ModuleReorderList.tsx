"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { GripVertical } from "lucide-react";

type Item = { id: string; node: ReactNode };

// Native HTML5 drag-and-drop, no extra dependency — this codebase has none
// of the usual dnd libraries installed and one row-reorder list doesn't
// justify adding one. Reorders optimistically in local state on drop, then
// persists via /api/lms/modules/reorder; a failed request leaves the
// visual order wrong until the next server refresh, which is an acceptable
// edge case for a low-stakes admin reorder action.
export function ModuleReorderList({ courseId, items }: { courseId: string; items: Item[] }) {
  const router = useRouter();
  const [order, setOrder] = useState(items.map((i) => i.id));
  const [dragId, setDragId] = useState<string | null>(null);

  const byId = new Map(items.map((i) => [i.id, i.node]));

  async function persist(nextOrder: string[]) {
    await fetch("/api/lms/modules/reorder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId, orderedModuleIds: nextOrder }),
    });
    router.refresh();
  }

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const next = [...order];
    const fromIndex = next.indexOf(dragId);
    const toIndex = next.indexOf(targetId);
    next.splice(fromIndex, 1);
    next.splice(toIndex, 0, dragId);
    setOrder(next);
    setDragId(null);
    void persist(next);
  }

  return (
    <div className="flex flex-col">
      {order.map((id) => (
        <div
          key={id}
          draggable
          onDragStart={() => setDragId(id)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => handleDrop(id)}
          className={`flex items-start gap-2 ${dragId === id ? "opacity-50" : ""}`}
        >
          <div className="pt-3.5 cursor-grab text-slate shrink-0" title="Glisser pour réordonner">
            <GripVertical size={14} />
          </div>
          <div className="flex-1 min-w-0">{byId.get(id)}</div>
        </div>
      ))}
    </div>
  );
}
