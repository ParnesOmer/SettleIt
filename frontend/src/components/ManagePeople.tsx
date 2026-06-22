import { Check, Link2, UserMinus, X } from "lucide-react";

import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import type { Member } from "@/types/api";

interface ManagePeopleProps {
  requiresApproval: boolean;
  members: Member[];
  pendingMembers: Member[];
  meId?: string;
  onToggleApproval: (value: boolean) => void;
  onRotate: () => void;
  onApprove: (id: string) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}

export function ManagePeople({
  requiresApproval,
  members,
  pendingMembers,
  meId,
  onToggleApproval,
  onRotate,
  onApprove,
  onRemove,
  onClose,
}: ManagePeopleProps) {
  const { t } = useT();
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
          <h2 className="font-display text-xl font-bold text-ink">{t("people.title")}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X />
          </Button>
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-3">
          <input
            type="checkbox"
            checked={requiresApproval}
            onChange={(e) => onToggleApproval(e.target.checked)}
            className="mt-0.5 size-4 accent-marigold"
          />
          <span>
            <span className="block text-sm font-medium text-ink">{t("people.requireApproval")}</span>
            <span className="block text-sm text-muted-foreground">
              {t("people.requireApprovalDesc")}
            </span>
          </span>
        </label>

        <Button variant="outline" className="mt-3 w-full justify-start" onClick={onRotate}>
          <Link2 className="size-4" />
          {t("people.resetLink")}
          <span className="ms-auto font-mono text-xs text-muted-foreground">
            {t("people.resetLinkHint")}
          </span>
        </Button>

        {pendingMembers.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 font-mono text-xs uppercase tracking-wide text-plum">
              {t("people.waiting")}
            </p>
            <ul className="space-y-1.5">
              {pendingMembers.map((m) => (
                <li key={m.id} className="flex items-center gap-2">
                  <Avatar name={m.display_name} size={28} />
                  <span className="flex-1 truncate text-sm text-ink">{m.display_name}</span>
                  <Button size="sm" onClick={() => onApprove(m.id)}>
                    <Check className="size-3.5" />
                    {t("people.approve")}
                  </Button>
                  <Button variant="ghost" size="sm" className="text-coral" onClick={() => onRemove(m.id)}>
                    {t("people.deny")}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-5">
          <p className="mb-2 font-mono text-xs uppercase tracking-wide text-plum">
            {t("people.inHuddle", { n: members.length })}
          </p>
          <ul className="space-y-1.5">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-2">
                <Avatar name={m.display_name} size={28} />
                <span className="flex-1 truncate text-sm text-ink">
                  {m.display_name}
                  {m.id === meId && <span className="text-muted-foreground"> · {t("people.you")}</span>}
                  {m.role === "admin" && (
                    <span className="text-muted-foreground"> · {t("people.host")}</span>
                  )}
                </span>
                {m.id !== meId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-coral"
                    onClick={() => onRemove(m.id)}
                  >
                    <UserMinus className="size-3.5" />
                    {t("people.remove")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
