import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LanguageToggle } from "@/components/LanguageToggle";
import { api, ApiError } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { saveToken } from "@/lib/session";
import type { RoomPreview } from "@/types/api";

export default function JoinRoom() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { t } = useT();
  const [preview, setPreview] = useState<RoomPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!code) return;
    let active = true;
    api
      .getRoomPreview(code)
      .then((data) => {
        if (!active) return;
        if (data.already_member) {
          navigate(`/room/${data.id}`, { replace: true });
          return;
        }
        setPreview(data);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError && err.status === 404 ? t("join.invalid") : t("join.loadFailed"),
        );
      });
    return () => {
      active = false;
    };
  }, [code, navigate, t]);

  async function handleJoin() {
    if (!code || name.trim().length === 0) return;
    setJoining(true);
    try {
      const room = await api.joinRoom(code, name.trim());
      if (room.session_token) saveToken(room.id, room.session_token);
      toast.success(t("join.welcome"));
      navigate(`/room/${room.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("join.failed"));
      setJoining(false);
    }
  }

  if (error) {
    return (
      <Centered>
        <h1 className="font-display text-2xl font-bold text-ink">{t("join.badTitle")}</h1>
        <p className="mt-2 text-muted-foreground">{error}</p>
        <Button variant="outline" className="mt-6" onClick={() => navigate("/")}>
          {t("join.startNew")}
        </Button>
      </Centered>
    );
  }

  if (!preview) {
    return (
      <Centered>
        <Loader2 className="size-6 animate-spin text-plum" />
        <p className="mt-3 font-mono text-sm text-muted-foreground">{t("join.opening")}</p>
      </Centered>
    );
  }

  return (
    <Centered>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="w-full"
      >
        <p className="font-mono text-xs uppercase tracking-wide text-plum">{t("join.invitedTo")}</p>
        <h1 className="mt-1 font-display text-3xl font-bold text-ink">{preview.topic}</h1>

        {preview.welcome_blurb && (
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{preview.welcome_blurb}</p>
        )}

        {preview.member_count > 0 && (
          <div className="mt-4 flex items-center gap-3">
            <div className="flex">
              {preview.members.slice(0, 5).map((member, i) => (
                <Avatar key={`${member}-${i}`} name={member} size={32} className={i > 0 ? "-ms-2" : ""} />
              ))}
            </div>
            <span className="text-sm text-muted-foreground">
              {t("join.peopleHere", { n: preview.member_count })}
            </span>
          </div>
        )}

        <div className="mt-8 space-y-2">
          <span className="block text-sm font-medium text-ink">{t("join.joinAs")}</span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            placeholder={t("create.yourName")}
            maxLength={60}
            autoFocus
          />
        </div>

        <Button
          size="lg"
          className="mt-6 w-full"
          disabled={name.trim().length === 0 || joining}
          onClick={handleJoin}
        >
          {joining ? (
            <>
              <Loader2 className="animate-spin" />
              {t("join.joining")}
            </>
          ) : (
            <>
              {t("join.cta")}
              <ArrowRight />
            </>
          )}
        </Button>
      </motion.div>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="absolute end-4 top-4">
        <LanguageToggle />
      </div>
      {children}
    </main>
  );
}
