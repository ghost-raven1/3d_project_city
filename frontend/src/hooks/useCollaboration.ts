import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getParserSocket } from './socket';
import {
  ChatAttachmentDraft,
  RoomMessage,
  RoomParticipant,
  RoomParticipantsPayload,
  RoomPointer,
  RoomStatePayload,
} from '../types/collaboration';

const POINTER_TTL_MS = 6500;
const MAX_QUEUED_MESSAGES = 12;

interface PendingRoomMessage {
  roomId: string;
  clientMessageId: string;
  text: string;
  attachments: ChatAttachmentDraft[];
  replyToId: string | null;
}

function createClientMessageId(): string {
  return `cmsg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function mergeRoomMessages(current: RoomMessage[], nextMessage: RoomMessage): RoomMessage[] {
  const index = current.findIndex((message) => message.id === nextMessage.id);
  if (index >= 0) {
    const next = [...current];
    next[index] = nextMessage;
    return next;
  }

  const next = [...current, nextMessage];
  if (next.length > 220) {
    return next.slice(next.length - 220);
  }
  return next;
}

function normalizeRoomMessages(messages: RoomMessage[]): RoomMessage[] {
  const deduplicated = new Map<string, RoomMessage>();
  messages.forEach((message) => {
    deduplicated.set(message.id, message);
  });
  return Array.from(deduplicated.values()).sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
}

function normalizeRoomId(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '').slice(0, 48);
}

function normalizeNickname(value: string): string {
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized.slice(0, 32);
}

function normalizeRoomAccessKey(value: string): string {
  return value.trim().slice(0, 64);
}

export function useCollaboration() {
  const socket = useMemo(() => getParserSocket(), []);
  const [roomId, setRoomId] = useState('main');
  const [nickname, setNickname] = useState(
    () => `Guest-${Math.random().toString(36).slice(2, 6)}`,
  );
  const [roomAccessKey, setRoomAccessKey] = useState('');
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<RoomParticipant[]>([]);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [pointers, setPointers] = useState<RoomPointer[]>([]);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [queuedMessagesCount, setQueuedMessagesCount] = useState(0);
  const reconnectRoomRef = useRef<{
    roomId: string;
    nickname: string;
    accessKey?: string;
  } | null>(null);
  const activeRoomRef = useRef<string | null>(null);
  const queuedMessagesRef = useRef<PendingRoomMessage[]>([]);
  const lastPointerRef = useRef<{ x: number; y: number; z: number; sentAt: number } | null>(
    null,
  );

  const flushQueuedMessages = useCallback(
    (targetRoomId?: string) => {
      if (!socket.connected) {
        return;
      }
      if (queuedMessagesRef.current.length === 0) {
        return;
      }

      const remaining: PendingRoomMessage[] = [];
      queuedMessagesRef.current.forEach((queued) => {
        if (targetRoomId && queued.roomId !== targetRoomId) {
          remaining.push(queued);
          return;
        }

        socket.emit('room_message', {
          roomId: queued.roomId,
          clientMessageId: queued.clientMessageId,
          text: queued.text,
          replyToId: queued.replyToId,
          attachments: queued.attachments,
        });
      });

      queuedMessagesRef.current = remaining;
      setQueuedMessagesCount(remaining.length);
    },
    [socket],
  );

  useEffect(() => {
    const pruneQueuedByMessageIds = (messageIds: string[]) => {
      if (messageIds.length === 0 || queuedMessagesRef.current.length === 0) {
        return;
      }
      const delivered = new Set(messageIds);
      const nextQueued = queuedMessagesRef.current.filter(
        (item) => !delivered.has(item.clientMessageId),
      );
      if (nextQueued.length === queuedMessagesRef.current.length) {
        return;
      }
      queuedMessagesRef.current = nextQueued;
      setQueuedMessagesCount(nextQueued.length);
    };

    const onRoomState = (payload: RoomStatePayload) => {
      const receivedAt = Date.now();
      setActiveRoomId(payload.roomId);
      activeRoomRef.current = payload.roomId;
      setParticipants(payload.participants ?? []);
      const normalizedMessages = normalizeRoomMessages(payload.messages ?? []);
      setMessages(normalizedMessages);
      pruneQueuedByMessageIds(normalizedMessages.map((message) => message.id));
      setPointers(
        (payload.pointers ?? []).map((pointer) => ({
          ...pointer,
          updatedAt: receivedAt,
        })),
      );
      setRoomError(null);
      flushQueuedMessages(payload.roomId);
    };

    const onRoomParticipants = (payload: RoomParticipantsPayload) => {
      setParticipants(payload.participants ?? []);
    };

    const onRoomMessage = (payload: RoomMessage) => {
      pruneQueuedByMessageIds([payload.id]);
      setMessages((current) => mergeRoomMessages(current, payload));
      setRoomError(null);
    };

    const onRoomPointer = (payload: RoomPointer) => {
      const receivedAt = Date.now();
      setPointers((current) => {
        const next = current.filter((item) => item.socketId !== payload.socketId);
        next.push({
          ...payload,
          updatedAt: receivedAt,
        });
        return next;
      });
    };

    const onRoomPointerRemove = (payload: { roomId: string; socketId: string }) => {
      setPointers((current) =>
        current.filter((item) => item.socketId !== payload.socketId),
      );
    };

    const onRoomError = (payload: { message?: string }) => {
      setRoomError(payload?.message ?? 'Room error.');
    };

    const onConnect = () => {
      const reconnect = reconnectRoomRef.current;
      if (!reconnect) {
        if (activeRoomRef.current) {
          flushQueuedMessages(activeRoomRef.current);
        }
        return;
      }

      socket.emit('room_join', reconnect);
    };

    const onDisconnect = () => {
      setParticipants([]);
      setPointers([]);
      setRoomError('Disconnected from room. Reconnecting...');
    };

    socket.on('connect', onConnect);
    socket.on('room_state', onRoomState);
    socket.on('room_participants', onRoomParticipants);
    socket.on('room_message', onRoomMessage);
    socket.on('room_pointer', onRoomPointer);
    socket.on('room_pointer_remove', onRoomPointerRemove);
    socket.on('room_error', onRoomError);
    socket.on('disconnect', onDisconnect);

    if (!socket.connected) {
      socket.connect();
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('room_state', onRoomState);
      socket.off('room_participants', onRoomParticipants);
      socket.off('room_message', onRoomMessage);
      socket.off('room_pointer', onRoomPointer);
      socket.off('room_pointer_remove', onRoomPointerRemove);
      socket.off('room_error', onRoomError);
      socket.off('disconnect', onDisconnect);
    };
  }, [flushQueuedMessages, socket]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const now = Date.now();
      setPointers((current) =>
        current.filter((pointer) => now - pointer.updatedAt < POINTER_TTL_MS),
      );
    }, 1200);

    return () => window.clearInterval(interval);
  }, []);

  const joinRoom = useCallback(() => {
    const normalizedRoomId = normalizeRoomId(roomId);
    const normalizedNickname = normalizeNickname(nickname);
    const normalizedAccessKey = normalizeRoomAccessKey(roomAccessKey);

    if (!normalizedRoomId) {
      setRoomError('Room id is required.');
      return;
    }

    if (!normalizedNickname) {
      setRoomError('Nickname is required.');
      return;
    }

    reconnectRoomRef.current = {
      roomId: normalizedRoomId,
      nickname: normalizedNickname,
      ...(normalizedAccessKey ? { accessKey: normalizedAccessKey } : {}),
    };

    if (!socket.connected) {
      socket.connect();
    }

    socket.emit('room_join', {
      roomId: normalizedRoomId,
      nickname: normalizedNickname,
      ...(normalizedAccessKey ? { accessKey: normalizedAccessKey } : {}),
    });
    setRoomId(normalizedRoomId);
    setNickname(normalizedNickname);
    setRoomAccessKey(normalizedAccessKey);
    setRoomError(null);
  }, [nickname, roomAccessKey, roomId, socket]);

  const leaveRoom = useCallback(() => {
    socket.emit('room_leave');
    reconnectRoomRef.current = null;
    activeRoomRef.current = null;
    queuedMessagesRef.current = [];
    setQueuedMessagesCount(0);
    setActiveRoomId(null);
    setParticipants([]);
    setMessages([]);
    setPointers([]);
    setRoomError(null);
  }, [socket]);

  const sendMessage = useCallback(
    (text: string, attachments: ChatAttachmentDraft[], replyToId: string | null): string | null => {
      if (!activeRoomId) {
        setRoomError('Join a room first.');
        return null;
      }
      const clientMessageId = createClientMessageId();

      if (!socket.connected) {
        const nextQueue = [
          ...queuedMessagesRef.current,
          {
            roomId: activeRoomId,
            clientMessageId,
            text,
            attachments,
            replyToId,
          },
        ].slice(-MAX_QUEUED_MESSAGES);
        queuedMessagesRef.current = nextQueue;
        setQueuedMessagesCount(nextQueue.length);
        setRoomError('Socket is offline. Message queued and will be sent after reconnect.');
        return clientMessageId;
      }

      socket.emit('room_message', {
        roomId: activeRoomId,
        clientMessageId,
        text,
        replyToId,
        attachments,
      });
      setRoomError(null);
      return clientMessageId;
    },
    [activeRoomId, socket],
  );

  const sendPointer = useCallback(
    (payload: { x: number; y: number; z: number; path: string | null }) => {
      if (!activeRoomId || !socket.connected) {
        return;
      }

      const now = performance.now();
      const previous = lastPointerRef.current;
      if (previous) {
        const distance = Math.hypot(
          payload.x - previous.x,
          payload.y - previous.y,
          payload.z - previous.z,
        );
        const elapsed = now - previous.sentAt;
        if (elapsed < 80 && distance < 0.5) {
          return;
        }
      }

      lastPointerRef.current = {
        x: payload.x,
        y: payload.y,
        z: payload.z,
        sentAt: now,
      };

      socket.emit('room_pointer', {
        roomId: activeRoomId,
        x: payload.x,
        y: payload.y,
        z: payload.z,
        path: payload.path,
      });
    },
    [activeRoomId, socket],
  );

  const clearRoomError = useCallback(() => {
    setRoomError(null);
  }, []);

  return {
    roomId,
    nickname,
    roomAccessKey,
    activeRoomId,
    participants,
    messages,
    pointers,
    roomError,
    queuedMessagesCount,
    selfSocketId: socket.id ?? null,
    isSocketConnected: socket.connected,
    setRoomId,
    setNickname,
    setRoomAccessKey,
    joinRoom,
    leaveRoom,
    sendMessage,
    sendPointer,
    clearRoomError,
  };
}
