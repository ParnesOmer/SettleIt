import { motion } from "framer-motion";

import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import type { Member, Suggestion } from "@/types/api";

// The emotional peak: member tokens fly in from spread-out positions and settle into one tight
// huddle around the winner, with a marigold "Decided" seal.
export function DecisionCelebration({
  suggestion,
  members,
  onDone,
}: {
  suggestion: Suggestion;
  members: Member[];
  onDone: () => void;
}) {
  const nameById = new Map(members.map((m) => [m.id, m.display_name]));
  const backers = suggestion.backer_ids.length ? suggestion.backer_ids : members.map((m) => m.id);
  const shown = backers.slice(0, 7);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-paper/95 px-8 text-center backdrop-blur-sm"
    >
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="font-mono text-xs uppercase tracking-[0.2em] text-plum"
      >
        the huddle decided
      </motion.p>

      <motion.h2
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.15 }}
        className="mt-3 max-w-md font-display text-4xl font-extrabold leading-tight text-ink"
      >
        {suggestion.title}
      </motion.h2>

      <div className="mt-7 flex items-center justify-center">
        {shown.map((id, i) => (
          <motion.div
            key={id}
            initial={{ x: (i - (shown.length - 1) / 2) * 44, opacity: 0, scale: 0.6 }}
            animate={{ x: 0, opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 22, delay: 0.5 + i * 0.05 }}
            className={i > 0 ? "-ml-3" : ""}
          >
            <Avatar name={nameById.get(id) ?? "?"} size={42} />
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 14, delay: 1.05 }}
        className="mt-7 rounded-full bg-marigold px-4 py-1.5 text-sm font-semibold text-ink"
      >
        Decided
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.4 }}
        className="mt-10"
      >
        <Button onClick={onDone}>Back to the huddle</Button>
      </motion.div>
    </motion.div>
  );
}
