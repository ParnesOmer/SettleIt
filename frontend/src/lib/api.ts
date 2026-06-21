import { getActiveToken } from "@/lib/session";
import type {
  CreateRoomBody,
  GenerateAccepted,
  HealthResponse,
  Message,
  RoomPreview,
  RoomState,
  Template,
  VoteResult,
} from "@/types/api";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8001";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getActiveToken();
  const response = await fetch(`${BASE_URL}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "X-Session-Token": token } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = (await response.json()) as { detail?: string };
      if (body?.detail) detail = body.detail;
    } catch {
      // non-JSON error body — keep the status text
    }
    throw new ApiError(response.status, detail);
  }

  return (await response.json()) as T;
}

export const api = {
  health: () => request<HealthResponse>("/api/health"),
  getTemplates: () => request<Template[]>("/api/templates"),
  createRoom: (body: CreateRoomBody) =>
    request<RoomState>("/api/rooms", { method: "POST", body: JSON.stringify(body) }),
  getRoomPreview: (code: string) =>
    request<RoomPreview>(`/api/rooms/by-invite/${encodeURIComponent(code)}`),
  joinRoom: (code: string, displayName: string) =>
    request<RoomState>(`/api/rooms/${encodeURIComponent(code)}/join`, {
      method: "POST",
      body: JSON.stringify({ display_name: displayName }),
    }),
  getRoom: (id: string) => request<RoomState>(`/api/rooms/${id}`),
  postMessage: (id: string, content: string) =>
    request<Message>(`/api/rooms/${id}/messages`, {
      method: "POST",
      body: JSON.stringify({ content }),
    }),
  generate: (id: string, refinement?: string) =>
    request<GenerateAccepted>(`/api/rooms/${id}/generate`, {
      method: "POST",
      body: JSON.stringify({ refinement: refinement?.trim() || null }),
    }),
  vote: (suggestionId: string) =>
    request<VoteResult>(`/api/suggestions/${suggestionId}/vote`, { method: "POST" }),
  decide: (id: string, suggestionId: string) =>
    request<RoomState>(`/api/rooms/${id}/decide`, {
      method: "POST",
      body: JSON.stringify({ suggestion_id: suggestionId }),
    }),
};

export { BASE_URL };
