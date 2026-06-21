import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2, Send, Share2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";
import { useRoomSocket } from "@/lib/useRoomSocket";
import { cn } from "@/lib/utils";
import type { Member, Message, RoomEvent, RoomState, SeedChip } from "@/types/api";

export default function Room() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [room, setRoom] = useState<RoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [activeChip, setActiveChip] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const meId = room?.me?.id;
  const isAdmin = room?.me?.role === "admin";
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    let active = true;
    api
      .getRoom(id)
      .then((data) => {
        if (!active) return;
        if (!data.me) {
          navigate(`/j/${data.invite_code}`, { replace: true });
          return;
        }
        setRoom(data);
        setMembers(data.members);
        setMessages(data.messages);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError && err.status === 404
            ? "This huddle doesn't exist."
            : "We couldn't load this huddle. Check your connection and try again.",
        );
      });
    return () => {
      active = false;
    };
  }, [id, navigate]);

  const addMessage = useCallback((msg: Message) => {
    setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
  }, []);

  const handleEvent = useCallback(
    (event: RoomEvent) => {
      if (event.type === "message_created") {
        addMessage(event.payload as Message);
      } else if (event.type === "member_joined") {
        const member = event.payload as Member;
        setMembers((prev) => (prev.some((m) => m.id === member.id) ? prev : [...prev, member]));
        toast(`${member.display_name} joined`);
      }
    },
    [addMessage],
  );

  useRoomSocket(room ? id : undefined, handleEvent);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function send(content: string) {
    const text = content.trim();
    if (!id || text.length === 0) return;
    try {
      const msg = await api.postMessage(id, text);
      addMessage(msg);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Message didn't send. Try again.");
    }
  }

  async function chooseChip(chip: SeedChip, option: string) {
    setAnswers((prev) => ({ ...prev, [chip.id]: option }));
    setActiveChip(null);
    await send(`${chip.label} ${option}`);
  }

  function shareInvite() {
    if (!room) return;
    const link = `${window.location.origin}/j/${room.invite_code}`;
    navigator.clipboard
      .writeText(link)
      .then(() => toast.success("Invite link copied"))
      .catch(() => toast.error("Couldn't copy — the link is " + link));
  }

  if (error) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
        <h1 className="font-display text-2xl font-bold text-ink">Hmm, that didn't work</h1>
        <p className="mt-2 text-muted-foreground">{error}</p>
        <Button variant="outline" className="mt-6" onClick={() => navigate("/")}>
          Start a new huddle
        </Button>
      </main>
    );
  }

  if (!room) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <Loader2 className="size-6 animate-spin text-plum" />
      </main>
    );
  }

  const chips = room.template.seed_chips;
  const openChip = chips.find((c) => c.id === activeChip);

  return (
    <div className="mx-auto flex h-dvh max-w-lg flex-col bg-paper sm:border-x sm:border-border">
      <header className="shrink-0 border-b border-border bg-paper/90 px-4 pb-3 pt-4 backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate font-display text-2xl font-bold text-ink">{room.topic}</h1>
            <p className="mt-0.5 font-mono text-xs text-plum">deciding · {members.length} here</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <div className="flex">
              {members.slice(0, 4).map((m, i) => (
                <Avatar key={m.id} name={m.display_name} size={30} className={i > 0 ? "-ml-2" : ""} />
              ))}
              {members.length > 4 && (
                <span className="-ml-2 flex size-[30px] items-center justify-center rounded-full bg-muted text-xs font-medium text-plum ring-2 ring-background">
                  +{members.length - 4}
                </span>
              )}
            </div>
            <Button variant="ghost" size="icon" onClick={shareInvite} aria-label="Copy invite link">
              <Share2 />
            </Button>
          </div>
        </div>

        {chips.length > 0 && (
          <div className="mt-3">
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {chips.map((chip) => {
                const answer = answers[chip.id];
                return (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => setActiveChip((cur) => (cur === chip.id ? null : chip.id))}
                    className={cn(
                      "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
                      answer
                        ? "border-plum bg-plum text-white"
                        : "border-plum/40 text-plum hover:bg-plum/5",
                    )}
                  >
                    {answer && <Check className="size-3.5" />}
                    {answer ? `${chip.label} ${answer}` : chip.label}
                  </button>
                );
              })}
            </div>
            <AnimatePresence>
              {openChip?.options && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-wrap gap-2 pt-2">
                    {openChip.options.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => chooseChip(openChip, opt)}
                        className="rounded-full border border-border bg-card px-3 py-1.5 text-sm text-ink transition-colors hover:bg-accent"
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <EmptyChat />
        ) : (
          <div className="space-y-2.5">
            {messages.map((msg, i) => {
              const mine = msg.member_id === meId;
              const showName = !mine && (i === 0 || messages[i - 1].member_id !== msg.member_id);
              return (
                <MessageBubble key={msg.id} message={msg} mine={mine} showName={showName} />
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <footer className="shrink-0 border-t border-border bg-paper">
        {isAdmin && (
          <div className="px-4 pt-3">
            <Button
              variant="outline"
              className="w-full justify-between"
              disabled
              title="Suggestions arrive in the next milestone"
            >
              <span className="flex items-center gap-2">
                <Sparkles className="size-4" /> Generate suggestions
              </span>
              <span className="font-mono text-xs text-muted-foreground">soon</span>
            </Button>
          </div>
        )}
        <form
          className="flex items-center gap-2 px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send(draft);
            setDraft("");
          }}
        >
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Message the huddle…"
            maxLength={2000}
          />
          <Button type="submit" size="icon" disabled={draft.trim().length === 0} aria-label="Send">
            <Send />
          </Button>
        </form>
      </footer>
    </div>
  );
}

function MessageBubble({
  message,
  mine,
  showName,
}: {
  message: Message;
  mine: boolean;
  showName: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn("flex items-end gap-2", mine ? "justify-end" : "justify-start")}
    >
      {!mine && (
        <div className="w-7 shrink-0">
          {showName && <Avatar name={message.author_name} size={28} />}
        </div>
      )}
      <div className={cn("max-w-[78%]", mine && "flex flex-col items-end")}>
        {showName && (
          <span className="mb-0.5 ml-1 text-xs font-medium text-plum">{message.author_name}</span>
        )}
        <div
          className={cn(
            "rounded-2xl px-3.5 py-2 text-[15px] leading-snug",
            mine
              ? "rounded-br-md bg-plum text-white"
              : "rounded-bl-md border border-border bg-card text-ink",
          )}
        >
          {message.content}
        </div>
      </div>
    </motion.div>
  );
}

function EmptyChat() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted text-plum">
        <Sparkles className="size-6" />
      </div>
      <p className="mt-4 font-display text-lg font-semibold text-ink">No messages yet</p>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">
        Be the first to suggest something — or tap a chip above to set a constraint.
      </p>
    </div>
  );
}
