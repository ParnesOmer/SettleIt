// Deterministic, brand-tinted token color + initials for a member name.

const TOKEN_COLORS = [
  "bg-coral text-white",
  "bg-plum text-white",
  "bg-marigold text-ink",
  "bg-sage text-white",
  "bg-ink text-paper",
  "bg-[#C96A8E] text-white",
];

export function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return TOKEN_COLORS[hash % TOKEN_COLORS.length];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
