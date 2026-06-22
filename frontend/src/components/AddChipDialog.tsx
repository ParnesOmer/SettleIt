import { useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SeedChip } from "@/types/api";

export function AddChipDialog({
  extraChips,
  onAdd,
  onRemove,
  onClose,
}: {
  extraChips: SeedChip[];
  onAdd: (label: string, options: string[]) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState("");
  const [optionsText, setOptionsText] = useState("");

  function submit() {
    const trimmed = label.trim();
    if (!trimmed) return;
    const options = optionsText
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
    onAdd(trimmed, options);
    setLabel("");
    setOptionsText("");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-border bg-paper p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-ink">Add a question</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X />
          </Button>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">Question</span>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Which dates?"
            maxLength={120}
            autoFocus
          />
        </label>
        <label className="mt-3 block">
          <span className="mb-1.5 block text-sm font-medium text-ink">
            Options <span className="text-muted-foreground">(comma-separated, optional)</span>
          </span>
          <Input
            value={optionsText}
            onChange={(e) => setOptionsText(e.target.value)}
            placeholder="This weekend, Next week"
          />
        </label>
        <Button className="mt-4 w-full" disabled={!label.trim()} onClick={submit}>
          Add question
        </Button>

        {extraChips.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 font-mono text-xs uppercase tracking-wide text-plum">
              Your added questions
            </p>
            <ul className="space-y-1.5">
              {extraChips.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2"
                >
                  <span className="flex-1 truncate text-sm text-ink">{c.label}</span>
                  <button onClick={() => onRemove(c.id)} className="text-coral" aria-label="Remove">
                    <X className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
