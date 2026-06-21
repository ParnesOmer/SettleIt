// Session token store. The token is also set as an httpOnly cookie by the server, but on a
// cross-site deploy (Vercel frontend + Render backend) browsers block that cookie — so we keep a
// copy here and send it as an X-Session-Token header. Persisted per room id.

const KEY = "settleit_tokens";
let active: string | null = null;

function load(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

export function saveToken(roomId: string, token: string) {
  const map = load();
  map[roomId] = token;
  localStorage.setItem(KEY, JSON.stringify(map));
  active = token;
}

export function tokenForRoom(roomId: string): string | undefined {
  return load()[roomId];
}

export function setActiveToken(token: string | null) {
  active = token;
}

export function getActiveToken(): string | null {
  return active;
}
