import { colorForName, initials } from "@/lib/identity";
import { cn } from "@/lib/utils";

interface AvatarProps {
  name: string;
  size?: number;
  className?: string;
}

// A member token — the unit the "huddle" signature is built from.
export function Avatar({ name, size = 36, className }: AvatarProps) {
  return (
    <div
      className={cn(
        "flex shrink-0 select-none items-center justify-center rounded-full font-semibold ring-2 ring-background",
        colorForName(name),
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      title={name}
      aria-hidden
    >
      {initials(name)}
    </div>
  );
}
