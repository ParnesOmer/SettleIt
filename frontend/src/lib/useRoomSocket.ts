import { useEffect, useRef } from "react";

import { BASE_URL } from "@/lib/api";
import type { RoomEvent } from "@/types/api";

// Subscribes to a room's WebSocket and forwards server events. Reconnects on drop.
export function useRoomSocket(roomId: string | undefined, onEvent: (event: RoomEvent) => void) {
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    if (!roomId) return;

    let closed = false;
    let socket: WebSocket | null = null;
    let retry: number | undefined;
    const url = `${BASE_URL.replace(/^http/, "ws")}/ws/rooms/${roomId}`;

    const connect = () => {
      socket = new WebSocket(url);
      socket.onmessage = (event) => {
        try {
          handler.current(JSON.parse(event.data) as RoomEvent);
        } catch {
          // ignore malformed frames
        }
      };
      socket.onclose = () => {
        if (!closed) retry = window.setTimeout(connect, 1500);
      };
      socket.onerror = () => socket?.close();
    };

    connect();

    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      socket?.close();
    };
  }, [roomId]);
}
