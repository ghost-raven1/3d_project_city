import {
  ChangeEvent,
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import AttachFileRoundedIcon from '@mui/icons-material/AttachFileRounded';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';
import ClearRoundedIcon from '@mui/icons-material/ClearRounded';
import ExpandLessRoundedIcon from '@mui/icons-material/ExpandLessRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import LoginRoundedIcon from '@mui/icons-material/LoginRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import ReplyRoundedIcon from '@mui/icons-material/ReplyRounded';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material';
import {
  ChatAttachmentDraft,
  RoomMessage,
  RoomParticipant,
} from '../types/collaboration';
import {
  panelActionButtonSx,
  panelChipSx,
  panelInsetSx,
  panelCardHoverSx,
  panelEmptyStateSx,
  panelMetaTextSx,
  panelScrollSx,
  panelSurfaceSx,
  panelTitleSx,
} from './panelStyles';

interface ChatDockProps {
  roomId: string;
  nickname: string;
  roomAccessKey: string;
  activeRoomId: string | null;
  participants: RoomParticipant[];
  messages: RoomMessage[];
  roomError: string | null;
  selfSocketId: string | null;
  connected: boolean;
  queuedMessagesCount: number;
  compact?: boolean;
  topOffset?: number;
  onHeightChange?: (height: number) => void;
  onRoomIdChange: (value: string) => void;
  onNicknameChange: (value: string) => void;
  onRoomAccessKeyChange: (value: string) => void;
  onJoin: () => void;
  onLeave: () => void;
  onSendMessage: (
    text: string,
    attachments: ChatAttachmentDraft[],
    replyToId: string | null,
  ) => void;
  onClearError: () => void;
}

const MAX_ATTACHMENT_BYTES = 700_000;
const MAX_ATTACHMENTS_PER_MESSAGE = 3;
const MAX_ATTACHMENTS_TOTAL_BYTES = 1_800_000;

function isImageAttachment(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

export function ChatDock({
  roomId,
  nickname,
  roomAccessKey,
  activeRoomId,
  participants,
  messages,
  roomError,
  selfSocketId,
  connected,
  queuedMessagesCount,
  compact = false,
  topOffset = 96,
  onHeightChange,
  onRoomIdChange,
  onNicknameChange,
  onRoomAccessKeyChange,
  onJoin,
  onLeave,
  onSendMessage,
  onClearError,
}: ChatDockProps) {
  const isShortViewport = useMediaQuery('(max-height: 860px)');
  const [collapsed, setCollapsed] = useState(false);
  const [draft, setDraft] = useState('');
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<ChatAttachmentDraft[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const lastHeightRef = useRef(0);

  const messagesById = useMemo(
    () => new Map(messages.map((message) => [message.id, message])),
    [messages],
  );
  const replySource = replyToId ? messagesById.get(replyToId) ?? null : null;
  const messageListHeight = isShortViewport
    ? compact
      ? 132
      : 150
    : compact
      ? 186
      : 230;
  const messageListHeightCss = `clamp(${compact ? 112 : 124}px, ${
    isShortViewport ? 24 : 30
  }vh, ${messageListHeight}px)`;
  const safeTopOffset = Number.isFinite(topOffset)
    ? Math.max(72, Math.round(topOffset))
    : 96;
  const mobileBottomOffset = 8;
  const desktopBottomOffset = 16;
  const mobileMaxHeight = `max(220px, calc(100vh - ${safeTopOffset + mobileBottomOffset + 8}px))`;
  const desktopMaxHeight = `max(260px, calc(100vh - ${safeTopOffset + desktopBottomOffset + 10}px))`;

  useEffect(() => {
    if (!listRef.current) {
      return;
    }

    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length]);

  useEffect(() => {
    if (!onHeightChange) {
      return;
    }

    const node = rootRef.current;
    if (!node) {
      return;
    }

    const emitHeight = () => {
      const next = Math.max(0, Math.ceil(node.getBoundingClientRect().height));
      if (Math.abs(next - lastHeightRef.current) < 1) {
        return;
      }
      lastHeightRef.current = next;
      onHeightChange(next);
    };

    emitHeight();
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => emitHeight());
    observer?.observe(node);
    window.addEventListener('resize', emitHeight);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', emitHeight);
    };
  }, [onHeightChange]);

  const clearComposer = () => {
    setDraft('');
    setReplyToId(null);
    setAttachments([]);
    setLocalError(null);
  };

  const readFile = (file: File): Promise<ChatAttachmentDraft | null> =>
    new Promise((resolve) => {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        resolve(null);
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== 'string') {
          resolve(null);
          return;
        }

        resolve({
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          dataUrl: reader.result,
          size: file.size,
        });
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });

  const handleAttachFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) {
      return;
    }

    const remaining = Math.max(0, MAX_ATTACHMENTS_PER_MESSAGE - attachments.length);
    if (remaining === 0) {
      setLocalError('You can attach up to 3 files.');
      return;
    }

    const selected = files.slice(0, remaining);
    const loaded = await Promise.all(selected.map((file) => readFile(file)));
    const valid = loaded.filter((item): item is ChatAttachmentDraft => item !== null);
    const rejectedCount = selected.length - valid.length;

    let skippedByTotal = 0;
    if (valid.length > 0) {
      const next = [...attachments];
      let totalBytes = next.reduce((sum, attachment) => sum + attachment.size, 0);

      valid.forEach((attachment) => {
        if (totalBytes + attachment.size > MAX_ATTACHMENTS_TOTAL_BYTES) {
          skippedByTotal += 1;
          return;
        }

        next.push(attachment);
        totalBytes += attachment.size;
      });

      setAttachments(next.slice(0, MAX_ATTACHMENTS_PER_MESSAGE));
    }

    if (rejectedCount > 0 || skippedByTotal > 0) {
      setLocalError(
        'Some files were skipped. Limits: 700KB per file, 1.8MB total per message.',
      );
    } else {
      setLocalError(null);
    }

    event.target.value = '';
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();

    if (!activeRoomId) {
      setLocalError('Join a room first.');
      return;
    }

    if (!draft.trim() && attachments.length === 0) {
      return;
    }

    onSendMessage(draft, attachments, replyToId);
    clearComposer();
  };

  return (
    <Paper
      ref={rootRef}
      elevation={5}
      sx={{
        position: 'absolute',
        left: { xs: 8, md: 16 },
        bottom: { xs: 8, md: 16 },
        width: { xs: 'calc(100% - 16px)', sm: compact ? 352 : 396, lg: compact ? 364 : 420 },
        maxWidth: 'calc(100vw - 16px)',
        maxHeight: {
          xs: mobileMaxHeight,
          md: desktopMaxHeight,
        },
        zIndex: 18,
        overflow: 'hidden',
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        ...panelSurfaceSx,
      }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 1, py: 0.7 }}>
        <Stack
          direction="row"
          spacing={0.5}
          alignItems="center"
          sx={{ minWidth: 0, flex: 1, flexWrap: 'wrap', rowGap: 0.4 }}
        >
          <ChatBubbleOutlineRoundedIcon fontSize="small" sx={{ color: '#8defff' }} />
          <Typography
            variant="subtitle2"
            fontWeight={800}
            sx={{ ...panelTitleSx, mr: 0.2, whiteSpace: 'nowrap' }}
          >
            Collab Link
          </Typography>
          {activeRoomId && (
            <Chip
              size="small"
              label={`#${activeRoomId}`}
              color="primary"
              variant="outlined"
              sx={{
                ...panelChipSx,
                maxWidth: 110,
                '& .MuiChip-label': {
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                },
              }}
            />
          )}
          <Chip
            size="small"
            label={connected ? 'live' : 'offline'}
            color={connected ? 'success' : 'default'}
            variant="outlined"
            sx={panelChipSx}
          />
          {queuedMessagesCount > 0 && (
            <Chip
              size="small"
              label={`queued ${queuedMessagesCount}`}
              color="warning"
              variant="outlined"
              sx={panelChipSx}
            />
          )}
        </Stack>
        <IconButton
          size="small"
          onClick={() => setCollapsed((value) => !value)}
          title={collapsed ? 'Expand panel' : 'Collapse panel'}
        >
          {collapsed ? <ExpandMoreRoundedIcon fontSize="small" /> : <ExpandLessRoundedIcon fontSize="small" />}
        </IconButton>
      </Stack>

      {!collapsed && (
        <Stack
          spacing={0.8}
          sx={{
            p: isShortViewport ? 0.85 : 1,
            minWidth: 0,
            minHeight: 0,
            flex: '1 1 auto',
            overflowX: 'hidden',
            overflowY: 'auto',
            ...panelScrollSx,
          }}
        >
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
              gap: 0.8,
            }}
          >
            <TextField
              size="small"
              label="Room"
              value={roomId}
              onChange={(event) => onRoomIdChange(event.target.value)}
              sx={{ minWidth: 0 }}
            />
            <TextField
              size="small"
              label="Nickname"
              value={nickname}
              onChange={(event) => onNicknameChange(event.target.value)}
              sx={{ minWidth: 0 }}
            />
            <TextField
              size="small"
              type="password"
              label="Room key"
              value={roomAccessKey}
              placeholder="optional"
              onChange={(event) => onRoomAccessKeyChange(event.target.value)}
              sx={{ minWidth: 0 }}
            />
            {activeRoomId ? (
              <Button
                size="small"
                variant="outlined"
                color="secondary"
                startIcon={<LogoutRoundedIcon />}
                onClick={onLeave}
                sx={{ minHeight: 40, ...panelActionButtonSx }}
              >
                Leave
              </Button>
            ) : (
              <Button
                size="small"
                variant="contained"
                startIcon={<LoginRoundedIcon />}
                onClick={onJoin}
                sx={{ minHeight: 40, ...panelActionButtonSx }}
              >
                Join
              </Button>
            )}
          </Box>

          {participants.length > 0 && (
            <Stack direction="row" spacing={0.5} flexWrap="wrap">
              {participants.map((participant) => (
                <Chip
                  key={participant.socketId}
                  size="small"
                  avatar={<Avatar sx={{ width: 18, height: 18, bgcolor: participant.color }} />}
                  label={`${participant.nickname}${participant.socketId === selfSocketId ? ' (you)' : ''}`}
                  variant="outlined"
                  sx={{
                    ...panelChipSx,
                    maxWidth: '100%',
                    '& .MuiChip-label': {
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    },
                  }}
                />
              ))}
            </Stack>
          )}

          {(roomError || localError) && (
            <Alert
              severity="warning"
              onClose={() => {
                setLocalError(null);
                onClearError();
              }}
              sx={{
                '& .MuiAlert-message': {
                  minWidth: 0,
                  overflowWrap: 'anywhere',
                },
              }}
            >
              {roomError ?? localError}
            </Alert>
          )}

          <Divider />

          <Box
            ref={listRef}
            sx={{
              ...panelInsetSx,
              height: messageListHeightCss,
              minHeight: compact ? 112 : 124,
              overflowY: 'auto',
              px: 0.35,
              py: 0.45,
              pr: 0.2,
              ...panelScrollSx,
            }}
          >
            <Stack spacing={0.8}>
              {messages.length === 0 && (
                <Box sx={panelEmptyStateSx}>
                  <Typography variant="caption" sx={panelMetaTextSx}>
                    No messages yet. Join room and start collaboration thread.
                  </Typography>
                </Box>
              )}
              {messages.map((message) => {
                const isSelf = message.authorId === selfSocketId;
                const replyTarget = message.replyToId
                  ? messagesById.get(message.replyToId) ?? null
                  : null;

                return (
                  <Paper
                    key={message.id}
                    variant="outlined"
                    sx={{
                      ...panelCardHoverSx,
                      p: 0.7,
                      backgroundColor: isSelf
                        ? 'rgba(14, 45, 73, 0.68)'
                        : 'rgba(6, 23, 44, 0.72)',
                      borderColor: isSelf
                        ? 'rgba(99, 229, 255, 0.45)'
                        : 'rgba(125, 173, 220, 0.28)',
                      boxShadow: isSelf
                        ? '0 0 18px rgba(78, 208, 255, 0.14)'
                        : '0 0 14px rgba(60, 118, 197, 0.1)',
                    }}
                  >
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <Avatar sx={{ width: 18, height: 18, bgcolor: message.authorColor }} />
                        <Typography
                          variant="caption"
                          fontWeight={700}
                          sx={{
                            maxWidth: 128,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {message.authorName}
                        </Typography>
                      </Stack>
                      <Stack direction="row" spacing={0.3} alignItems="center">
                        <Typography variant="caption" sx={panelMetaTextSx}>
                          {new Date(message.createdAt).toLocaleTimeString()}
                        </Typography>
                        <Tooltip title="Reply">
                          <IconButton
                            size="small"
                            onClick={() => setReplyToId(message.id)}
                            sx={{ p: 0.2 }}
                          >
                            <ReplyRoundedIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </Stack>

                    {replyTarget && (
                      <Box
                        sx={{
                          mt: 0.4,
                          mb: 0.5,
                          px: 0.6,
                          py: 0.3,
                          borderLeft: `3px solid ${replyTarget.authorColor}`,
                          backgroundColor: 'rgba(8, 31, 54, 0.7)',
                        }}
                      >
                        <Typography variant="caption" color="text.secondary">
                          ↪ {replyTarget.authorName}
                        </Typography>
                        <Typography
                          variant="caption"
                          display="block"
                          sx={{ overflowWrap: 'anywhere' }}
                        >
                          {replyTarget.text || `[${replyTarget.attachments.length} attachment(s)]`}
                        </Typography>
                      </Box>
                    )}

                    {message.text && (
                      <Typography
                        variant="body2"
                        sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                      >
                        {message.text}
                      </Typography>
                    )}

                    {message.attachments.length > 0 && (
                      <Stack spacing={0.5} mt={0.6}>
                        {message.attachments.map((attachment) => (
                          <Box key={attachment.id}>
                            {isImageAttachment(attachment.mimeType) ? (
                              <a href={attachment.dataUrl} download={attachment.name}>
                                <Box
                                  component="img"
                                  src={attachment.dataUrl}
                                  alt={attachment.name}
                                  sx={{
                                    width: '100%',
                                    maxHeight: 112,
                                    objectFit: 'cover',
                                    borderRadius: 0.8,
                                    border: '1px solid rgba(126,219,255,0.36)',
                                  }}
                                />
                              </a>
                            ) : (
                              <Chip
                                size="small"
                                label={`${attachment.name} · ${Math.round(attachment.size / 1024)}KB`}
                                component="a"
                                href={attachment.dataUrl}
                                clickable
                                download={attachment.name}
                              />
                            )}
                          </Box>
                        ))}
                      </Stack>
                    )}
                  </Paper>
                );
              })}
            </Stack>
          </Box>

          <Divider />

          {replySource && (
            <Paper
              variant="outlined"
              sx={{
                ...panelInsetSx,
                p: 0.6,
                backgroundColor: 'rgba(10, 35, 60, 0.7)',
                borderColor: 'rgba(115, 220, 255, 0.34)',
              }}
            >
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="caption" sx={{ overflowWrap: 'anywhere', minWidth: 0, pr: 0.8 }}>
                  Reply to {replySource.authorName}:{' '}
                  {replySource.text || `[${replySource.attachments.length} attachment(s)]`}
                </Typography>
                <IconButton size="small" onClick={() => setReplyToId(null)} sx={{ p: 0.2 }}>
                  <ClearRoundedIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Stack>
            </Paper>
          )}

          <Box component="form" onSubmit={submit}>
            <Stack spacing={0.6}>
              <TextField
                size="small"
                placeholder={
                  activeRoomId
                    ? 'Message · /ask <вопрос> · /narrator <вопрос> · @narrator ...'
                    : 'Join room to chat'
                }
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                multiline
                minRows={isShortViewport ? 1 : 2}
                maxRows={4}
                disabled={!activeRoomId}
              />
              {activeRoomId && !isShortViewport && (
                <Typography variant="caption" sx={panelMetaTextSx}>
                  Ask narrator from chat: ` /ask Почему в risk режиме больше аварий? `
                </Typography>
              )}

              {attachments.length > 0 && (
                <Stack direction="row" spacing={0.4} flexWrap="wrap">
                  {attachments.map((attachment, index) => (
                    <Chip
                      key={`${attachment.name}-${index}`}
                      size="small"
                      label={`${attachment.name} · ${Math.round(attachment.size / 1024)}KB`}
                      onDelete={() =>
                        setAttachments((current) =>
                          current.filter((_, attachmentIndex) => attachmentIndex !== index),
                        )
                      }
                    />
                  ))}
                </Stack>
              )}

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={0.6}>
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  hidden
                  onChange={handleAttachFiles}
                />
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<AttachFileRoundedIcon />}
                  onClick={() => inputRef.current?.click()}
                  disabled={!activeRoomId}
                  fullWidth
                  sx={panelActionButtonSx}
                >
                  Attach
                </Button>
                <Button
                  size="small"
                  type="submit"
                  variant="contained"
                  endIcon={<SendRoundedIcon />}
                  disabled={!activeRoomId || (!draft.trim() && attachments.length === 0)}
                  fullWidth
                  sx={panelActionButtonSx}
                >
                  Send
                </Button>
              </Stack>
            </Stack>
          </Box>
        </Stack>
      )}
    </Paper>
  );
}
