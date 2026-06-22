import { AnimatePresence, motion } from "framer-motion";
import { Check, Lock, Trophy } from "lucide-react";

import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Member, Suggestion, SuggestionSet } from "@/types/api";

interface DeckProps {
  set: SuggestionSet | null;
  members: Member[];
  meId?: string;
  isAdmin: boolean;
  decided: boolean;
  decidedId: string | null;
  readOnly?: boolean;
  onVote: (id: string) => void;
  onLock: (id: string) => void;
}

export function SuggestionDeck({
  set,
  members,
  meId,
  isAdmin,
  decided,
  decidedId,
  readOnly = false,
  onVote,
  onLock,
}: DeckProps) {
  const { t } = useT();
  if (!set) return null;
  const nameById = new Map(members.map((m) => [m.id, m.display_name]));
  const maxVotes = Math.max(0, ...set.suggestions.map((s) => s.vote_count));

  return (
    <section className="mt-5">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="font-mono text-xs uppercase tracking-wide text-plum">{t("sug.title")}</span>
        <span className="h-px flex-1 bg-border" />
        <span className="font-mono text-[11px] text-muted-foreground">
          {t("sug.gen", { n: set.generation_number })}
        </span>
      </div>

      {set.status === "pending" && <GeneratingState />}

      {set.status === "failed" && (
        <div className="rounded-lg border border-border bg-card p-4 text-sm">
          <p className="text-ink">{t("sug.failed")}</p>
          <p className="mt-1 text-muted-foreground">
            {isAdmin ? t("sug.failedAdmin") : t("sug.failedMember")}
          </p>
        </div>
      )}

      {set.status === "complete" && (
        <div className="space-y-2.5">
          {set.suggestions.map((s) => (
            <SuggestionCard
              key={s.id}
              s={s}
              nameById={nameById}
              meId={meId}
              isAdmin={isAdmin}
              decided={decided}
              isWinner={decided && decidedId === s.id}
              isLeader={!decided && maxVotes > 0 && s.vote_count === maxVotes}
              dimmed={decided && decidedId !== s.id}
              readOnly={readOnly}
              onVote={onVote}
              onLock={onLock}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function SuggestionCard({
  s,
  nameById,
  meId,
  isAdmin,
  decided,
  isWinner,
  isLeader,
  dimmed,
  readOnly,
  onVote,
  onLock,
}: {
  s: Suggestion;
  nameById: Map<string, string>;
  meId?: string;
  isAdmin: boolean;
  decided: boolean;
  isWinner: boolean;
  isLeader: boolean;
  dimmed: boolean;
  readOnly: boolean;
  onVote: (id: string) => void;
  onLock: (id: string) => void;
}) {
  const { t } = useT();
  const backed = meId ? s.backer_ids.includes(meId) : false;
  const meta = Object.values(s.metadata || {}).filter(Boolean);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: dimmed ? 0.5 : 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={cn(
        "rounded-2xl border bg-card p-3.5",
        isWinner
          ? "border-marigold ring-2 ring-marigold"
          : isLeader
            ? "border-marigold"
            : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display text-lg font-semibold leading-tight text-ink">{s.title}</h3>
        {isWinner && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-marigold px-2 py-0.5 text-xs font-medium text-ink">
            <Trophy className="size-3.5" />
            {t("sug.decided")}
          </span>
        )}
        {isLeader && (
          <span className="shrink-0 rounded-full bg-marigold/15 px-2 py-0.5 text-xs font-medium text-[#9a6212]">
            {t("sug.leading")}
          </span>
        )}
      </div>

      <p className="mt-1 text-sm text-muted-foreground">{s.rationale}</p>

      {meta.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {meta.map((m, i) => (
            <span key={i} className="rounded-md bg-muted px-2 py-0.5 text-xs text-plum">
              {m}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex">
            <AnimatePresence mode="popLayout">
              {s.backer_ids.slice(0, 5).map((id, i) => (
                <motion.div
                  key={id}
                  layout
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 24 }}
                  className={i > 0 ? "-ms-2" : ""}
                >
                  <Avatar name={nameById.get(id) ?? "?"} size={24} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          <span className="font-mono text-xs text-muted-foreground">
            {t(s.vote_count === 1 ? "sug.votes_one" : "sug.votes_other", { n: s.vote_count })}
          </span>
        </div>

        {!decided && !readOnly && (
          <div className="flex items-center gap-1.5">
            {isAdmin && (
              <Button variant="ghost" size="sm" className="text-plum" onClick={() => onLock(s.id)}>
                <Lock className="size-3.5" />
                {t("sug.lock")}
              </Button>
            )}
            <button
              onClick={() => onVote(s.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                backed
                  ? "bg-marigold text-ink"
                  : "border border-plum/50 text-plum hover:bg-plum/5",
              )}
            >
              {backed && <Check className="size-3.5" />}
              {backed ? t("sug.backed") : t("sug.back")}
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function GeneratingState() {
  const { t } = useT();
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
      <p className="mt-3 font-display text-lg font-semibold text-ink">{t("sug.reading")}</p>
      <p className="mt-1 text-sm text-muted-foreground">{t("sug.readingBody")}</p>
    </div>
  );
}
