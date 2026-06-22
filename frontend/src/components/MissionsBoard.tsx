import { motion } from "framer-motion";
import { Check, Dices, ExternalLink, Hand, RotateCcw } from "lucide-react";

import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Mission } from "@/types/api";

interface BoardProps {
  missions: Mission[];
  meId?: string;
  readOnly?: boolean;
  onClaim: (id: string) => void;
  onComplete: (id: string) => void;
  onAssignRandom: () => void;
}

export function MissionsBoard({
  missions,
  meId,
  readOnly = false,
  onClaim,
  onComplete,
  onAssignRandom,
}: BoardProps) {
  if (missions.length === 0) return <LiningUp />;

  const done = missions.filter((m) => m.status === "done").length;
  const hasOpen = missions.some((m) => !m.assigned_member_id);

  return (
    <section className="mt-1">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="font-mono text-xs uppercase tracking-wide text-plum">Missions</span>
        <span className="h-px flex-1 bg-border" />
        <span className="font-mono text-[11px] text-muted-foreground">
          {done}/{missions.length} done
        </span>
      </div>

      <div className="space-y-2.5">
        {missions.map((m) => (
          <MissionCard
            key={m.id}
            m={m}
            meId={meId}
            readOnly={readOnly}
            onClaim={onClaim}
            onComplete={onComplete}
          />
        ))}
      </div>

      {hasOpen && !readOnly && (
        <Button variant="outline" className="mt-3 w-full" onClick={onAssignRandom}>
          <Dices className="size-4" />
          Assign leftovers randomly
        </Button>
      )}
    </section>
  );
}

function MissionCard({
  m,
  meId,
  readOnly,
  onClaim,
  onComplete,
}: {
  m: Mission;
  meId?: string;
  readOnly: boolean;
  onClaim: (id: string) => void;
  onComplete: (id: string) => void;
}) {
  const done = m.status === "done";
  const mine = Boolean(meId && m.assigned_member_id === meId);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={cn("rounded-2xl border bg-card p-3.5", done ? "border-sage/60" : "border-border")}
    >
      <div className="flex items-start justify-between gap-2">
        <h3
          className={cn(
            "font-display text-lg font-semibold leading-tight text-ink",
            done && "line-through decoration-sage/60",
          )}
        >
          {m.title}
        </h3>
        {m.assigned_member_id && (
          <div className="flex shrink-0 items-center gap-1.5">
            <Avatar name={m.assignee_name ?? "?"} size={24} />
            <span className="text-xs text-muted-foreground">{mine ? "you" : m.assignee_name}</span>
          </div>
        )}
      </div>

      <p className="mt-1 text-sm text-muted-foreground">{m.description}</p>

      {m.resources.length > 0 && (
        <div className="mt-2.5 rounded-lg border border-border bg-paper/60 p-2.5">
          <p className="mb-1.5 font-mono text-[11px] uppercase tracking-wide text-plum">Starter links</p>
          <ul className="space-y-1">
            {m.resources.map((r) => (
              <li key={r.id}>
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start gap-1.5 text-sm text-ink hover:text-plum"
                >
                  <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-muted-foreground group-hover:text-plum" />
                  <span className="min-w-0">
                    <span className="line-clamp-1 underline-offset-2 group-hover:underline">{r.title}</span>
                    <span className="block truncate font-mono text-[11px] text-muted-foreground">
                      {hostOf(r.url)}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!readOnly && (
        <div className="mt-3 flex items-center justify-end gap-2">
        {!done && !m.assigned_member_id && (
          <button
            onClick={() => onClaim(m.id)}
            className="inline-flex items-center gap-1.5 rounded-full border border-plum/50 px-3.5 py-1.5 text-sm font-medium text-plum transition-colors hover:bg-plum/5"
          >
            <Hand className="size-3.5" />
            I'll take it
          </button>
        )}
        {!done && mine && (
          <button
            onClick={() => onClaim(m.id)}
            className="rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-ink"
          >
            Release
          </button>
        )}
        {done ? (
          <button
            onClick={() => onComplete(m.id)}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-sage"
          >
            <Check className="size-3.5" />
            Done
            <RotateCcw className="size-3 opacity-60" />
          </button>
        ) : (
          <button
            onClick={() => onComplete(m.id)}
            className="inline-flex items-center gap-1.5 rounded-full bg-marigold px-3.5 py-1.5 text-sm font-medium text-ink"
          >
            <Check className="size-3.5" />
            Mark done
          </button>
        )}
        </div>
      )}
    </motion.div>
  );
}

function LiningUp() {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 text-center">
      <div className="flex items-center justify-center gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <motion.span
            key={i}
            className="size-2.5 rounded-full bg-marigold"
            animate={{ opacity: [0.3, 1, 0.3], y: [0, -4, 0] }}
            transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.15 }}
          />
        ))}
      </div>
      <p className="mt-3 font-display text-lg font-semibold text-ink">Lining up the missions…</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Turning your decision into next steps with real links.
      </p>
    </div>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
