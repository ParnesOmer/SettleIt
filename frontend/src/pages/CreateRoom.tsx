import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Film, Loader2, Sparkles, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Template } from "@/types/api";

export default function CreateRoom() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .getTemplates()
      .then((list) => {
        if (!active) return;
        setTemplates(list);
        if (list[0]) {
          setSelectedId(list[0].id);
          setTopic(list[0].topic_name);
        }
      })
      .catch(() => active && setLoadFailed(true));
    return () => {
      active = false;
    };
  }, []);

  const canCreate = Boolean(selectedId) && name.trim().length > 0 && topic.trim().length > 0;

  async function handleCreate() {
    if (!selectedId || !canCreate) return;
    setCreating(true);
    try {
      const room = await api.createRoom({
        template_id: selectedId,
        topic: topic.trim(),
        display_name: name.trim(),
      });
      toast.success("Room created");
      navigate(`/room/${room.id}`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't create the room. Try again.");
      setCreating(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 py-12">
      <header className="mb-8">
        <p className="font-display text-2xl font-extrabold tracking-tight text-ink">
          SettleIt<span className="text-marigold">.</span>
        </p>
      </header>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        <h1 className="font-display text-3xl font-bold text-ink">Start a huddle</h1>
        <p className="mt-2 text-muted-foreground">
          Pick what you're deciding, share the link, and let everyone weigh in.
        </p>

        <div className="mt-8 space-y-6">
          <Field label="Your name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Rae"
              maxLength={60}
              autoFocus
            />
          </Field>

          <Field label="What are you deciding?">
            {loadFailed ? (
              <ErrorRow onRetry={() => window.location.reload()} />
            ) : templates === null ? (
              <div className="h-24 animate-pulse rounded-lg border border-border bg-muted/40" />
            ) : (
              <div className="space-y-2.5">
                {templates.map((template) => (
                  <TopicCard
                    key={template.id}
                    title={template.topic_name}
                    detail={`${template.seed_chips.length} quick questions to get going`}
                    selected={selectedId === template.id}
                    onSelect={() => {
                      setSelectedId(template.id);
                      setTopic(template.topic_name);
                    }}
                  />
                ))}
                <CustomTopicCard />
              </div>
            )}
          </Field>

          <Field label="Name this huddle">
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Friday movie night"
              maxLength={200}
            />
          </Field>

          <Button size="lg" className="w-full" disabled={!canCreate || creating} onClick={handleCreate}>
            {creating ? (
              <>
                <Loader2 className="animate-spin" />
                Creating…
              </>
            ) : (
              <>
                Create room
                <ArrowRight />
              </>
            )}
          </Button>
        </div>
      </motion.div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-ink">{label}</span>
      {children}
    </label>
  );
}

function TopicCard({
  title,
  detail,
  selected,
  onSelect,
}: {
  title: string;
  detail: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg border bg-card p-3.5 text-left transition-colors",
        selected ? "border-marigold ring-1 ring-marigold" : "border-border hover:border-secondary/50",
      )}
    >
      <span
        className={cn(
          "flex size-10 items-center justify-center rounded-md",
          selected ? "bg-marigold text-ink" : "bg-muted text-plum",
        )}
      >
        <Film className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-lg font-semibold text-ink">{title}</span>
        <span className="block text-sm text-muted-foreground">{detail}</span>
      </span>
      <Users className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

function CustomTopicCard() {
  return (
    <div className="flex w-full items-center gap-3 rounded-lg border border-dashed border-border bg-transparent p-3.5 text-left opacity-70">
      <span className="flex size-10 items-center justify-center rounded-md bg-muted text-plum">
        <Sparkles className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-lg font-semibold text-ink">Custom topic</span>
        <span className="block text-sm text-muted-foreground">Describe anything — we'll design the room</span>
      </span>
      <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 font-mono text-xs text-muted-foreground">
        soon
      </span>
    </div>
  );
}

function ErrorRow({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 text-sm">
      <p className="text-ink">We couldn't load the topics.</p>
      <p className="mt-1 text-muted-foreground">Check the backend is running, then try again.</p>
      <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
