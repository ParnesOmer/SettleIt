// Shared API types — mirror the backend Pydantic/ORM contract.
// Feature endpoints arrive in milestone 2; these establish the typed shape now.

export type RoomStatus = "deciding" | "decided" | "executing";
export type MemberRole = "admin" | "member";
export type SetStatus = "pending" | "complete" | "failed";
export type MissionStatus = "open" | "claimed" | "done";

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
  card_shape: Record<string, unknown>;
  execution_spec: Record<string, unknown>;
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
  content: string;
  created_at: string;
}

export interface Suggestion {
  id: string;
  set_id: string;
  title: string;
  rationale: string;
  metadata: Record<string, unknown>;
  vote_count?: number;
}

export interface SuggestionSet {
  id: string;
  generation_number: number;
  status: SetStatus;
  suggestions: Suggestion[];
}

export interface MissionResource {
  id: string;
  title: string;
  url: string;
  note?: string | null;
}

export interface Mission {
  id: string;
  assigned_member_id?: string | null;
  title: string;
  description: string;
  status: MissionStatus;
  resources: MissionResource[];
}

export interface Room {
  id: string;
  topic: string;
  invite_code: string;
  status: RoomStatus;
  generation_count: number;
  decided_suggestion_id?: string | null;
  members: Member[];
  messages: Message[];
  current_set?: SuggestionSet | null;
  missions: Mission[];
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
