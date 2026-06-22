import { Languages } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

export function LanguageToggle({
  className,
  iconOnly,
}: {
  className?: string;
  iconOnly?: boolean;
}) {
  const { lang, setLang, t } = useT();
  const toggle = () => setLang(lang === "en" ? "he" : "en");

  if (iconOnly) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className={className}
        onClick={toggle}
        aria-label={t("lang.toggle")}
      >
        <Languages />
      </Button>
    );
  }

  return (
    <Button variant="ghost" size="sm" className={className} onClick={toggle}>
      <Languages className="size-4" />
      {t("lang.toggle")}
    </Button>
  );
}
