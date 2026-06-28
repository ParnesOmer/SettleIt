import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Archive,
  Check,
  Lightbulb,
  ListChecks,
  Loader2,
  MessageCircle,
  MoreVertical,
  Plus,
  Send,
  Share2,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { AddChipDialog } from "@/components/AddChipDialog";
import { AddMissionDialog } from "@/components/AddMissionDialog";
import { Avatar } from "@/components/Avatar";
import { DecisionCelebration } from "@/components/DecisionCelebration";
import { LanguageToggle } from "@/components/LanguageToggle";
import { ManagePeople } from "@/components/ManagePeople";
import { MissionsBoard } from "@/components/MissionsBoard";
import { SuggestionDeck } from "@/components/SuggestionDeck";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";
import { localizeChip } from "@/lib/builtinChips";
import { useT } from "@/lib/i18n";
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

type Tab = "chat" | "ideas" | "missions";

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
  const { t, lang } = useT();

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
  const [extraChips, setExtraChips] = useState<SeedChip[]>([]);
  const [chipCustom, setChipCustom] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [addChipOpen, setAddChipOpen] = useState(false);
  const [addMissionOpen, setAddMissionOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Tab navigation
  const [activeTab, setActiveTab] = useState<Tab>("chat");
  const [ideasDot, setIdeasDot] = useState(false);
  const [missionsDot, setMissionsDot] = useState(false);
  const activeTabRef = useRef<Tab>("chat");

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  function switchTab(tab: Tab) {
    setActiveTab(tab);
    activeTabRef.current = tab;
    if (tab === "ideas") setIdeasDot(false);
    if (tab === "missions") setMissionsDot(false);
  }

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
    setExtraChips(data.extra_chips);
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
        // If room is already decided on load, go straight to missions
        if (data.status === "decided" || data.status === "executing") {
          setActiveTab("missions");
          activeTabRef.current = "missions";
        }
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError && err.status === 404 ? t("err.roomGone") : t("err.roomLoad"),
        );
      });
    return () => {
      active = false;
    };
  }, [id, navigate, hydrate, t]);

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
          toast(`${member.display_name} ${t("toast.joinedSuffix")}`);
          break;
        }
        case "member_pending": {
          const member = event.payload as Member;
          setPendingMembers((prev) =>
            prev.some((m) => m.id === member.id) ? prev : [...prev, member],
          );
          toast(`${member.display_name} ${t("toast.wantsToJoin")}`);
          break;
        }
        case "member_removed": {
          const { member_id } = event.payload as { member_id: string };
          if (member_id === meId) {
            toast(t("toast.removed"));
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
        case "chips_updated": {
          const p = event.payload as { extra_chips: SeedChip[] };
          setExtraChips(p.extra_chips);
          break;
        }
        case "generation_started": {
          const p = event.payload as { set_id: string; generation_number: number };
          setCurrentSet({ id: p.set_id, generation_number: p.generation_number, status: "pending", suggestions: [] });
          // Show badge if user is watching chat
          if (activeTabRef.current !== "ideas") setIdeasDot(true);
          break;
        }
        case "suggestions_ready": {
          const set = event.payload as SuggestionSet;
          setCurrentSet(set);
          if (set.status === "failed") {
            toast.error("Generation failed — try again.");
          } else if (activeTabRef.current !== "ideas") {
            setIdeasDot(true);
          }
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
          // Switch to missions — when the celebration is dismissed they'll land there
          setActiveTab("missions");
          activeTabRef.current = "missions";
          setMissionsDot(false);
          break;
        }
        case "missions_ready": {
          const p = event.payload as { status: RoomStatus; missions: Mission[] };
          setMissions(p.missions);
          setStatus(p.status);
          if (activeTabRef.current !== "missions") setMissionsDot(true);
          break;
        }
        case "mission_updated": {
          const mission = event.payload as Mission;
          setMissions((prev) => prev.map((m) => (m.id === mission.id ? mission : m)));
          break;
        }
        case "template_ready": {
          const payload = event.payload as Template & { welcome_blurb?: string };
          setRoom((prev) =>
            prev
              ? {
                  ...prev,
                  template: payload,
                  welcome_blurb: payload.welcome_blurb ?? prev.welcome_blurb,
                }
              : prev,
          );
          break;
        }
        case "room_closed": {
          const p = event.payload as { closed_at: string };
          setClosedAt(p.closed_at);
          break;
        }
        case "room_deleted": {
          toast(t("toast.deletedByHost"));
          navigate("/", { replace: true });
          break;
        }
      }
    },
    [addMessage, navigate, meId, id, hydrate, t],
  );

  useRoomSocket(room ? id : undefined, handleEvent);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

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

  async function send(content: string, kind = "chat") {
    const text = content.trim();
    if (!id || text.length === 0) return;
    try {
      addMessage(await api.postMessage(id, text, kind));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Message didn't send. Try again.");
    }
  }

  async function chooseChip(chip: SeedChip, option: string) {
    const text = option.trim();
    if (!text) return;
    setAnswers((prev) => ({ ...prev, [chip.id]: text }));
    setActiveChip(null);
    setChipCustom("");
    await send(`${localizeChip(chip, lang).label}: ${text}`, "chip_response");
  }

  async function handleGenerate() {
    if (!id || busy) return;
    setBusy(true);
    const previous = currentSet;
    setCurrentSet({ id: "pending", generation_number: (currentSet?.generation_number ?? 0) + 1, status: "pending", suggestions: [] });
    // Switch to ideas tab so the user watches the generation
    switchTab("ideas");
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
      toast.success(t("toast.leftoversAssigned"));
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
      toast.success(t("toast.closed"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't close the huddle.");
    }
  }

  async function handleDelete() {
    if (!id) return;
    setDeleting(true);
    try {
      await api.deleteRoom(id);
      toast.success(t("toast.deleted"));
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
      toast.success(t("toast.linkReset"));
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

  async function handleAddChip(label: string, options: string[]) {
    if (!id) return;
    try {
      setExtraChips((await api.addChip(id, label, options)).extra_chips);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't add the question.");
    }
  }

  async function handleRemoveChip(chipId: string) {
    if (!id) return;
    try {
      setExtraChips((await api.removeChip(id, chipId)).extra_chips);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't remove the question.");
    }
  }

  async function handleAddMission(title: string, description: string) {
    if (!id) return;
    try {
      setMissions((await api.addMission(id, title, description)).missions);
      setAddMissionOpen(false);
      toast.success(t("mis.added"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't add the mission.");
    }
  }

  async function handleSuggestMissions() {
    if (!id) return;
    try {
      await api.suggestMissions(id);
      toast(t("mis.findingMore"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't generate missions.");
    }
  }

  function shareInvite() {
    if (!room) return;
    const link = `${window.location.origin}/j/${room.invite_code}`;
    navigator.clipboard
      .writeText(link)
      .then(() => toast.success(t("toast.linkCopied")))
      .catch(() => toast.error(`Couldn't copy — the link is ${link}`));
  }

  if (error) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
        <h1 className="font-display text-2xl font-bold text-ink">{t("err.badTitle")}</h1>
        <p className="mt-2 text-muted-foreground">{error}</p>
        <Button variant="outline" className="mt-6" onClick={() => navigate("/")}>
          {t("join.startNew")}
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
        <h1 className="mt-5 font-display text-2xl font-bold text-ink">{t("room.designingTitle")}</h1>
        <p className="mt-2 max-w-xs text-muted-foreground">
          {t("room.designingBody", { topic: room.topic })}
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
        <h1 className="mt-5 font-display text-2xl font-bold text-ink">{t("room.pendingTitle")}</h1>
        <p className="mt-2 max-w-xs text-muted-foreground">
          {t("room.pendingBody", { topic: room.topic })}
        </p>
      </div>
    );
  }

  const chips = [...room.template.seed_chips, ...extraChips];
  const unansweredChips = chips.filter((c) => !answers[c.id]);
  const openChip = chips.find((c) => c.id === activeChip);
  const openChipOptions = openChip ? localizeChip(openChip, lang).options : [];
  const postDecision = status === "decided" || status === "executing";
  const generating = currentSet?.status === "pending";
  const winner = currentSet?.suggestions.find((s) => s.id === decidedId) ?? null;
  const closed = Boolean(closedAt);
  const canGenerate = isAdmin && status === "deciding" && !generating && generationsLeft > 0 && !closed;
  const hasSet = Boolean(currentSet);

  // Chip hint: shown until the user answers their first chip
  const showChipHint = !postDecision && unansweredChips.length > 0 && Object.keys(answers).length === 0;

  // Vote progress
  const voterCount = new Set(
    (currentSet?.suggestions ?? []).flatMap((s) => s.backer_ids.map(String)),
  ).size;
  const showVoteProgress = currentSet?.status === "complete" && !postDecision && members.length > 1;

  // Missions progress badge
  const doneMissions = missions.filter((m) => m.status === "done").length;

  return (
    <div className="mx-auto flex h-dvh max-w-lg flex-col bg-paper sm:border-x sm:border-border">
      {/* ── HEADER ── */}
      <header className="shrink-0 border-b border-border bg-paper/90 px-4 pb-3 pt-4 backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate font-display text-2xl font-bold text-ink">{room.topic}</h1>
            <p className="mt-0.5 font-mono text-xs text-plum">
              {postDecision ? t("room.decided") : t("room.deciding")} ·{" "}
              {t("room.here", { n: members.length })}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <div className="flex">
              {members.slice(0, 4).map((m, i) => (
                <Avatar key={m.id} name={m.display_name} size={30} className={i > 0 ? "-ms-2" : ""} />
              ))}
              {members.length > 4 && (
                <span className="-ms-2 flex size-[30px] items-center justify-center rounded-full bg-muted text-xs font-medium text-plum ring-2 ring-background">
                  +{members.length - 4}
                </span>
              )}
            </div>
            <LanguageToggle iconOnly />
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
                        onClick={() => { setMenuOpen(false); setManageOpen(true); }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-start text-sm text-ink hover:bg-accent"
                      >
                        <Users className="size-4 text-plum" /> {t("menu.manage")}
                        {pendingMembers.length > 0 && (
                          <span className="ml-auto rounded-full bg-marigold px-1.5 text-xs font-medium text-ink">
                            {pendingMembers.length}
                          </span>
                        )}
                      </button>
                      {!closed && (
                        <button
                          onClick={handleClose}
                          className="flex w-full items-center gap-2 px-3 py-2 text-start text-sm text-ink hover:bg-accent"
                        >
                          <Archive className="size-4 text-plum" /> {t("menu.close")}
                        </button>
                      )}
                      <button
                        onClick={() => { setMenuOpen(false); setConfirmingDelete(true); }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-start text-sm text-coral hover:bg-accent"
                      >
                        <Trash2 className="size-4" /> {t("menu.delete")}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Chip row */}
        {!postDecision && (unansweredChips.length > 0 || isAdmin) && (
          <div className="mt-3">
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {unansweredChips.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => {
                    setActiveChip((cur) => (cur === chip.id ? null : chip.id));
                    setChipCustom("");
                  }}
                  className="flex shrink-0 items-center gap-1.5 rounded-full border border-plum/40 px-3 py-1.5 text-sm text-plum transition-colors hover:bg-plum/5"
                >
                  {localizeChip(chip, lang).label}
                </button>
              ))}
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setAddChipOpen(true)}
                  className="flex shrink-0 items-center gap-1 rounded-full border border-dashed border-plum/40 px-3 py-1.5 text-sm text-plum hover:bg-plum/5"
                >
                  <Plus className="size-3.5" /> {t("room.add")}
                </button>
              )}
            </div>

            {/* Chip onboarding hint */}
            <AnimatePresence>
              {showChipHint && !activeChip && (
                <motion.p
                  key="chip-hint"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="mt-1.5 text-center text-xs text-muted-foreground"
                >
                  {t("room.chipHint")}
                </motion.p>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {openChip && openChipOptions.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-wrap gap-2 pt-2">
                    {openChipOptions.map((opt) => (
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
                  <form
                    className="mt-2 flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void chooseChip(openChip, chipCustom);
                    }}
                  >
                    <Input
                      value={chipCustom}
                      onChange={(e) => setChipCustom(e.target.value)}
                      placeholder={t("room.chipCustomPlaceholder")}
                      maxLength={200}
                      className="h-8 text-sm"
                    />
                    <Button
                      type="submit"
                      size="sm"
                      variant="outline"
                      disabled={chipCustom.trim().length === 0}
                      className="shrink-0"
                    >
                      <Send className="size-3.5" />
                    </Button>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </header>

      {/* ── TAB PANELS ── */}
      <div className="flex-1 overflow-hidden">

        {/* CHAT PANEL */}
        <div className={cn("h-full overflow-y-auto px-4 py-4", activeTab !== "chat" && "hidden")}>
          {closed && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3.5 py-2.5">
              <Archive className="size-4 shrink-0 text-plum" />
              <p className="text-sm text-ink">{t("room.closedBanner")}</p>
            </div>
          )}

          {messages.filter((m) => m.kind !== "chip_response").length === 0 ? (
            <EmptyChat blurb={room.welcome_blurb} />
          ) : (
            <div className="space-y-2.5">
              {messages.filter((m) => m.kind !== "chip_response").map((msg, i, arr) => {
                const mine = msg.member_id === meId;
                const showName = !mine && (i === 0 || arr[i - 1].member_id !== msg.member_id);
                return <MessageBubble key={msg.id} message={msg} mine={mine} showName={showName} />;
              })}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* IDEAS PANEL */}
        <div className={cn("h-full overflow-y-auto px-4 py-4", activeTab !== "ideas" && "hidden")}>
          {/* Generate controls (admin only, deciding phase) */}
          {!closed && isAdmin && status === "deciding" && (
            <div className="mb-4 space-y-2">
              {hasSet && generationsLeft > 0 && !generating && (
                <Input
                  value={refine}
                  onChange={(e) => setRefine(e.target.value)}
                  placeholder={t("room.refinePlaceholder")}
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
                  {generating ? t("room.generating") : hasSet ? t("room.regenerate") : t("room.generate")}
                </span>
                <span className="font-mono text-xs opacity-80">
                  {generationsLeft > 0 ? t("room.left", { n: generationsLeft }) : t("room.noneLeft")}
                </span>
              </Button>
              {hasSet && !generating && (
                <p className="pb-0.5 text-center text-xs text-muted-foreground">{t("room.lockHint")}</p>
              )}
            </div>
          )}

          {/* Vote progress indicator */}
          {showVoteProgress && (
            <div className="mb-3 flex items-center gap-2 rounded-lg bg-muted/60 px-3.5 py-2">
              <div className="flex -space-x-1.5">
                {members.slice(0, 5).map((m) => (
                  <Avatar key={m.id} name={m.display_name} size={20} />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {t("room.voteProgress", { n: voterCount, total: members.length })}
              </p>
            </div>
          )}

          {/* Decided banner */}
          {postDecision && winner && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-marigold bg-marigold/10 px-3.5 py-2.5">
              <Check className="size-4 shrink-0 text-[#9a6212]" />
              <p className="text-sm text-ink">{t("room.decidedBanner", { title: winner.title })}</p>
            </div>
          )}

          {/* Suggestion cards */}
          {hasSet ? (
            <SuggestionDeck
              set={currentSet}
              members={members}
              meId={meId}
              isAdmin={isAdmin}
              decided={postDecision}
              decidedId={decidedId}
              readOnly={closed}
              onVote={handleVote}
              onLock={handleLock}
            />
          ) : !isAdmin && status === "deciding" ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2 text-center">
              <Lightbulb className="size-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">{t("room.waitingIdeas")}</p>
            </div>
          ) : null}
        </div>

        {/* MISSIONS PANEL */}
        <div className={cn("h-full overflow-y-auto px-4 py-4", activeTab !== "missions" && "hidden")}>
          <MissionsBoard
            missions={missions}
            meId={meId}
            isAdmin={isAdmin}
            readOnly={closed}
            onClaim={handleClaim}
            onComplete={handleComplete}
            onAssignRandom={handleAssignRandom}
            onAddMission={() => setAddMissionOpen(true)}
            onSuggestMore={handleSuggestMissions}
          />
        </div>
      </div>

      {/* ── CHAT INPUT (only on chat tab) ── */}
      {!closed && activeTab === "chat" && (
        <form
          className="shrink-0 flex items-center gap-2 border-t border-border bg-paper px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send(draft);
            setDraft("");
          }}
        >
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={postDecision ? t("room.composerDecided") : t("room.composer")}
            maxLength={2000}
          />
          <Button type="submit" size="icon" disabled={draft.trim().length === 0} aria-label="Send">
            <Send />
          </Button>
        </form>
      )}

      {/* ── TAB BAR ── */}
      <nav className="shrink-0 flex border-t border-border bg-paper">
        <TabButton
          active={activeTab === "chat"}
          icon={<MessageCircle className="size-5" />}
          label={t("tab.chat")}
          onClick={() => switchTab("chat")}
        />
        <TabButton
          active={activeTab === "ideas"}
          icon={<Lightbulb className="size-5" />}
          label={t("tab.ideas")}
          dot={ideasDot}
          onClick={() => switchTab("ideas")}
        />
        {postDecision && (
          <TabButton
            active={activeTab === "missions"}
            icon={<ListChecks className="size-5" />}
            label={t("tab.missions")}
            dot={missionsDot}
            badge={missions.length > 0 ? `${doneMissions}/${missions.length}` : undefined}
            onClick={() => switchTab("missions")}
          />
        )}
      </nav>

      {/* ── OVERLAYS ── */}
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
            <h2 className="font-display text-xl font-bold text-ink">{t("delete.title")}</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">{t("delete.body")}</p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmingDelete(false)} disabled={deleting}>
                {t("common.cancel")}
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                {deleting ? (
                  <><Loader2 className="animate-spin" /> {t("delete.deleting")}</>
                ) : (
                  <><Trash2 /> {t("common.delete")}</>
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

      {addChipOpen && (
        <AddChipDialog
          extraChips={extraChips}
          onAdd={handleAddChip}
          onRemove={handleRemoveChip}
          onClose={() => setAddChipOpen(false)}
        />
      )}

      {addMissionOpen && (
        <AddMissionDialog onAdd={handleAddMission} onClose={() => setAddMissionOpen(false)} />
      )}
    </div>
  );
}

function TabButton({
  active,
  icon,
  label,
  dot,
  badge,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  dot?: boolean;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors",
        active ? "text-plum" : "text-muted-foreground hover:text-ink",
      )}
    >
      <span className="relative">
        {icon}
        {dot && !badge && (
          <span className="absolute -right-1 -top-1 size-2 rounded-full bg-marigold" />
        )}
        {badge && (
          <span className="absolute -right-3 -top-1.5 rounded-full bg-marigold px-1 text-[10px] font-semibold leading-4 text-ink">
            {badge}
          </span>
        )}
      </span>
      <span>{label}</span>
      {active && (
        <span className="absolute bottom-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-plum" />
      )}
    </button>
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
        {showName && <span className="mb-0.5 ms-1 text-xs font-medium text-plum">{message.author_name}</span>}
        <div
          className={cn(
            "rounded-2xl px-3.5 py-2 text-[15px] leading-snug",
            mine ? "rounded-ee-md bg-plum text-white" : "rounded-es-md border border-border bg-card text-ink",
          )}
        >
          {message.content}
        </div>
      </div>
    </motion.div>
  );
}

function EmptyChat({ blurb }: { blurb?: string }) {
  const { t } = useT();
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted text-plum">
        <Sparkles className="size-6" />
      </div>
      <p className="mt-4 font-display text-lg font-semibold text-ink">{t("room.emptyTitle")}</p>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">
        {blurb || t("room.emptyBody")}
      </p>
    </div>
  );
}
