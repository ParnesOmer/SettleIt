import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Film, Loader2, Sparkles, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LanguageToggle } from "@/components/LanguageToggle";
import { api, ApiError } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { saveToken } from "@/lib/session";
import { cn } from "@/lib/utils";
import type { Template } from "@/types/api";

const CUSTOM = "__custom__";

export default function CreateRoom() {
  const navigate = useNavigate();
  const { t } = useT();
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

  const isCustom = selectedId === CUSTOM;
  const canCreate = Boolean(selectedId) && name.trim().length > 0 && topic.trim().length > 0;

  async function handleCreate() {
    if (!selectedId || !canCreate) return;
    setCreating(true);
    try {
      const room = isCustom
        ? await api.createCustomRoom(topic.trim(), name.trim())
        : await api.createRoom({
            template_id: selectedId,
            topic: topic.trim(),
            display_name: name.trim(),
          });
      if (room.session_token) saveToken(room.id, room.session_token);
      toast.success(isCustom ? t("toast.designingRoom") : t("toast.roomCreated"));
      navigate(`/room/${room.id}`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t("toast.createFailed"));
      setCreating(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 py-12">
      <header className="mb-8 flex items-center justify-between">
        <p className="font-display text-2xl font-extrabold tracking-tight text-ink">
          SettleIt<span className="text-marigold">.</span>
        </p>
        <LanguageToggle />
      </header>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        <h1 className="font-display text-3xl font-bold text-ink">{t("create.title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("create.subtitle")}</p>

        <div className="mt-8 space-y-6">
          <Field label={t("create.yourName")}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("create.namePlaceholder")}
              maxLength={60}
              autoFocus
            />
          </Field>

          <Field label={t("create.deciding")}>
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
                    detail={t("create.questionsToGo", { n: template.seed_chips.length })}
                    selected={selectedId === template.id}
                    onSelect={() => {
                      setSelectedId(template.id);
                      setTopic(template.topic_name);
                    }}
                  />
                ))}
                <CustomTopicCard
                  selected={isCustom}
                  onSelect={() => {
                    setSelectedId(CUSTOM);
                    setTopic("");
                  }}
                />
              </div>
            )}
          </Field>

          <Field label={isCustom ? t("create.deciding") : t("create.nameHuddle")}>
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder={isCustom ? t("create.customTopicPlaceholder") : t("create.topicPlaceholder")}
              maxLength={200}
            />
          </Field>

          <Button size="lg" className="w-full" disabled={!canCreate || creating} onClick={handleCreate}>
            {creating ? (
              <>
                <Loader2 className="animate-spin" />
                {isCustom ? t("create.designing") : t("create.creating")}
              </>
            ) : (
              <>
                {isCustom ? t("create.ctaCustom") : t("create.cta")}
                {isCustom ? <Sparkles /> : <ArrowRight />}
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
        "flex w-full items-center gap-3 rounded-lg border bg-card p-3.5 text-start transition-colors",
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

function CustomTopicCard({ selected, onSelect }: { selected: boolean; onSelect: () => void }) {
  const { t } = useT();
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg border bg-card p-3.5 text-start transition-colors",
        selected
          ? "border-marigold ring-1 ring-marigold"
          : "border-dashed border-border hover:border-secondary/50",
      )}
    >
      <span
        className={cn(
          "flex size-10 items-center justify-center rounded-md",
          selected ? "bg-marigold text-ink" : "bg-muted text-plum",
        )}
      >
        <Sparkles className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-lg font-semibold text-ink">{t("create.custom")}</span>
        <span className="block text-sm text-muted-foreground">{t("create.customDesc")}</span>
      </span>
    </button>
  );
}

function ErrorRow({ onRetry }: { onRetry: () => void }) {
  const { t } = useT();
  return (
    <div className="rounded-lg border border-border bg-card p-4 text-sm">
      <p className="text-ink">{t("create.loadError")}</p>
      <p className="mt-1 text-muted-foreground">{t("create.loadErrorHint")}</p>
      <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
        {t("create.tryAgain")}
      </Button>
    </div>
  );
}
