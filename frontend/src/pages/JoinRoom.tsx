import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";
import { saveToken } from "@/lib/session";
import type { RoomPreview } from "@/types/api";

export default function JoinRoom() {
  const { code } = useParams();
  const navigate = useNavigate();
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
          err instanceof ApiError && err.status === 404
            ? "This invite link isn't valid, or the huddle was closed."
            : "We couldn't load this huddle. Check your connection and try again.",
        );
      });
    return () => {
      active = false;
    };
  }, [code, navigate]);

  async function handleJoin() {
    if (!code || name.trim().length === 0) return;
    setJoining(true);
    try {
      const room = await api.joinRoom(code, name.trim());
      if (room.session_token) saveToken(room.id, room.session_token);
      toast.success("You're in");
      navigate(`/room/${room.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't join. Try again.");
      setJoining(false);
    }
  }

  if (error) {
    return (
      <Centered>
        <h1 className="font-display text-2xl font-bold text-ink">Hmm, that didn't work</h1>
        <p className="mt-2 text-muted-foreground">{error}</p>
        <Button variant="outline" className="mt-6" onClick={() => navigate("/")}>
          Start a new huddle
        </Button>
      </Centered>
    );
  }

  if (!preview) {
    return (
      <Centered>
        <Loader2 className="size-6 animate-spin text-plum" />
        <p className="mt-3 font-mono text-sm text-muted-foreground">opening the huddle…</p>
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
        <p className="font-mono text-xs uppercase tracking-wide text-plum">you're invited to</p>
        <h1 className="mt-1 font-display text-3xl font-bold text-ink">{preview.topic}</h1>

        {preview.member_count > 0 && (
          <div className="mt-4 flex items-center gap-3">
            <div className="flex">
              {preview.members.slice(0, 5).map((member, i) => (
                <Avatar key={`${member}-${i}`} name={member} size={32} className={i > 0 ? "-ml-2" : ""} />
              ))}
            </div>
            <span className="text-sm text-muted-foreground">
              {preview.member_count} {preview.member_count === 1 ? "person is" : "people are"} here
            </span>
          </div>
        )}

        <div className="mt-8 space-y-2">
          <span className="block text-sm font-medium text-ink">Join as…</span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            placeholder="Your name"
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
              Joining…
            </>
          ) : (
            <>
              Join huddle
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
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-6 text-center">
      {children}
    </main>
  );
}
