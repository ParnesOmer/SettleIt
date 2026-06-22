import { getActiveToken } from "@/lib/session";
import type {
  CreateRoomBody,
  GenerateAccepted,
  HealthResponse,
  Message,
  Mission,
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

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  health: () => request<HealthResponse>("/api/health"),
  getTemplates: () => request<Template[]>("/api/templates"),
  createRoom: (body: CreateRoomBody) =>
    request<RoomState>("/api/rooms", { method: "POST", body: JSON.stringify(body) }),
  createCustomRoom: (topic: string, displayName: string, language: string) =>
    request<RoomState>("/api/rooms/custom", {
      method: "POST",
      body: JSON.stringify({ topic, display_name: displayName, language }),
    }),
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
  claimMission: (missionId: string) =>
    request<Mission>(`/api/missions/${missionId}/claim`, { method: "POST" }),
  completeMission: (missionId: string) =>
    request<Mission>(`/api/missions/${missionId}/complete`, { method: "POST" }),
  assignRandom: (id: string) =>
    request<Mission[]>(`/api/rooms/${id}/assign-random`, { method: "POST" }),
  closeRoom: (id: string) => request<RoomState>(`/api/rooms/${id}/close`, { method: "POST" }),
  deleteRoom: (id: string) => request<void>(`/api/rooms/${id}`, { method: "DELETE" }),
  removeMember: (roomId: string, memberId: string) =>
    request<RoomState>(`/api/rooms/${roomId}/members/${memberId}/remove`, { method: "POST" }),
  approveMember: (roomId: string, memberId: string) =>
    request<RoomState>(`/api/rooms/${roomId}/members/${memberId}/approve`, { method: "POST" }),
  rotateInvite: (roomId: string) =>
    request<RoomState>(`/api/rooms/${roomId}/rotate-invite`, { method: "POST" }),
  setApproval: (roomId: string, requiresApproval: boolean) =>
    request<RoomState>(`/api/rooms/${roomId}/approval`, {
      method: "POST",
      body: JSON.stringify({ requires_approval: requiresApproval }),
    }),
  addChip: (roomId: string, label: string, options: string[]) =>
    request<RoomState>(`/api/rooms/${roomId}/chips`, {
      method: "POST",
      body: JSON.stringify({ label, options }),
    }),
  removeChip: (roomId: string, chipId: string) =>
    request<RoomState>(`/api/rooms/${roomId}/chips/${chipId}`, { method: "DELETE" }),
  addMission: (roomId: string, title: string, description: string) =>
    request<RoomState>(`/api/rooms/${roomId}/missions`, {
      method: "POST",
      body: JSON.stringify({ title, description }),
    }),
  suggestMissions: (roomId: string) =>
    request<{ status: string }>(`/api/rooms/${roomId}/missions/generate`, { method: "POST" }),
};

export { BASE_URL };
