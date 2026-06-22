import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Archive,
  Check,
  Loader2,
  MoreVertical,
  Send,
  Share2,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { Avatar } from "@/components/Avatar";
import { DecisionCelebration } from "@/components/DecisionCelebration";
import { ManagePeople } from "@/components/ManagePeople";
import { MissionsBoard } from "@/components/MissionsBoard";
import { SuggestionDeck } from "@/components/SuggestionDeck";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";
import { setActiveToken, tokenForRoom } from "@/lib/session";
import { useRoomSocket } from "@/lib/useRoomSocket";
import { cn } from "@/lib/utils";
import type {
  Member,
  Message,
  Mission,
  RoomEvent,
  RoomState,
  RoomStatus,
  SeedChip,
  Suggestion,
  SuggestionSet,
  Template,
  VoteResult,
} from "@/types/api";

function applyVotes(set: SuggestionSet, result: VoteResult): SuggestionSet {
  return {
    ...set,
    suggestions: set.suggestions.map((s) => ({
      ...s,
      vote_count: result.tallies[s.id] ?? s.vote_count,
      backer_ids: result.backers[s.id] ?? s.backer_ids,
    })),
  };
}

export default function Room() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [room, setRoom] = useState<RoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentSet, setCurrentSet] = useState<SuggestionSet | null>(null);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [status, setStatus] = useState<RoomStatus>("deciding");
  const [decidedId, setDecidedId] = useState<string | null>(null);
  const [generationsLeft, setGenerationsLeft] = useState(3);
  const [draft, setDraft] = useState("");
  const [refine, setRefine] = useState("");
  const [activeChip, setActiveChip] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [celebration, setCelebration] = useState<Suggestion | null>(null);
  const [closedAt, setClosedAt] = useState<string | null>(null);
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [pendingMembers, setPendingMembers] = useState<Member[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const meId = room?.me?.id;
  const isAdmin = room?.me?.role === "admin";
  const bottomRef = useRef<HTMLDivElement>(null);

  const hydrate = useCallback((data: RoomState) => {
    setRoom(data);
    setMembers(data.members);
    setMessages(data.messages);
    setCurrentSet(data.current_set);
    setMissions(data.missions);
    setStatus(data.status);
    setDecidedId(data.decided_suggestion_id);
    setGenerationsLeft(data.generations_left);
    setClosedAt(data.closed_at);
    setRequiresApproval(data.requires_approval);
    setPendingMembers(data.pending_members);
  }, []);

  useEffect(() => {
    if (!id) return;
    const stored = tokenForRoom(id);
    if (stored) setActiveToken(stored);
    let active = true;
    api
      .getRoom(id)
      .then((data) => {
        if (!active) return;
        if (!data.me) {
          navigate(`/j/${data.invite_code}`, { replace: true });
          return;
        }
        hydrate(data);
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
  }, [id, navigate, hydrate]);

  const addMessage = useCallback((msg: Message) => {
    setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
  }, []);

  const handleEvent = useCallback(
    (event: RoomEvent) => {
      switch (event.type) {
        case "message_created":
          addMessage(event.payload as Message);
          break;
        case "member_joined": {
          const member = event.payload as Member;
          setMembers((prev) => (prev.some((m) => m.id === member.id) ? prev : [...prev, member]));
          setPendingMembers((prev) => prev.filter((m) => m.id !== member.id));
          toast(`${member.display_name} joined`);
          break;
        }
        case "member_pending": {
          const member = event.payload as Member;
          setPendingMembers((prev) =>
            prev.some((m) => m.id === member.id) ? prev : [...prev, member],
          );
          toast(`${member.display_name} wants to join`);
          break;
        }
        case "member_removed": {
          const { member_id } = event.payload as { member_id: string };
          if (member_id === meId) {
            toast("You were removed from this huddle");
            navigate("/", { replace: true });
            break;
          }
          setMembers((prev) => prev.filter((m) => m.id !== member_id));
          setPendingMembers((prev) => prev.filter((m) => m.id !== member_id));
          break;
        }
        case "member_approved": {
          const member = event.payload as Member;
          if (member.id === meId && id) {
            api.getRoom(id).then(hydrate).catch(() => undefined);
          }
          break;
        }
        case "generation_started": {
          const p = event.payload as { set_id: string; generation_number: number };
          setCurrentSet({ id: p.set_id, generation_number: p.generation_number, status: "pending", suggestions: [] });
          break;
        }
        case "suggestions_ready": {
          const set = event.payload as SuggestionSet;
          setCurrentSet(set);
          if (set.status === "failed") toast.error("Generation failed — try again.");
          break;
        }
        case "vote_updated": {
          const result = event.payload as VoteResult;
          setCurrentSet((prev) => (prev && prev.id === result.set_id ? applyVotes(prev, result) : prev));
          break;
        }
        case "decision_locked": {
          const p = event.payload as { decided_suggestion_id: string; suggestion: Suggestion };
          setStatus("decided");
          setDecidedId(p.decided_suggestion_id);
          setCelebration(p.suggestion);
          break;
        }
        case "missions_ready": {
          const p = event.payload as { status: RoomStatus; missions: Mission[] };
          setMissions(p.missions);
          setStatus(p.status);
          break;
        }
        case "mission_updated": {
          const mission = event.payload as Mission;
          setMissions((prev) => prev.map((m) => (m.id === mission.id ? mission : m)));
          break;
        }
        case "template_ready": {
          const template = event.payload as Template;
          setRoom((prev) => (prev ? { ...prev, template } : prev));
          break;
        }
        case "room_closed": {
          const p = event.payload as { closed_at: string };
          setClosedAt(p.closed_at);
          break;
        }
        case "room_deleted": {
          toast("This huddle was deleted by the host");
          navigate("/", { replace: true });
          break;
        }
      }
    },
    [addMessage, navigate, meId, id, hydrate],
  );

  useRoomSocket(room ? id : undefined, handleEvent);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Robustness: if a custom room is still being designed, poll until the template lands (in case
  // the template_ready socket event is missed).
  useEffect(() => {
    if (!id || !room) return;
    const stillDesigning = room.template.is_custom && room.template.seed_chips.length === 0;
    if (!stillDesigning) return;
    const timer = setInterval(async () => {
      try {
        const data = await api.getRoom(id);
        if (!data.template.is_custom || data.template.seed_chips.length > 0) {
          setRoom((prev) => (prev ? { ...prev, template: data.template } : prev));
        }
      } catch {
        // ignore — next tick retries
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [id, room]);

  // Robustness: if we're waiting for approval, poll until the host lets us in (or denies us).
  useEffect(() => {
    if (!id || !room || room.me?.status !== "pending") return;
    const timer = setInterval(async () => {
      try {
        const data = await api.getRoom(id);
        if (data.me?.status === "active") hydrate(data);
        else if (!data.me) navigate("/", { replace: true });
      } catch {
        // ignore — next tick retries
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [id, room, hydrate, navigate]);

  async function send(content: string) {
    const text = content.trim();
    if (!id || text.length === 0) return;
    try {
      addMessage(await api.postMessage(id, text));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Message didn't send. Try again.");
    }
  }

  async function chooseChip(chip: SeedChip, option: string) {
    setAnswers((prev) => ({ ...prev, [chip.id]: option }));
    setActiveChip(null);
    await send(`${chip.label} ${option}`);
  }

  async function handleGenerate() {
    if (!id || busy) return;
    setBusy(true);
    const previous = currentSet;
    setCurrentSet({ id: "pending", generation_number: (currentSet?.generation_number ?? 0) + 1, status: "pending", suggestions: [] });
    try {
      const res = await api.generate(id, refine);
      setGenerationsLeft(res.generations_left);
      setRefine("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't generate. Try again.");
      setCurrentSet(previous);
    } finally {
      setBusy(false);
    }
  }

  async function handleVote(suggestionId: string) {
    try {
      const result = await api.vote(suggestionId);
      setCurrentSet((prev) => (prev && prev.id === result.set_id ? applyVotes(prev, result) : prev));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Vote didn't register. Try again.");
    }
  }

  async function handleLock(suggestionId: string) {
    if (!id) return;
    try {
      await api.decide(id, suggestionId);
      // The decision_locked event drives the celebration for everyone, including us.
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't lock the decision. Try again.");
    }
  }

  function updateMission(m: Mission) {
    setMissions((prev) => prev.map((x) => (x.id === m.id ? m : x)));
  }

  async function handleClaim(missionId: string) {
    try {
      updateMission(await api.claimMission(missionId));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't update that mission.");
    }
  }

  async function handleComplete(missionId: string) {
    try {
      updateMission(await api.completeMission(missionId));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't update that mission.");
    }
  }

  async function handleAssignRandom() {
    if (!id) return;
    try {
      setMissions(await api.assignRandom(id));
      toast.success("Leftovers assigned");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't assign missions.");
    }
  }

  async function handleClose() {
    if (!id) return;
    setMenuOpen(false);
    try {
      const updated = await api.closeRoom(id);
      setClosedAt(updated.closed_at);
      toast.success("Huddle closed");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't close the huddle.");
    }
  }

  async function handleDelete() {
    if (!id) return;
    setDeleting(true);
    try {
      await api.deleteRoom(id);
      toast.success("Huddle deleted");
      navigate("/", { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't delete the huddle.");
      setDeleting(false);
    }
  }

  async function handleToggleApproval(value: boolean) {
    if (!id) return;
    try {
      const data = await api.setApproval(id, value);
      setRequiresApproval(data.requires_approval);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't update the setting.");
    }
  }

  async function handleRotate() {
    if (!id) return;
    try {
      const data = await api.rotateInvite(id);
      setRoom((prev) => (prev ? { ...prev, invite_code: data.invite_code } : prev));
      toast.success("Invite link reset");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't reset the link.");
    }
  }

  async function handleApprove(memberId: string) {
    if (!id) return;
    try {
      const data = await api.approveMember(id, memberId);
      setMembers(data.members);
      setPendingMembers(data.pending_members);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't approve them.");
    }
  }

  async function handleRemovePerson(memberId: string) {
    if (!id) return;
    try {
      const data = await api.removeMember(id, memberId);
      setMembers(data.members);
      setPendingMembers(data.pending_members);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't remove them.");
    }
  }

  function shareInvite() {
    if (!room) return;
    const link = `${window.location.origin}/j/${room.invite_code}`;
    navigator.clipboard
      .writeText(link)
      .then(() => toast.success("Invite link copied"))
      .catch(() => toast.error(`Couldn't copy — the link is ${link}`));
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

  if (room.template.is_custom && room.template.seed_chips.length === 0) {
    return (
      <div className="mx-auto flex h-dvh max-w-lg flex-col items-center justify-center bg-paper px-8 text-center sm:border-x sm:border-border">
        <div className="flex items-center justify-center gap-1.5">
          {[0, 1, 2, 3].map((i) => (
            <motion.span
              key={i}
              className="size-2.5 rounded-full bg-marigold"
              animate={{ opacity: [0.3, 1, 0.3], y: [0, -4, 0] }}
              transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.15 }}
            />
          ))}
        </div>
        <h1 className="mt-5 font-display text-2xl font-bold text-ink">Designing your room…</h1>
        <p className="mt-2 max-w-xs text-muted-foreground">
          Setting up the questions and the game plan for{" "}
          <span className="text-ink">"{room.topic}"</span>.
        </p>
      </div>
    );
  }

  if (room.me?.status === "pending") {
    return (
      <div className="mx-auto flex h-dvh max-w-lg flex-col items-center justify-center bg-paper px-8 text-center sm:border-x sm:border-border">
        <div className="flex items-center justify-center gap-1.5">
          {[0, 1, 2, 3].map((i) => (
            <motion.span
              key={i}
              className="size-2.5 rounded-full bg-marigold"
              animate={{ opacity: [0.3, 1, 0.3], y: [0, -4, 0] }}
              transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.15 }}
            />
          ))}
        </div>
        <h1 className="mt-5 font-display text-2xl font-bold text-ink">Waiting to be let in…</h1>
        <p className="mt-2 max-w-xs text-muted-foreground">
          The host needs to approve you before you can join{" "}
          <span className="text-ink">"{room.topic}"</span>.
        </p>
      </div>
    );
  }

  const chips = room.template.seed_chips;
  const openChip = chips.find((c) => c.id === activeChip);
  const postDecision = status === "decided" || status === "executing";
  const generating = currentSet?.status === "pending";
  const winner = currentSet?.suggestions.find((s) => s.id === decidedId) ?? null;
  const closed = Boolean(closedAt);
  const canGenerate = isAdmin && status === "deciding" && !generating && generationsLeft > 0 && !closed;
  const hasSet = Boolean(currentSet);

  return (
    <div className="mx-auto flex h-dvh max-w-lg flex-col bg-paper sm:border-x sm:border-border">
      <header className="shrink-0 border-b border-border bg-paper/90 px-4 pb-3 pt-4 backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate font-display text-2xl font-bold text-ink">{room.topic}</h1>
            <p className="mt-0.5 font-mono text-xs text-plum">
              {postDecision ? "decided" : "deciding"} · {members.length} here
            </p>
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
            {isAdmin && (
              <div className="relative">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setMenuOpen((o) => !o)}
                  aria-label="Room options"
                >
                  <MoreVertical />
                </Button>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                    <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-lg">
                      <button
                        onClick={() => {
                          setMenuOpen(false);
                          setManageOpen(true);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-accent"
                      >
                        <Users className="size-4 text-plum" /> Manage people
                        {pendingMembers.length > 0 && (
                          <span className="ml-auto rounded-full bg-marigold px-1.5 text-xs font-medium text-ink">
                            {pendingMembers.length}
                          </span>
                        )}
                      </button>
                      {!closed && (
                        <button
                          onClick={handleClose}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-accent"
                        >
                          <Archive className="size-4 text-plum" /> Close huddle
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setMenuOpen(false);
                          setConfirmingDelete(true);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-coral hover:bg-accent"
                      >
                        <Trash2 className="size-4" /> Delete huddle
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {chips.length > 0 && !postDecision && (
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
                      answer ? "border-plum bg-plum text-white" : "border-plum/40 text-plum hover:bg-plum/5",
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
        {closed && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3.5 py-2.5">
            <Archive className="size-4 shrink-0 text-plum" />
            <p className="text-sm text-ink">This huddle is closed — it's read-only now.</p>
          </div>
        )}

        {postDecision && winner && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-marigold bg-marigold/10 px-3.5 py-2.5">
            <Check className="size-4 shrink-0 text-[#9a6212]" />
            <p className="text-sm text-ink">
              Decided: <span className="font-medium">{winner.title}</span>
            </p>
          </div>
        )}

        {postDecision && (
          <MissionsBoard
            missions={missions}
            meId={meId}
            readOnly={closed}
            onClaim={handleClaim}
            onComplete={handleComplete}
            onAssignRandom={handleAssignRandom}
          />
        )}

        {messages.length === 0 && !hasSet && !postDecision ? (
          <EmptyChat />
        ) : (
          <div className={postDecision ? "mt-7" : undefined}>
            {postDecision && (
              <div className="mb-2.5 flex items-center gap-2">
                <span className="font-mono text-xs uppercase tracking-wide text-plum">Chat</span>
                <span className="h-px flex-1 bg-border" />
              </div>
            )}
            <div className="space-y-2.5">
              {messages.map((msg, i) => {
                const mine = msg.member_id === meId;
                const showName = !mine && (i === 0 || messages[i - 1].member_id !== msg.member_id);
                return <MessageBubble key={msg.id} message={msg} mine={mine} showName={showName} />;
              })}
            </div>
          </div>
        )}

        {status === "deciding" && (
          <SuggestionDeck
            set={currentSet}
            members={members}
            meId={meId}
            isAdmin={isAdmin}
            decided={false}
            decidedId={decidedId}
            readOnly={closed}
            onVote={handleVote}
            onLock={handleLock}
          />
        )}

        <div ref={bottomRef} />
      </div>

      {!closed && (
      <footer className="shrink-0 border-t border-border bg-paper">
        {isAdmin && status === "deciding" && (
          <div className="space-y-2 px-4 pt-3">
            {hasSet && generationsLeft > 0 && !generating && (
              <Input
                value={refine}
                onChange={(e) => setRefine(e.target.value)}
                placeholder="Refine before regenerating (optional)…"
                maxLength={500}
              />
            )}
            <Button
              className="w-full justify-between"
              variant={hasSet ? "outline" : "default"}
              disabled={!canGenerate}
              onClick={handleGenerate}
            >
              <span className="flex items-center gap-2">
                {generating ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                {generating ? "Generating…" : hasSet ? "Regenerate" : "Generate suggestions"}
              </span>
              <span className="font-mono text-xs opacity-80">
                {generationsLeft > 0 ? `${generationsLeft} of 3 left` : "no generations left"}
              </span>
            </Button>
            {hasSet && !generating && (
              <p className="pb-0.5 text-center text-xs text-muted-foreground">
                Tap <span className="font-medium text-plum">Lock</span> on a card to settle it.
              </p>
            )}
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
            placeholder={postDecision ? "Chat about the plan…" : "Message the huddle…"}
            maxLength={2000}
          />
          <Button type="submit" size="icon" disabled={draft.trim().length === 0} aria-label="Send">
            <Send />
          </Button>
        </form>
      </footer>
      )}

      <AnimatePresence>
        {celebration && (
          <DecisionCelebration
            suggestion={celebration}
            members={members}
            onDone={() => setCelebration(null)}
          />
        )}
      </AnimatePresence>

      {confirmingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-6"
          onClick={() => !deleting && setConfirmingDelete(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-display text-xl font-bold text-ink">Delete this huddle?</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              This permanently removes the chat, decision, and missions for everyone. It can't be
              undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmingDelete(false)} disabled={deleting}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                {deleting ? (
                  <>
                    <Loader2 className="animate-spin" /> Deleting…
                  </>
                ) : (
                  <>
                    <Trash2 /> Delete
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {manageOpen && (
        <ManagePeople
          requiresApproval={requiresApproval}
          members={members}
          pendingMembers={pendingMembers}
          meId={meId}
          onToggleApproval={handleToggleApproval}
          onRotate={handleRotate}
          onApprove={handleApprove}
          onRemove={handleRemovePerson}
          onClose={() => setManageOpen(false)}
        />
      )}
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
      {!mine && <div className="w-7 shrink-0">{showName && <Avatar name={message.author_name} size={28} />}</div>}
      <div className={cn("max-w-[78%]", mine && "flex flex-col items-end")}>
        {showName && <span className="mb-0.5 ml-1 text-xs font-medium text-plum">{message.author_name}</span>}
        <div
          className={cn(
            "rounded-2xl px-3.5 py-2 text-[15px] leading-snug",
            mine ? "rounded-br-md bg-plum text-white" : "rounded-bl-md border border-border bg-card text-ink",
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
