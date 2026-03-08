export interface ChatAttachment {
  id: string;
  name: string;
  mimeType: string;
  dataUrl: string;
  size: number;
}

export interface ChatAttachmentDraft {
  name: string;
  mimeType: string;
  dataUrl: string;
  size: number;
}

export interface RoomMessage {
  id: string;
  roomId: string;
  authorId: string;
  authorName: string;
  authorColor: string;
  text: string;
  replyToId: string | null;
  attachments: ChatAttachment[];
  createdAt: string;
}

export interface RoomParticipant {
  socketId: string;
  nickname: string;
  color: string;
  joinedAt: string;
}

export interface RoomPointer {
  roomId: string;
  socketId: string;
  nickname: string;
  color: string;
  x: number;
  y: number;
  z: number;
  path: string | null;
  updatedAt: number;
}

export interface RoomStatePayload {
  roomId: string;
  participants: RoomParticipant[];
  messages: RoomMessage[];
  pointers: RoomPointer[];
}

export interface RoomParticipantsPayload {
  roomId: string;
  participants: RoomParticipant[];
}
