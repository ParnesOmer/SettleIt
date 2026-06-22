import { useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n";

export function AddMissionDialog({
  onAdd,
  onClose,
}: {
  onAdd: (title: string, description: string) => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl border border-border bg-paper p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-ink">{t("amission.title")}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X />
          </Button>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">{t("amission.label")}</span>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("amission.labelPlaceholder")}
            maxLength={200}
            autoFocus
          />
        </label>
        <label className="mt-3 block">
          <span className="mb-1.5 block text-sm font-medium text-ink">
            {t("amission.what")} <span className="text-muted-foreground">{t("amission.optional")}</span>
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("amission.whatPlaceholder")}
            maxLength={1000}
            rows={3}
            className="flex w-full rounded-md border border-input bg-card px-3.5 py-2 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </label>
        <Button className="mt-4 w-full" disabled={!title.trim()} onClick={() => onAdd(title.trim(), description.trim())}>
          {t("amission.add")}
        </Button>
      </div>
    </div>
  );
}
