import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Lang = "en" | "he";
const STORAGE_KEY = "settleit_lang";

type Vars = Record<string, string | number>;

// All UI copy lives here. Keys are shared; English is the fallback.
const dict: Record<Lang, Record<string, string>> = {
  en: {
    // create
    "create.title": "Start a huddle",
    "create.subtitle": "Pick what you're deciding, share the link, and let everyone weigh in.",
    "create.yourName": "Your name",
    "create.namePlaceholder": "e.g. Rae",
    "create.deciding": "What are you deciding?",
    "create.questionsToGo": "{n} quick questions to get going",
    "create.custom": "Custom topic",
    "create.customDesc": "Describe anything — we'll design the room",
    "create.nameHuddle": "Name this huddle",
    "create.topicPlaceholder": "e.g. Friday movie night",
    "create.customTopicPlaceholder": "e.g. a weekend trip to Lisbon",
    "create.cta": "Create room",
    "create.ctaCustom": "Design my room",
    "create.creating": "Creating…",
    "create.designing": "Designing…",
    "create.loadError": "We couldn't load the topics.",
    "create.loadErrorHint": "Check the backend is running, then try again.",
    "create.tryAgain": "Try again",
    "toast.roomCreated": "Room created",
    "toast.designingRoom": "Designing your room…",
    "toast.createFailed": "Couldn't create the room. Try again.",
    // join
    "join.invitedTo": "you're invited to",
    "join.peopleHere": "{n} here",
    "join.joinAs": "Join as…",
    "join.cta": "Join huddle",
    "join.joining": "Joining…",
    "join.welcome": "You're in",
    "join.opening": "opening the huddle…",
    "join.badTitle": "Hmm, that didn't work",
    "join.invalid": "This invite link isn't valid, or the huddle was closed.",
    "join.loadFailed": "We couldn't load this huddle. Check your connection and try again.",
    "join.startNew": "Start a new huddle",
    "join.failed": "Couldn't join. Try again.",
    // room — header / status
    "room.deciding": "deciding",
    "room.decided": "decided",
    "room.here": "{n} here",
    "room.composer": "Message the huddle…",
    "room.composerDecided": "Chat about the plan…",
    "room.add": "Add",
    // room — empty / chat
    "room.emptyTitle": "No messages yet",
    "room.emptyBody": "Be the first to suggest something — or tap a question above.",
    "room.chat": "Chat",
    // room — generate
    "room.generate": "Generate suggestions",
    "room.regenerate": "Regenerate",
    "room.generating": "Generating…",
    "room.left": "{n} of 3 left",
    "room.noneLeft": "no generations left",
    "room.lockHint": "Tap Lock on a card to settle it.",
    // suggestions
    "sug.title": "Suggestions",
    "sug.gen": "gen {n}",
    "sug.reading": "Reading the room…",
    "sug.readingBody": "The agent is weighing what everyone said.",
    "sug.failed": "The agent couldn't put suggestions together.",
    "sug.failedAdmin": "Try generating again.",
    "sug.failedMember": "Ask the host to try again.",
    "sug.leading": "Leading",
    "sug.decided": "Decided",
    "sug.back": "Back this",
    "sug.backed": "Backed",
    "sug.lock": "Lock",
    "sug.votes_one": "{n} vote",
    "sug.votes_other": "{n} votes",
    "room.decidedBanner": "Decided: {title}",
    // celebration
    "celebrate.eyebrow": "the huddle decided",
    "celebrate.badge": "Decided",
    "celebrate.back": "Back to the huddle",
    // missions
    "mis.title": "Missions",
    "mis.progress": "{done}/{total} done",
    "mis.liningUp": "Lining up the missions…",
    "mis.liningUpBody": "Turning your decision into next steps with real links.",
    "mis.starterLinks": "Starter links",
    "mis.take": "I'll take it",
    "mis.release": "Release",
    "mis.markDone": "Mark done",
    "mis.done": "Done",
    "mis.you": "you",
    "mis.assignRandom": "Assign leftovers randomly",
    "mis.addMission": "Add mission",
    "mis.suggestMore": "Suggest more",
    "mis.findingMore": "Finding more missions…",
    "mis.added": "Mission added",
    // designing / pending
    "room.designingTitle": "Designing your room…",
    "room.designingBody": 'Setting up the questions and the game plan for "{topic}".',
    "room.pendingTitle": "Waiting to be let in…",
    "room.pendingBody": 'The host needs to approve you before you can join "{topic}".',
    // admin menu / close / delete
    "menu.manage": "Manage people",
    "menu.close": "Close huddle",
    "menu.delete": "Delete huddle",
    "room.closedBanner": "This huddle is closed — it's read-only now.",
    "delete.title": "Delete this huddle?",
    "delete.body":
      "This permanently removes the chat, decision, and missions for everyone. It can't be undone.",
    "common.cancel": "Cancel",
    "common.delete": "Delete",
    "delete.deleting": "Deleting…",
    "common.next": "next up: who does what",
    // toasts (room)
    "toast.linkCopied": "Invite link copied",
    "toast.closed": "Huddle closed",
    "toast.deleted": "Huddle deleted",
    "toast.deletedByHost": "This huddle was deleted by the host",
    "toast.removed": "You were removed from this huddle",
    "toast.leftoversAssigned": "Leftovers assigned",
    "toast.linkReset": "Invite link reset",
    "toast.joinedSuffix": "joined",
    "toast.wantsToJoin": "wants to join",
    // manage people
    "people.title": "People & access",
    "people.requireApproval": "Require approval to join",
    "people.requireApprovalDesc": "New people wait for you to let them in. Off by default.",
    "people.resetLink": "Reset invite link",
    "people.resetLinkHint": "old link stops working",
    "people.waiting": "Waiting to join",
    "people.approve": "Approve",
    "people.deny": "Deny",
    "people.inHuddle": "In the huddle ({n})",
    "people.remove": "Remove",
    "people.host": "host",
    "people.you": "you",
    // add chip
    "chip.title": "Add a question",
    "chip.label": "Question",
    "chip.labelPlaceholder": "e.g. Which dates?",
    "chip.options": "Options",
    "chip.optionsHint": "(comma-separated, optional)",
    "chip.optionsPlaceholder": "This weekend, Next week",
    "chip.add": "Add question",
    "chip.yours": "Your added questions",
    // add mission
    "amission.title": "Add a mission",
    "amission.label": "Mission",
    "amission.labelPlaceholder": "e.g. Book the restaurant",
    "amission.what": "What to do",
    "amission.optional": "(optional)",
    "amission.whatPlaceholder": "A sentence on what this involves",
    "amission.add": "Add mission",
    // generic errors
    "err.generic": "Something didn't work. Try again.",
    "err.badTitle": "Hmm, that didn't work",
    "err.roomGone": "This huddle doesn't exist.",
    "err.roomLoad": "We couldn't load this huddle. Check your connection and try again.",
    "room.chipCustomPlaceholder": "Or type your own…",
    // language toggle (label shows the OTHER language)
    "lang.toggle": "עברית",
  },
  he: {
    "create.title": "פותחים חדר",
    "create.subtitle": "בחרו על מה מחליטים, שתפו את הקישור, ותנו לכולם להגיב.",
    "create.yourName": "השם שלך",
    "create.namePlaceholder": "למשל דנה",
    "create.deciding": "על מה מחליטים?",
    "create.questionsToGo": "{n} שאלות קצרות להתחלה",
    "create.custom": "נושא חופשי",
    "create.customDesc": "תארו כל דבר — ונעצב לכם את החדר",
    "create.nameHuddle": "שם לחדר",
    "create.topicPlaceholder": "למשל ערב סרט בשישי",
    "create.customTopicPlaceholder": "למשל טיול סוף שבוע ללשבון",
    "create.cta": "פתיחת חדר",
    "create.ctaCustom": "עצבו לי חדר",
    "create.creating": "יוצרים…",
    "create.designing": "מעצבים…",
    "create.loadError": "לא הצלחנו לטעון את הנושאים.",
    "create.loadErrorHint": "ודאו שהשרת פועל ונסו שוב.",
    "create.tryAgain": "נסו שוב",
    "toast.roomCreated": "החדר נוצר",
    "toast.designingRoom": "מעצבים את החדר…",
    "toast.createFailed": "לא הצלחנו ליצור את החדר. נסו שוב.",
    "join.invitedTo": "הוזמנת אל",
    "join.peopleHere": "{n} כאן",
    "join.joinAs": "מצטרפים בשם…",
    "join.cta": "הצטרפות",
    "join.joining": "מצטרפים…",
    "join.welcome": "הצטרפת!",
    "join.opening": "פותחים את החדר…",
    "join.badTitle": "אופס, משהו השתבש",
    "join.invalid": "הקישור אינו תקין, או שהחדר נסגר.",
    "join.loadFailed": "לא הצלחנו לטעון את החדר. בדקו את החיבור ונסו שוב.",
    "join.startNew": "פתחו חדר חדש",
    "join.failed": "לא הצלחנו להצטרף. נסו שוב.",
    "room.deciding": "מחליטים",
    "room.decided": "הוחלט",
    "room.here": "{n} כאן",
    "room.composer": "כתבו הודעה…",
    "room.composerDecided": "דברו על התוכנית…",
    "room.add": "הוספה",
    "room.emptyTitle": "עדיין אין הודעות",
    "room.emptyBody": "היו הראשונים להציע משהו — או הקישו על שאלה למעלה.",
    "room.chat": "צ׳אט",
    "room.generate": "הפקת הצעות",
    "room.regenerate": "הפקה מחדש",
    "room.generating": "חושבים…",
    "room.left": "נותרו {n} מתוך 3",
    "room.noneLeft": "נגמרו ההפקות",
    "room.lockHint": "הקישו על נעילה בכרטיס כדי לקבוע.",
    "sug.title": "הצעות",
    "sug.gen": "סבב {n}",
    "sug.reading": "קוראים את החדר…",
    "sug.readingBody": "הסוכן שוקל את מה שכולם אמרו.",
    "sug.failed": "הסוכן לא הצליח להרכיב הצעות.",
    "sug.failedAdmin": "נסו להפיק שוב.",
    "sug.failedMember": "בקשו מהמארח לנסות שוב.",
    "sug.leading": "מוביל",
    "sug.decided": "נבחר",
    "sug.back": "תמיכה",
    "sug.backed": "תומכים",
    "sug.lock": "נעילה",
    "sug.votes_one": "קול אחד",
    "sug.votes_other": "{n} קולות",
    "room.decidedBanner": "הוחלט: {title}",
    "celebrate.eyebrow": "החדר החליט",
    "celebrate.badge": "נבחר",
    "celebrate.back": "חזרה לחדר",
    "mis.title": "משימות",
    "mis.progress": "{done}/{total} הושלמו",
    "mis.liningUp": "מסדרים את המשימות…",
    "mis.liningUpBody": "הופכים את ההחלטה לצעדים הבאים עם קישורים אמיתיים.",
    "mis.starterLinks": "קישורים להתחלה",
    "mis.take": "אני אדאג",
    "mis.release": "שחרור",
    "mis.markDone": "סימון כבוצע",
    "mis.done": "בוצע",
    "mis.you": "את/ה",
    "mis.assignRandom": "חלוקה אקראית של הנותרות",
    "mis.addMission": "הוספת משימה",
    "mis.suggestMore": "הצעות נוספות",
    "mis.findingMore": "מחפשים עוד משימות…",
    "mis.added": "המשימה נוספה",
    "room.designingTitle": "מעצבים את החדר…",
    "room.designingBody": 'מכינים את השאלות והתוכנית עבור "{topic}".',
    "room.pendingTitle": "ממתינים לאישור…",
    "room.pendingBody": 'המארח צריך לאשר אתכם לפני ההצטרפות אל "{topic}".',
    "menu.manage": "ניהול משתתפים",
    "menu.close": "סגירת החדר",
    "menu.delete": "מחיקת החדר",
    "room.closedBanner": "החדר סגור — לקריאה בלבד.",
    "delete.title": "למחוק את החדר?",
    "delete.body": "פעולה זו מוחקת לצמיתות את הצ׳אט, ההחלטה והמשימות של כולם. אי אפשר לבטל.",
    "common.cancel": "ביטול",
    "common.delete": "מחיקה",
    "delete.deleting": "מוחקים…",
    "common.next": "בהמשך: מי עושה מה",
    "toast.linkCopied": "הקישור הועתק",
    "toast.closed": "החדר נסגר",
    "toast.deleted": "החדר נמחק",
    "toast.deletedByHost": "החדר נמחק על ידי המארח",
    "toast.removed": "הוסרת מהחדר",
    "toast.leftoversAssigned": "המשימות חולקו",
    "toast.linkReset": "הקישור אופס",
    "toast.joinedSuffix": "הצטרפ/ה",
    "toast.wantsToJoin": "מבקש/ת להצטרף",
    "people.title": "משתתפים והרשאות",
    "people.requireApproval": "דרוש אישור להצטרפות",
    "people.requireApprovalDesc": "משתתפים חדשים ימתינו לאישורכם. כבוי כברירת מחדל.",
    "people.resetLink": "איפוס קישור ההזמנה",
    "people.resetLinkHint": "הקישור הישן יפסיק לעבוד",
    "people.waiting": "ממתינים לאישור",
    "people.approve": "אישור",
    "people.deny": "דחייה",
    "people.inHuddle": "בחדר ({n})",
    "people.remove": "הסרה",
    "people.host": "מארח",
    "people.you": "את/ה",
    "chip.title": "הוספת שאלה",
    "chip.label": "שאלה",
    "chip.labelPlaceholder": "למשל אילו תאריכים?",
    "chip.options": "אפשרויות",
    "chip.optionsHint": "(מופרדות בפסיק, לא חובה)",
    "chip.optionsPlaceholder": "סוף השבוע, שבוע הבא",
    "chip.add": "הוספה",
    "chip.yours": "השאלות שהוספת",
    "amission.title": "הוספת משימה",
    "amission.label": "משימה",
    "amission.labelPlaceholder": "למשל להזמין מסעדה",
    "amission.what": "מה צריך לעשות",
    "amission.optional": "(לא חובה)",
    "amission.whatPlaceholder": "משפט על מה זה כולל",
    "amission.add": "הוספה",
    "err.generic": "משהו השתבש. נסו שוב.",
    "err.badTitle": "אופס, משהו השתבש",
    "err.roomGone": "החדר לא קיים.",
    "err.roomLoad": "לא הצלחנו לטעון את החדר. בדקו את החיבור ונסו שוב.",
    "room.chipCustomPlaceholder": "או כתבו משהו אחר…",
    "lang.toggle": "English",
  },
};

interface LangValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string, vars?: Vars) => string;
}

const LangContext = createContext<LangValue | null>(null);

function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "he") return saved;
  } catch {
    // ignore
  }
  return typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("he")
    ? "he"
    : "en";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => detectLang());

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "he" ? "rtl" : "ltr";
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // ignore
    }
  }, [lang]);

  const t = useCallback(
    (key: string, vars?: Vars) => {
      let str = dict[lang][key] ?? dict.en[key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          str = str.replace(`{${k}}`, String(v));
        }
      }
      return str;
    },
    [lang],
  );

  const value = useMemo<LangValue>(() => ({ lang, setLang, t }), [lang, t]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useT(): LangValue {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useT must be used within LanguageProvider");
  return ctx;
}
