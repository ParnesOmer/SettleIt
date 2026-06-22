import type { Lang } from "@/lib/i18n";
import type { SeedChip } from "@/types/api";

// Hebrew labels/options for the built-in movie-night chips (English in the DB). Options are mapped
// positionally to the stored English options. Custom-room chips are already generated in the room's
// language, so they aren't listed here.
const HE: Record<string, { label: string; options: string[] }> = {
  venue: { label: "קולנוע או בבית?", options: ["קולנוע", "סטרימינג"] },
  genre: {
    label: "ז׳אנר?",
    options: ["קומדיה", "דרמה", "אקשן", "אימה", "מדע בדיוני", "הכול הולך"],
  },
  when: { label: "מתי?", options: ["הערב", "בסוף השבוע"] },
  length: { label: "אורך?", options: ["עד שעתיים", "לא משנה"] },
};

export function localizeChip(chip: SeedChip, lang: Lang): { label: string; options: string[] } {
  const options = chip.options ?? [];
  if (lang === "he" && HE[chip.id]) {
    const he = HE[chip.id];
    return { label: he.label, options: options.map((o, i) => he.options[i] ?? o) };
  }
  return { label: chip.label, options };
}
