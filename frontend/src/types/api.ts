// Shared API types — mirror the backend Pydantic contract.

export type RoomStatus = "deciding" | "decided" | "executing";
export type MemberRole = "admin" | "member";
export type MemberStatus = "active" | "pending" | "removed";

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
  status: MemberStatus;
  created_at: string;
}

export interface Message {
  id: string;
  member_id: string;
  author_name: string;
  content: string;
  created_at: string;
}

export interface Suggestion {
  id: string;
  title: string;
  rationale: string;
  metadata: Record<string, string>;
  vote_count: number;
  backer_ids: string[];
}

export interface SuggestionSet {
  id: string;
  generation_number: number;
  status: "pending" | "complete" | "failed";
  suggestions: Suggestion[];
}

export interface VoteResult {
  set_id: string;
  tallies: Record<string, number>;
  backers: Record<string, string[]>;
}

export interface GenerateAccepted {
  set_id: string;
  generation_number: number;
  generations_left: number;
}

export type MissionStatus = "open" | "claimed" | "done";

export interface MissionResource {
  id: string;
  title: string;
  url: string;
  note?: string | null;
}

export interface Mission {
  id: string;
  title: string;
  description: string;
  status: MissionStatus;
  assigned_member_id: string | null;
  assignee_name: string | null;
  resources: MissionResource[];
}

export interface RoomState {
  id: string;
  topic: string;
  invite_code: string;
  status: RoomStatus;
  generation_count: number;
  generations_left: number;
  template: Template;
  members: Member[];
  messages: Message[];
  current_set: SuggestionSet | null;
  decided_suggestion_id: string | null;
  missions: Mission[];
  closed_at: string | null;
  requires_approval: boolean;
  pending_members: Member[];
  extra_chips: SeedChip[];
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
  | "mission_updated"
  | "template_ready"
  | "room_closed"
  | "room_deleted"
  | "member_pending"
  | "member_removed"
  | "member_approved"
  | "chips_updated";

export interface RoomEvent<T = unknown> {
  type: RoomEventType;
  payload: T;
}
