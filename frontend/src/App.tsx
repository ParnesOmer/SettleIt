import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, ArrowRight, Check, Loader2, WifiOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type HealthState = "checking" | "online" | "degraded" | "offline";

const HUDDLE = [
  { initials: "RA", className: "bg-coral text-white" },
  { initials: "JO", className: "bg-plum text-white" },
  { initials: "MK", className: "bg-marigold text-ink" },
  { initials: "TY", className: "bg-sage text-white" },
];

const STATUS_COPY: Record<HealthState, { label: string; className: string }> = {
  checking: { label: "waking the agent…", className: "text-muted-foreground" },
  online: { label: "backend online · database ready", className: "text-sage" },
  degraded: { label: "backend online · database unreachable", className: "text-coral" },
  offline: { label: "can't reach the backend — is it running on :8001?", className: "text-coral" },
};

function StatusIcon({ state }: { state: HealthState }) {
  if (state === "checking") return <Loader2 className="animate-spin" />;
  if (state === "online") return <Check />;
  if (state === "offline") return <WifiOff />;
  return <AlertTriangle />;
}

export default function App() {
  const [state, setState] = useState<HealthState>("checking");

  useEffect(() => {
    let active = true;
    api
      .health()
      .then((res) => active && setState(res.database ? "online" : "degraded"))
      .catch(() => active && setState("offline"));
    return () => {
      active = false;
    };
  }, []);

  const status = STATUS_COPY[state];

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-16">
      <motion.div
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.07 } } }}
        className="flex w-full max-w-md flex-col items-center text-center"
      >
        <motion.div
          variants={{ hidden: { opacity: 0 }, show: { opacity: 1 } }}
          className="mb-8 flex items-center"
          aria-hidden
        >
          {HUDDLE.map((t, i) => (
            <motion.div
              key={t.initials}
              variants={{
                hidden: { opacity: 0, scale: 0.6, y: 6 },
                show: { opacity: 1, scale: 1, y: 0 },
              }}
              transition={{ type: "spring", stiffness: 500, damping: 24 }}
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-full font-sans text-sm font-semibold ring-4 ring-background",
                t.className,
                i > 0 && "-ml-3",
              )}
            >
              {t.initials}
            </motion.div>
          ))}
        </motion.div>

        <motion.h1
          variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
          className="font-display text-5xl font-extrabold tracking-tight text-ink"
        >
          SettleIt<span className="text-marigold">.</span>
        </motion.h1>

        <motion.p
          variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
          className="mt-3 text-pretty text-lg text-muted-foreground"
        >
          Get a noisy group to actually decide — then follow through together.
        </motion.p>

        <motion.div
          variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
          className="mt-8 w-full"
        >
          <Button size="lg" className="w-full" disabled>
            Create a room
            <ArrowRight />
          </Button>
          <p className="mt-3 font-mono text-xs text-muted-foreground">
            rooms land in milestone 2
          </p>
        </motion.div>

        <motion.div
          variants={{ hidden: { opacity: 0 }, show: { opacity: 1 } }}
          className={cn(
            "mt-10 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 font-mono text-xs [&_svg]:size-3.5",
            status.className,
          )}
          role="status"
          aria-live="polite"
        >
          <StatusIcon state={state} />
          {status.label}
        </motion.div>
      </motion.div>

      <p className="mt-16 font-mono text-xs text-muted-foreground/70">
        milestone 1 · scaffold
      </p>
    </main>
  );
}
