// Shared API types — mirror the backend Pydantic contract.

export type RoomStatus = "deciding" | "decided" | "executing";
export type MemberRole = "admin" | "member";

export interface HealthResponse {
  status: string;
  database: boolean;
}

export interface SeedChip {
  id: string;
  label: string;
  options?: string[];
}

export interface Template {
  id: string;
  topic_name: string;
  is_custom: boolean;
  seed_chips: SeedChip[];
}

export interface Member {
  id: string;
  display_name: string;
  role: MemberRole;
  created_at: string;
}

export interface Message {
  id: string;
  member_id: string;
  author_name: string;
  content: string;
  created_at: string;
}

export interface RoomState {
  id: string;
  topic: string;
  invite_code: string;
  status: RoomStatus;
  generation_count: number;
  template: Template;
  members: Member[];
  messages: Message[];
  me: Member | null;
  session_token?: string | null;
}

export interface RoomPreview {
  id: string;
  topic: string;
  status: RoomStatus;
  member_count: number;
  members: string[];
  already_member: boolean;
}

export interface CreateRoomBody {
  template_id: string;
  topic: string;
  display_name: string;
}

// WebSocket events the server pushes to a room.
export type RoomEventType =
  | "member_joined"
  | "message_created"
  | "generation_started"
  | "suggestions_ready"
  | "vote_updated"
  | "decision_locked"
  | "missions_ready"
  | "mission_updated";

export interface RoomEvent<T = unknown> {
  type: RoomEventType;
  payload: T;
}
