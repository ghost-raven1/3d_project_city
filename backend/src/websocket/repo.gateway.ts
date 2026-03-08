import {
  Logger,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { InjectModel } from '@nestjs/sequelize';
import { createHash } from 'node:crypto';
import { Op } from 'sequelize';
import { Server, Socket } from 'socket.io';
import { ParseRepositoryDto } from '../common/dto/parse-repository.dto';
import { ParseCancelledError, ParserService } from '../parser/parser.service';
import { RoomMessageModel } from './models/room-message.model';
import { RoomRegistryModel } from './models/room-registry.model';

interface RoomJoinPayload {
  roomId?: string;
  nickname?: string;
  accessKey?: string;
}

interface ChatAttachmentDraft {
  name?: string;
  mimeType?: string;
  dataUrl?: string;
  size?: number;
}

interface ChatAttachment {
  id: string;
  name: string;
  mimeType: string;
  dataUrl: string;
  size: number;
}

interface RoomMessagePayload {
  roomId?: string;
  clientMessageId?: string | null;
  text?: string;
  replyToId?: string | null;
  attachments?: ChatAttachmentDraft[];
}

interface RoomPointerPayload {
  roomId?: string;
  x?: number;
  y?: number;
  z?: number;
  path?: string | null;
}

interface NarratorStatsPayload {
  totalFiles?: number;
  totalCommits?: number;
  topLanguage?: string | null;
  hotspotPath?: string | null;
}

type NarratorActionType =
  | 'repo_loaded'
  | 'mode_change'
  | 'focus_file'
  | 'timeline_shift'
  | 'compare_toggle'
  | 'tour_mode'
  | 'ui_interaction'
  | 'chat_question'
  | 'manual';

type NarratorManualCue = 'story' | 'joke' | 'hype' | 'retro';

type NarratorAckStatus =
  | 'accepted'
  | 'throttled'
  | 'busy'
  | 'invalid'
  | 'disabled';

interface NarratorActionPayload {
  requestId?: string;
  type?: string;
  repoUrl?: string;
  viewMode?: 'overview' | 'architecture' | 'risk' | 'stack';
  timelineLabel?: string;
  selectedPath?: string | null;
  compareEnabled?: boolean;
  compareLabel?: string | null;
  tourMode?: 'orbit' | 'drone' | 'walk' | null;
  interaction?: string | null;
  interactionValue?: string | null;
  sourceMessageId?: string | null;
  question?: string | null;
  manualCue?: NarratorManualCue;
  stats?: NarratorStatsPayload;
}

interface NarratorActionNormalized {
  type: NarratorActionType;
  repoUrl: string;
  viewMode: 'overview' | 'architecture' | 'risk' | 'stack';
  timelineLabel: string;
  selectedPath: string | null;
  compareEnabled: boolean;
  compareLabel: string | null;
  tourMode: 'orbit' | 'drone' | 'walk' | null;
  interaction: string | null;
  interactionValue: string | null;
  sourceMessageId: string | null;
  question: string | null;
  manualCue: NarratorManualCue | null;
  stats: {
    totalFiles: number | null;
    totalCommits: number | null;
    topLanguage: string | null;
    hotspotPath: string | null;
  };
}

type NarratorUiPanelTarget =
  | 'chat'
  | 'narrator'
  | 'insights'
  | 'branch_map'
  | 'minimap'
  | 'file_card';

type NarratorUiAction =
  | { type: 'set_view_mode'; value: 'overview' | 'architecture' | 'risk' | 'stack' }
  | { type: 'set_tour_mode'; value: 'orbit' | 'drone' | 'walk' }
  | { type: 'set_compare_enabled'; value: 'on' | 'off' }
  | { type: 'set_compare_mode'; value: 'ghost' | 'split' }
  | { type: 'set_panel_visibility'; target: NarratorUiPanelTarget; value: 'on' | 'off' }
  | { type: 'set_branch_only_mode'; value: 'on' | 'off' }
  | { type: 'select_file'; value: string };

interface NarratorStoryPayload {
  id: string;
  action: NarratorActionType;
  requestId: string | null;
  text: string;
  createdAt: string;
  uiActions?: NarratorUiAction[];
}

interface NarratorStatusPayload {
  status: 'idle' | 'thinking' | 'error';
  message?: string;
  requestId: string | null;
}

interface NarratorAckPayload {
  requestId: string | null;
  status: NarratorAckStatus;
  retryAfterMs?: number;
  message?: string;
}

interface RoomParticipant {
  socketId: string;
  nickname: string;
  color: string;
  joinedAt: string;
}

interface RoomMessage {
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

interface RoomPointer {
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

interface RoomState {
  participants: Map<string, RoomParticipant>;
  messages: RoomMessage[];
  pointers: Map<string, RoomPointer>;
}

const wsCorsOrigin = (() => {
  const raw = process.env.WS_CORS_ORIGIN ?? process.env.CORS_ORIGIN ?? '*';
  const normalized = raw.trim();
  const nodeEnv = (process.env.NODE_ENV ?? 'development').toLowerCase();
  if (!normalized || normalized === '*') {
    if (nodeEnv === 'production') {
      throw new Error(
        'WS_CORS_ORIGIN must be explicit in production (wildcard is not allowed).',
      );
    }
    return '*';
  }

  const list = normalized
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  if (list.length === 0) {
    if (nodeEnv === 'production') {
      throw new Error(
        'WS_CORS_ORIGIN must contain at least one explicit origin in production.',
      );
    }
    return '*';
  }
  return list;
})();

function envPositiveInt(
  name: string,
  fallback: number,
  minimum = 1,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const normalized = Math.round(parsed);
  if (normalized < minimum || normalized > maximum) {
    return fallback;
  }
  return normalized;
}

@WebSocketGateway({
  namespace: '/parser',
  cors: {
    origin: wsCorsOrigin,
  },
})
export class RepoGateway {
  private static readonly MAX_ROOM_MESSAGES = 140;
  private static readonly MAX_PERSISTED_ROOM_MESSAGES = 600;
  private static readonly MAX_ATTACHMENTS_PER_MESSAGE = 3;
  private static readonly MAX_ATTACHMENT_BYTES = 700_000;
  private static readonly MAX_ATTACHMENTS_TOTAL_BYTES = 1_800_000;
  private static readonly MAX_CHAT_TEXT = 2400;
  private static readonly PARSE_MIN_INTERVAL_MS = envPositiveInt(
    'PARSE_MIN_INTERVAL_MS',
    3500,
    250,
    120_000,
  );
  private static readonly MAX_ACTIVE_PARSE_RUNS = envPositiveInt(
    'MAX_ACTIVE_PARSE_RUNS',
    3,
    1,
    128,
  );
  private static readonly ROOM_MESSAGE_MIN_INTERVAL_MS = envPositiveInt(
    'ROOM_MESSAGE_MIN_INTERVAL_MS',
    180,
    20,
    30_000,
  );
  private static readonly POINTER_MIN_INTERVAL_MS = 40;
  private static readonly ROOM_ACCESS_KEY_MAX_LENGTH = 64;
  private static readonly NARRATOR_MIN_INPUT_INTERVAL_MS = envPositiveInt(
    'NARRATOR_MIN_INTERVAL_MS',
    1400,
    200,
    120_000,
  );
  private static readonly NARRATOR_MAX_FIELD_LENGTH = envPositiveInt(
    'NARRATOR_MAX_PROMPT_CHARS',
    320,
    60,
    20_000,
  );
  private static readonly NARRATOR_TIMEOUT_MS = envPositiveInt(
    'NARRATOR_TIMEOUT_MS',
    35000,
    1000,
    300_000,
  );
  private static readonly NARRATOR_FALLBACK_TIMEOUT_MS = envPositiveInt(
    'NARRATOR_FALLBACK_TIMEOUT_MS',
    5500,
    500,
    120_000,
  );
  private static readonly NARRATOR_DISCOVERY_TIMEOUT_MS = envPositiveInt(
    'NARRATOR_DISCOVERY_TIMEOUT_MS',
    6500,
    500,
    120_000,
  );
  private static readonly NARRATOR_RETRY_ATTEMPTS = envPositiveInt(
    'NARRATOR_RETRY_ATTEMPTS',
    2,
    1,
    10,
  );
  private static readonly NARRATOR_RETRY_BACKOFF_MS = envPositiveInt(
    'NARRATOR_RETRY_BACKOFF_MS',
    420,
    20,
    30_000,
  );
  private static readonly NARRATOR_NUM_PREDICT = envPositiveInt(
    'NARRATOR_NUM_PREDICT',
    120,
    16,
    1200,
  );
  private static readonly NARRATOR_MIN_NUM_PREDICT = envPositiveInt(
    'NARRATOR_MIN_NUM_PREDICT',
    56,
    8,
    1200,
  );
  private static readonly NARRATOR_ENDPOINT_PREFERENCE = (
    process.env.NARRATOR_ENDPOINT_PREFERENCE ?? 'chat-first'
  )
    .trim()
    .toLowerCase();
  private static readonly NARRATOR_ENABLED = (process.env.NARRATOR_ENABLED ?? 'true') !== 'false';
  private static readonly NARRATOR_REQUIRE_LLM =
    (process.env.NARRATOR_REQUIRE_LLM ?? 'false') === 'true';
  private static readonly NARRATOR_BOT_ID = 'narrator_bot';
  private static readonly NARRATOR_BOT_NAME = 'Narrator';
  private static readonly NARRATOR_BOT_COLOR = '#6ec9ff';

  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RepoGateway.name);
  private readonly parseRunByClient = new Map<string, number>();
  private readonly activeParseRuns = new Set<number>();
  private readonly parseTickByClient = new Map<string, number>();
  private readonly roomByClient = new Map<string, string>();
  private readonly rooms = new Map<string, RoomState>();
  private readonly roomLoadById = new Map<string, Promise<RoomState>>();
  private readonly roomMessageTickByClient = new Map<string, number>();
  private readonly pointerTickByClient = new Map<string, number>();
  private readonly persistedTrimTickByRoom = new Map<string, number>();
  private readonly narratorTickByClient = new Map<string, number>();
  private readonly narratorFlightByClient = new Set<string>();

  constructor(
    private readonly parserService: ParserService,
    @InjectModel(RoomRegistryModel)
    private readonly roomRegistryModel: typeof RoomRegistryModel,
    @InjectModel(RoomMessageModel)
    private readonly roomMessageModel: typeof RoomMessageModel,
  ) {}

  private hashColorFromSocket(socketId: string): string {
    let hash = 0;
    for (let index = 0; index < socketId.length; index += 1) {
      hash = (hash * 31 + socketId.charCodeAt(index)) | 0;
    }

    const hue = Math.abs(hash) % 360;
    return `hsl(${hue} 78% 58%)`;
  }

  private normalizeRoomId(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim().toLowerCase();
    if (normalized.length < 2 || normalized.length > 48) {
      return null;
    }

    if (!/^[a-z0-9][a-z0-9-_]*$/.test(normalized)) {
      return null;
    }

    return normalized;
  }

  private normalizeNickname(value: unknown, fallback: string): string {
    if (typeof value !== 'string') {
      return fallback;
    }

    const normalized = value.trim().replace(/\s+/g, ' ');
    if (!normalized) {
      return fallback;
    }

    return normalized.slice(0, 32);
  }

  private normalizeAccessKey(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();
    if (!normalized) {
      return null;
    }

    return normalized.slice(0, RepoGateway.ROOM_ACCESS_KEY_MAX_LENGTH);
  }

  private normalizeNarratorField(value: unknown, fallback = ''): string {
    if (typeof value !== 'string') {
      return fallback;
    }

    const normalized = value.trim();
    if (!normalized) {
      return fallback;
    }

    return normalized.slice(0, RepoGateway.NARRATOR_MAX_FIELD_LENGTH);
  }

  private normalizeNarratorRequestId(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim().slice(0, 72);
    if (!normalized) {
      return null;
    }

    return /^[a-zA-Z0-9_-]+$/.test(normalized) ? normalized : null;
  }

  private normalizeClientMessageId(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim().slice(0, 80);
    if (!normalized) {
      return null;
    }

    return /^[a-zA-Z0-9_-]+$/.test(normalized) ? normalized : null;
  }

  private emitNarratorAck(client: Socket, payload: NarratorAckPayload): void {
    client.emit('narrator_ack', payload);
  }

  private normalizeNarratorAction(
    payload: NarratorActionPayload | undefined,
  ): NarratorActionNormalized | null {
    const candidateType = this.normalizeNarratorField(payload?.type).toLowerCase();
    const allowed: NarratorActionType[] = [
      'repo_loaded',
      'mode_change',
      'focus_file',
      'timeline_shift',
      'compare_toggle',
      'tour_mode',
      'ui_interaction',
      'chat_question',
      'manual',
    ];
    const type = allowed.includes(candidateType as NarratorActionType)
      ? (candidateType as NarratorActionType)
      : null;
    if (!type) {
      return null;
    }

    const viewModeRaw = this.normalizeNarratorField(payload?.viewMode, 'overview');
    const viewMode =
      viewModeRaw === 'architecture' ||
      viewModeRaw === 'risk' ||
      viewModeRaw === 'stack'
        ? viewModeRaw
        : 'overview';
    const timelineLabel = this.normalizeNarratorField(payload?.timelineLabel, 'Latest');
    const repoUrl = this.normalizeNarratorField(payload?.repoUrl, '');
    const selectedPath = this.normalizeNarratorField(payload?.selectedPath, '') || null;
    const compareLabel = this.normalizeNarratorField(payload?.compareLabel, '') || null;
    const tourModeRaw = this.normalizeNarratorField(payload?.tourMode, '');
    const tourMode =
      tourModeRaw === 'orbit' || tourModeRaw === 'drone' || tourModeRaw === 'walk'
        ? tourModeRaw
        : null;
    const interaction =
      this.normalizeNarratorField(payload?.interaction, '') || null;
    const interactionValue =
      this.normalizeNarratorField(payload?.interactionValue, '') || null;
    const sourceMessageId =
      this.normalizeClientMessageId(payload?.sourceMessageId) ?? null;
    const question =
      this.normalizeNarratorField(payload?.question, '') || null;
    const manualCueRaw = this.normalizeNarratorField(payload?.manualCue, '').toLowerCase();
    const manualCue =
      manualCueRaw === 'story' ||
      manualCueRaw === 'joke' ||
      manualCueRaw === 'hype' ||
      manualCueRaw === 'retro'
        ? (manualCueRaw as NarratorManualCue)
        : null;

    const rawStats =
      payload?.stats && typeof payload.stats === 'object' ? payload.stats : undefined;
    const totalFiles =
      typeof rawStats?.totalFiles === 'number' && Number.isFinite(rawStats.totalFiles)
        ? Math.max(0, Math.round(rawStats.totalFiles))
        : null;
    const totalCommits =
      typeof rawStats?.totalCommits === 'number' && Number.isFinite(rawStats.totalCommits)
        ? Math.max(0, Math.round(rawStats.totalCommits))
        : null;
    const topLanguage = this.normalizeNarratorField(rawStats?.topLanguage, '') || null;
    const hotspotPath = this.normalizeNarratorField(rawStats?.hotspotPath, '') || null;
    if (type === 'chat_question' && !question) {
      return null;
    }

    return {
      type,
      repoUrl,
      viewMode,
      timelineLabel,
      selectedPath,
      compareEnabled: Boolean(payload?.compareEnabled),
      compareLabel,
      tourMode,
      interaction,
      interactionValue,
      sourceMessageId,
      question,
      manualCue,
      stats: {
        totalFiles,
        totalCommits,
        topLanguage,
        hotspotPath,
      },
    };
  }

  private normalizeNarratorPathCandidate(value: string): string | null {
    const normalized = value
      .trim()
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/[.,!?;:]+$/g, '')
      .replace(/\\/g, '/');
    if (!normalized || normalized.length > RepoGateway.NARRATOR_MAX_FIELD_LENGTH) {
      return null;
    }
    if (!/^[a-zA-Z0-9_./-]+$/.test(normalized)) {
      return null;
    }
    if (!normalized.includes('/') && !normalized.includes('.')) {
      return null;
    }
    return normalized;
  }

  private describeNarratorUiAction(action: NarratorUiAction): string {
    if (action.type === 'set_view_mode') {
      return `view_mode=${action.value}`;
    }
    if (action.type === 'set_tour_mode') {
      return `tour_mode=${action.value}`;
    }
    if (action.type === 'set_compare_enabled') {
      return `compare=${action.value}`;
    }
    if (action.type === 'set_compare_mode') {
      return `compare_mode=${action.value}`;
    }
    if (action.type === 'set_panel_visibility') {
      return `panel.${action.target}=${action.value}`;
    }
    if (action.type === 'set_branch_only_mode') {
      return `branch_only=${action.value}`;
    }
    return `select_file=${action.value}`;
  }

  private extractNarratorUiActions(action: NarratorActionNormalized): NarratorUiAction[] {
    if (action.type !== 'chat_question' || !action.question) {
      return [];
    }

    const question = action.question.trim();
    if (!question) {
      return [];
    }

    const lower = question.toLowerCase();
    const hasCommandVerb =
      /(переключ|смени|установ|включ|выключ|покажи|скрой|открой|закрой|убери|выбери|фокус|перейд|set|switch|turn|show|hide|open|close|focus|jump|select)/i.test(
        lower,
      ) || /^(режим|mode)\b/i.test(lower);
    const hasUiKeyword =
      /(режим|mode|риск|risk|architecture|архитектур|stack|стек|overview|обзор|сравн|compare|baseline|тур|tour|orbit|drone|walk|чат|chat|рассказчик|narrator|инсайт|insight|ветк|branch|миникарт|minimap|файл|file|path|путь)/i.test(
        lower,
      );
    if (!hasCommandVerb || !hasUiKeyword) {
      return [];
    }

    const actions: NarratorUiAction[] = [];
    const seen = new Set<string>();
    const pushAction = (next: NarratorUiAction) => {
      const signature = JSON.stringify(next);
      if (seen.has(signature)) {
        return;
      }
      seen.add(signature);
      actions.push(next);
    };

    const wantsEnable =
      /(включ|покажи|открой|enable|show|open|turn on|\bon\b)/i.test(lower);
    const wantsDisable =
      /(выключ|скрой|закрой|убери|disable|hide|close|turn off|\boff\b)/i.test(lower);
    const toggleValue: 'on' | 'off' | null =
      wantsEnable === wantsDisable ? null : wantsEnable ? 'on' : 'off';

    const viewMode: 'overview' | 'architecture' | 'risk' | 'stack' | null =
      /\brisk\b|риск/i.test(lower)
        ? 'risk'
        : /\barchitecture\b|архитектур/i.test(lower)
          ? 'architecture'
          : /\bstack\b|стек/i.test(lower)
            ? 'stack'
            : /\boverview\b|обзор|общий вид/i.test(lower)
              ? 'overview'
              : null;
    if (viewMode) {
      pushAction({
        type: 'set_view_mode',
        value: viewMode,
      });
    }

    const tourMode: 'orbit' | 'drone' | 'walk' | null =
      /\borbit\b|орбит|облет|полет/i.test(lower)
        ? 'orbit'
        : /\bdrone\b|дрон/i.test(lower)
          ? 'drone'
          : /\bwalk\b|пеш|прогул/i.test(lower)
            ? 'walk'
            : null;
    if (tourMode) {
      pushAction({
        type: 'set_tour_mode',
        value: tourMode,
      });
    }

    if (/\bcompare\b|сравн|baseline|базов/i.test(lower)) {
      const compareEnabled: 'on' | 'off' = toggleValue ?? 'on';
      pushAction({
        type: 'set_compare_enabled',
        value: compareEnabled,
      });
      if (compareEnabled === 'on') {
        if (/\bsplit\b|раздел|side by side|сайд бай сайд/i.test(lower)) {
          pushAction({
            type: 'set_compare_mode',
            value: 'split',
          });
        } else if (/\bghost\b|призрак|прозрач/i.test(lower)) {
          pushAction({
            type: 'set_compare_mode',
            value: 'ghost',
          });
        }
      }
    }

    if (toggleValue) {
      const panelRules: Array<{ target: NarratorUiPanelTarget; pattern: RegExp }> = [
        { target: 'chat', pattern: /\bchat\b|чат/i },
        { target: 'narrator', pattern: /\bnarrator\b|рассказчик|нарратор/i },
        { target: 'insights', pattern: /\binsight\b|инсайт/i },
        { target: 'branch_map', pattern: /\bbranch\b|ветк/i },
        { target: 'minimap', pattern: /\bminimap\b|миникарт/i },
        { target: 'file_card', pattern: /file card|карточк|details|детал/i },
      ];
      panelRules.forEach((rule) => {
        if (rule.pattern.test(lower)) {
          pushAction({
            type: 'set_panel_visibility',
            target: rule.target,
            value: toggleValue,
          });
        }
      });
    }

    if (/branch only|только\s+ветк|ветки\s+только/i.test(lower)) {
      pushAction({
        type: 'set_branch_only_mode',
        value: toggleValue ?? 'on',
      });
    }

    const quotedPathMatch = question.match(/`([^`\n]{3,260})`/);
    const explicitPathMatch = question.match(
      /(?:файл|file|path|путь)\s+([a-zA-Z0-9_./\\-]{3,260})/i,
    );
    const pathCandidate = quotedPathMatch?.[1] ?? explicitPathMatch?.[1] ?? null;
    const normalizedPath =
      pathCandidate ? this.normalizeNarratorPathCandidate(pathCandidate) : null;
    if (
      normalizedPath &&
      /файл|file|path|путь|focus|jump|открой|перейд|выбери|select/i.test(lower)
    ) {
      pushAction({
        type: 'select_file',
        value: normalizedPath,
      });
    }

    return actions.slice(0, 6);
  }

  private buildNarratorPrompt(
    action: NarratorActionNormalized,
    uiActions: NarratorUiAction[],
  ): string {
    const parts: string[] = [];
    parts.push(
      'Ты локальный рассказчик 3D-города репозитория. Пиши ТОЛЬКО по-русски, 2-4 коротких предложения.',
    );
    parts.push(
      'Говори образно, но опирайся только на факты из контекста. Не выдумывай коммиты/файлы/технологии.',
    );
    parts.push(
      'Сохраняй характер: живой тон, легкая ирония и уместные короткие шутки без токсичности и грубости.',
    );
    parts.push(
      'Если данных мало, честно скажи это и дай аккуратную интерпретацию динамики проекта.',
    );
    parts.push('');
    parts.push('Контекст действия:');
    parts.push(`- type: ${action.type}`);
    parts.push(`- view mode: ${action.viewMode}`);
    parts.push(`- timeline: ${action.timelineLabel}`);
    if (action.repoUrl) {
      parts.push(`- repo: ${action.repoUrl}`);
    }
    if (action.selectedPath) {
      parts.push(`- focus file: ${action.selectedPath}`);
    }
    if (action.compareEnabled) {
      parts.push(`- compare: enabled${action.compareLabel ? ` (${action.compareLabel})` : ''}`);
    }
    if (action.tourMode) {
      parts.push(`- tour mode: ${action.tourMode}`);
    }
    if (action.interaction) {
      parts.push(`- ui interaction: ${action.interaction}`);
    }
    if (action.interactionValue) {
      parts.push(`- ui value: ${action.interactionValue}`);
    }
    if (action.sourceMessageId) {
      parts.push(`- source message id: ${action.sourceMessageId}`);
    }
    if (action.question) {
      parts.push(`- user question: ${action.question}`);
    }
    if (action.manualCue) {
      parts.push(`- narrator cue: ${action.manualCue}`);
    }
    if (uiActions.length > 0) {
      parts.push(
        `- narrator ui actions: ${uiActions
          .map((item) => this.describeNarratorUiAction(item))
          .join(', ')}`,
      );
    }
    if (action.stats.totalFiles !== null) {
      parts.push(`- total files: ${action.stats.totalFiles}`);
    }
    if (action.stats.totalCommits !== null) {
      parts.push(`- total commits: ${action.stats.totalCommits}`);
    }
    if (action.stats.topLanguage) {
      parts.push(`- top language: ${action.stats.topLanguage}`);
    }
    if (action.stats.hotspotPath) {
      parts.push(`- hotspot: ${action.stats.hotspotPath}`);
    }
    parts.push('');
    if (action.type === 'chat_question' && action.question) {
      parts.push(
        'Пользователь задал вопрос в чате. Дай ПРЯМОЙ ответ на вопрос, затем 1 короткую практическую интерпретацию по сцене/репозиторию.',
      );
      parts.push(
        'Если в контексте недостаточно данных, честно скажи это и предложи, что проверить в интерфейсе дальше.',
      );
      if (uiActions.length > 0) {
        parts.push(
          'Команды интерфейса уже приняты к исполнению. Кратко и конкретно подтверди примененные изменения.',
        );
      }
    } else if (action.type === 'ui_interaction') {
      parts.push(
        'Объясни, что изменилось в интерфейсе/сцене из-за действия пользователя и как это меняет чтение города.',
      );
    } else if (action.manualCue === 'joke') {
      parts.push(
        'Сделай микро-шутку про текущее состояние проекта (1 фраза), затем 1-2 полезных наблюдения по контексту.',
      );
    } else if (action.manualCue === 'hype') {
      parts.push(
        'Дай энергичный кадр: подчеркни импульс команды и ближайшую точку роста, без выдуманных фактов.',
      );
    } else if (action.manualCue === 'retro') {
      parts.push(
        'Добавь легкую поп-культурную отсылку (кино/игры/фантастика) ТОЛЬКО как метафору и только если уместно.',
      );
    } else {
      parts.push(
        'Сформулируй один "сюжетный кадр" о состоянии репозитория именно сейчас и что это означает для команды.',
      );
    }
    return parts.join('\n');
  }

  private fallbackNarratorText(
    action: NarratorActionNormalized,
    uiActions: NarratorUiAction[] = [],
  ): string {
    if (action.type === 'chat_question' && action.question) {
      const uiSummary =
        uiActions.length > 0
          ? ` Применил команды интерфейса: ${uiActions
              .map((item) => this.describeNarratorUiAction(item))
              .join(', ')}.`
          : '';
      return `Вопрос из чата: "${action.question}". По текущему контексту сцены отвечаю аккуратно: используйте текущий режим и hotspot-зоны как карту приоритетов; если нужен точный вывод, откройте нужный файл и сдвиньте таймлайн к проблемному периоду.${uiSummary}`;
    }
    if (action.type === 'ui_interaction') {
      const interaction = action.interaction ?? 'ui.change';
      const value = action.interactionValue ? ` (${action.interactionValue})` : '';
      return `Интерфейс обновлен: ${interaction}${value}. Город перестроил акценты сцены под этот выбор, так что текущие сигналы и маршруты читаются по-новому.`;
    }
    if (action.type === 'manual' && action.manualCue === 'joke') {
      return `Город сегодня в режиме стендапа: баги пытаются выйти на бис, но команда уже держит микрофон и план фиксов. По текущему срезу видно, где напряжение выше и куда лучше направить следующий аккуратный коммит.`;
    }
    if (action.type === 'manual' && action.manualCue === 'hype') {
      return `Темп высокий: город светится как релизный трейлер, а ключевые узлы явно готовы к следующему рывку. Если держать фокус на hotspot-зонах, прогресс будет заметен уже в ближайших итерациях.`;
    }
    if (action.type === 'manual' && action.manualCue === 'retro') {
      return `Сцена выглядит как хороший sci-fi эпизод: у каждого квартала своя роль, а у hotspot-узлов свой сюжет. Разница в том, что тут спецэффекты подкреплены реальной историей коммитов.`;
    }
    if (action.type === 'manual' && action.manualCue === 'story') {
      return `Новый сюжетный кадр: город держится на ритме изменений, а самые активные файлы формируют его главный проспект. Команде стоит читать этот ритм как карту приоритетов на следующий спринт.`;
    }
    if (action.type === 'focus_file' && action.selectedPath) {
      return `Фокус сместился на ${action.selectedPath}. Этот участок кода сейчас в центре истории города: по нему лучше всего читать текущую напряженность изменений.`;
    }
    if (action.type === 'mode_change') {
      return `Режим ${action.viewMode} меняет ракурс рассказа: теперь город подсвечивает другую грань репозитория и его архитектурной динамики.`;
    }
    if (action.type === 'timeline_shift') {
      return `Лента времени сдвинулась к ${action.timelineLabel}. Город показывает другой срез эволюции репозитория и акцентирует, как менялся темп разработки.`;
    }
    if (action.type === 'tour_mode' && action.tourMode) {
      return `Режим тура переключен на ${action.tourMode}. История теперь подается через новую траекторию движения по городу и его активным зонам.`;
    }
    if (action.type === 'repo_loaded') {
      const files = action.stats.totalFiles ?? 'n/a';
      const commits = action.stats.totalCommits ?? 'n/a';
      return `Город поднят: файлов ${files}, коммитов ${commits}. Перед нами карта проекта, где уже видны главные кварталы и очаги технического напряжения.`;
    }
    return 'Город обновил сцену репозитория: структура и активность продолжают складываться в единую историю изменений.';
  }

  private async resolveAvailableNarratorModel(
    baseUrl: string,
    preferredModel: string,
  ): Promise<string | null> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      RepoGateway.NARRATOR_DISCOVERY_TIMEOUT_MS,
    );
    try {
      const response = await fetch(`${baseUrl}/api/tags`, {
        method: 'GET',
        signal: controller.signal,
      });
      if (!response.ok) {
        return null;
      }

      const json = (await response.json()) as {
        models?: Array<{ name?: unknown; model?: unknown }>;
      };
      const names = (json.models ?? [])
        .map((item) => {
          if (typeof item?.name === 'string' && item.name.trim()) {
            return item.name.trim();
          }
          if (typeof item?.model === 'string' && item.model.trim()) {
            return item.model.trim();
          }
          return null;
        })
        .filter((value): value is string => value !== null);

      if (names.length === 0) {
        return null;
      }
      if (names.includes(preferredModel)) {
        return preferredModel;
      }
      return names[0] ?? null;
    } finally {
      clearTimeout(timer);
    }
  }

  private async requestNarration(prompt: string): Promise<string | null> {
    const baseUrlRaw = (
      process.env.NARRATOR_BASE_URL ??
      process.env.OLLAMA_BASE_URL ??
      ''
    ).trim();
    if (!baseUrlRaw) {
      return null;
    }
    const baseUrl = baseUrlRaw.replace(/\/+$/, '');

    const model = (process.env.NARRATOR_MODEL ?? 'qwen2.5:3b-instruct').trim();
    if (!model) {
      return null;
    }

    const parseErrorMessage = (raw: string): string | null => {
      const normalized = raw.trim();
      if (!normalized) {
        return null;
      }
      try {
        const json = JSON.parse(normalized) as { error?: unknown; message?: unknown };
        if (typeof json.error === 'string' && json.error.trim()) {
          return json.error.trim().slice(0, 320);
        }
        if (typeof json.message === 'string' && json.message.trim()) {
          return json.message.trim().slice(0, 320);
        }
      } catch {
        // Keep plain text message when response is not JSON.
      }
      return normalized.slice(0, 320);
    };

    const parseNetworkErrorMessage = (error: unknown): string => {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          return `request timeout after ${RepoGateway.NARRATOR_TIMEOUT_MS}ms`;
        }
        const normalized = error.message.trim();
        return normalized ? normalized.slice(0, 320) : 'network request failed';
      }
      return 'network request failed';
    };
    const sleep = (ms: number): Promise<void> =>
      new Promise((resolve) => {
        setTimeout(resolve, ms);
      });
    const requestWithTimeout = async (
      url: string,
      init: RequestInit,
    ): Promise<Response> => {
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        RepoGateway.NARRATOR_TIMEOUT_MS,
      );
      try {
        return await fetch(url, {
          ...init,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
    };

    type NarratorEndpoint = '/api/generate' | '/api/chat';
    type NarratorRequestResult = {
      ok: boolean;
      status: number;
      text: string | null;
      errorMessage: string | null;
      endpoint: NarratorEndpoint;
    };
    const endpointOrder: NarratorEndpoint[] =
      RepoGateway.NARRATOR_ENDPOINT_PREFERENCE === 'generate-first'
        ? ['/api/generate', '/api/chat']
        : ['/api/chat', '/api/generate'];
    const requestGenerate = async (
      modelName: string,
      numPredict: number,
    ): Promise<NarratorRequestResult> => {
      let response: Response;
      try {
        response = await requestWithTimeout(`${baseUrl}/api/generate`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: modelName,
            prompt,
            stream: false,
            options: {
              temperature: 0.72,
              top_p: 0.9,
              num_predict: numPredict,
            },
          }),
        });
      } catch (error) {
        return {
          ok: false,
          status: 0,
          text: null,
          errorMessage: parseNetworkErrorMessage(error),
          endpoint: '/api/generate',
        };
      }

      if (!response.ok) {
        const raw = await response.text();
        return {
          ok: false,
          status: response.status,
          text: null,
          errorMessage: parseErrorMessage(raw),
          endpoint: '/api/generate',
        };
      }

      const raw = await response.text();
      let text: string | null = null;
      try {
        const json = JSON.parse(raw) as { response?: unknown };
        if (typeof json.response === 'string') {
          const normalized = json.response.trim();
          text = normalized ? normalized.slice(0, 900) : null;
        }
      } catch {
        const normalized = raw.trim();
        text = normalized ? normalized.slice(0, 900) : null;
      }

      return {
        ok: true,
        status: response.status,
        text,
        errorMessage: null,
        endpoint: '/api/generate',
      };
    };

    const requestChat = async (
      modelName: string,
      numPredict: number,
    ): Promise<NarratorRequestResult> => {
      let response: Response;
      try {
        response = await requestWithTimeout(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: modelName,
            messages: [
              {
                role: 'user',
                content: prompt,
              },
            ],
            stream: false,
            options: {
              temperature: 0.72,
              top_p: 0.9,
              num_predict: numPredict,
            },
          }),
        });
      } catch (error) {
        return {
          ok: false,
          status: 0,
          text: null,
          errorMessage: parseNetworkErrorMessage(error),
          endpoint: '/api/chat',
        };
      }

      if (!response.ok) {
        const raw = await response.text();
        return {
          ok: false,
          status: response.status,
          text: null,
          errorMessage: parseErrorMessage(raw),
          endpoint: '/api/chat',
        };
      }

      const raw = await response.text();
      let text: string | null = null;
      try {
        const json = JSON.parse(raw) as {
          message?: { content?: unknown };
          response?: unknown;
        };
        if (typeof json.message?.content === 'string') {
          const normalized = json.message.content.trim();
          text = normalized ? normalized.slice(0, 900) : null;
        } else if (typeof json.response === 'string') {
          const normalized = json.response.trim();
          text = normalized ? normalized.slice(0, 900) : null;
        }
      } catch {
        const normalized = raw.trim();
        text = normalized ? normalized.slice(0, 900) : null;
      }

      return {
        ok: true,
        status: response.status,
        text,
        errorMessage: null,
        endpoint: '/api/chat',
      };
    };
    const requestEndpoint = async (
      endpoint: NarratorEndpoint,
      modelName: string,
      numPredict: number,
    ): Promise<NarratorRequestResult> =>
      endpoint === '/api/generate'
        ? requestGenerate(modelName, numPredict)
        : requestChat(modelName, numPredict);

    const formatFailure = (
      endpoint: '/api/generate' | '/api/chat',
      modelName: string,
      status: number,
      errorMessage: string | null,
    ): string =>
      `${endpoint} model="${modelName}" HTTP ${status}${
        errorMessage ? `: ${errorMessage}` : ''
      }`;
    const isRetryableFailure = (
      status: number,
      errorMessage: string | null,
    ): boolean => {
      if (status === 0 || status >= 500) {
        return true;
      }
      const normalized = (errorMessage ?? '').toLowerCase();
      return (
        normalized.includes('timeout') ||
        normalized.includes('aborted') ||
        normalized.includes('busy') ||
        normalized.includes('overload') ||
        normalized.includes('unavailable') ||
        normalized.includes('temporar')
      );
    };
    const predictForAttempt = (attempt: number, maxAttempts: number): number => {
      const baseCandidate = Math.floor(RepoGateway.NARRATOR_NUM_PREDICT);
      const base = Number.isFinite(baseCandidate) ? Math.max(24, baseCandidate) : 120;
      const minCandidate = Math.floor(RepoGateway.NARRATOR_MIN_NUM_PREDICT);
      const min = Math.max(
        16,
        Math.min(
          base,
          Number.isFinite(minCandidate) ? minCandidate : Math.min(base, 56),
        ),
      );
      if (maxAttempts <= 1 || base <= min) {
        return base;
      }
      const ratio = (attempt - 1) / Math.max(1, maxAttempts - 1);
      return Math.round(base - (base - min) * ratio);
    };

    const requestWithEndpointFallback = async (
      modelName: string,
      failures: string[],
    ): Promise<string | null> => {
      const maxAttempts = Math.max(1, Math.floor(RepoGateway.NARRATOR_RETRY_ATTEMPTS));
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const numPredict = predictForAttempt(attempt, maxAttempts);
        let retryable = false;

        for (const endpoint of endpointOrder) {
          const endpointAttempt = await requestEndpoint(
            endpoint,
            modelName,
            numPredict,
          );
          if (endpointAttempt.ok) {
            return endpointAttempt.text;
          }

          failures.push(
            `${formatFailure(
              endpointAttempt.endpoint,
              modelName,
              endpointAttempt.status,
              endpointAttempt.errorMessage,
            )} [attempt ${attempt}/${maxAttempts}; num_predict=${numPredict}]`,
          );
          retryable =
            retryable ||
            isRetryableFailure(
              endpointAttempt.status,
              endpointAttempt.errorMessage,
            );
        }

        if (!retryable || attempt >= maxAttempts) {
          break;
        }

        const delayMs = Math.max(
          0,
          Math.floor(RepoGateway.NARRATOR_RETRY_BACKOFF_MS * attempt),
        );
        if (delayMs > 0) {
          await sleep(delayMs);
        }
      }
      return null;
    };

    const failures: string[] = [];
    const primaryText = await requestWithEndpointFallback(model, failures);
    if (primaryText) {
      return primaryText;
    }

    let fallbackModel: string | null = null;
    try {
      fallbackModel = await this.resolveAvailableNarratorModel(
        baseUrl,
        model,
      );
    } catch (error) {
      failures.push(
        `model-discovery HTTP 0: ${parseNetworkErrorMessage(error)}`,
      );
    }

    if (fallbackModel && fallbackModel !== model) {
      this.logger.warn(
        `Narrator primary model "${model}" unavailable, retrying with "${fallbackModel}"`,
      );
      const fallbackText = await requestWithEndpointFallback(fallbackModel, failures);
      if (fallbackText) {
        return fallbackText;
      }
    }

    if (failures.length === 0) {
      throw new Error('Narrator LLM request failed without HTTP details.');
    }

    throw new Error(failures.slice(0, 6).join(' | '));
  }

  private hashRoomAccessKey(roomId: string, accessKey: string): string {
    return createHash('sha256').update(`${roomId}:${accessKey}`).digest('hex');
  }

  private normalizeChatText(value: unknown): string {
    if (typeof value !== 'string') {
      return '';
    }

    return value.trim().slice(0, RepoGateway.MAX_CHAT_TEXT);
  }

  private normalizeAttachmentName(value: unknown): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      return 'attachment';
    }

    return value.trim().slice(0, 96);
  }

  private normalizeAttachmentMime(value: unknown): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      return 'application/octet-stream';
    }

    return value.trim().slice(0, 64);
  }

  private estimateAttachmentPayloadBytes(dataUrl: string): number {
    const commaIndex = dataUrl.indexOf(',');
    if (commaIndex <= 0 || commaIndex === dataUrl.length - 1) {
      return 0;
    }

    const meta = dataUrl.slice(0, commaIndex).toLowerCase();
    const payload = dataUrl.slice(commaIndex + 1);
    if (payload.length === 0) {
      return 0;
    }

    if (meta.includes(';base64')) {
      const normalized = payload.replace(/\s+/g, '');
      const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
      return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
    }

    return Buffer.byteLength(payload, 'utf8');
  }

  private normalizeAttachments(value: unknown): ChatAttachment[] {
    if (!Array.isArray(value) || value.length === 0) {
      return [];
    }

    const take = value.slice(0, RepoGateway.MAX_ATTACHMENTS_PER_MESSAGE);
    const result: ChatAttachment[] = [];
    let totalBytes = 0;

    take.forEach((item, index) => {
      if (!item || typeof item !== 'object') {
        return;
      }

      const draft = item as ChatAttachmentDraft;
      if (typeof draft.dataUrl !== 'string' || !draft.dataUrl.startsWith('data:')) {
        return;
      }

      const payloadBytes = this.estimateAttachmentPayloadBytes(draft.dataUrl);
      if (payloadBytes <= 0 || payloadBytes > RepoGateway.MAX_ATTACHMENT_BYTES) {
        return;
      }

      if (totalBytes + payloadBytes > RepoGateway.MAX_ATTACHMENTS_TOTAL_BYTES) {
        return;
      }

      totalBytes += payloadBytes;
      const reportedSize =
        typeof draft.size === 'number' && Number.isFinite(draft.size)
          ? Math.max(0, Math.min(payloadBytes, Math.round(draft.size)))
          : payloadBytes;
      result.push({
        id: `att_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`,
        name: this.normalizeAttachmentName(draft.name),
        mimeType: this.normalizeAttachmentMime(draft.mimeType),
        dataUrl: draft.dataUrl,
        size: reportedSize,
      });
    });

    return result;
  }

  private parsePersistedAttachments(raw: unknown): ChatAttachment[] {
    let parsed: unknown = raw;
    if (typeof raw === 'string') {
      try {
        parsed = JSON.parse(raw) as unknown;
      } catch {
        return [];
      }
    }

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .flatMap((item, index) => {
        if (!item || typeof item !== 'object') {
          return [];
        }

        const candidate = item as Partial<ChatAttachment>;
        if (
          typeof candidate.dataUrl !== 'string' ||
          !candidate.dataUrl.startsWith('data:')
        ) {
          return [];
        }

        const payloadBytes = this.estimateAttachmentPayloadBytes(candidate.dataUrl);
        if (
          payloadBytes <= 0 ||
          payloadBytes > RepoGateway.MAX_ATTACHMENT_BYTES
        ) {
          return [];
        }

        const size =
          typeof candidate.size === 'number' && Number.isFinite(candidate.size)
            ? Math.max(0, Math.min(payloadBytes, Math.round(candidate.size)))
            : payloadBytes;

        return [
          {
            id:
              typeof candidate.id === 'string' && candidate.id.trim().length > 0
                ? candidate.id.slice(0, 120)
                : `att_${index}`,
            name: this.normalizeAttachmentName(candidate.name),
            mimeType: this.normalizeAttachmentMime(candidate.mimeType),
            dataUrl: candidate.dataUrl,
            size,
          },
        ];
      })
      .slice(0, RepoGateway.MAX_ATTACHMENTS_PER_MESSAGE);
  }

  private toRoomMessage(entry: RoomMessageModel): RoomMessage {
    return {
      id: entry.id,
      roomId: entry.roomId,
      authorId: entry.authorId,
      authorName: entry.authorName,
      authorColor: entry.authorColor,
      text: entry.text,
      replyToId: entry.replyToId,
      attachments: this.parsePersistedAttachments(entry.attachments),
      createdAt: new Date(entry.sentAt).toISOString(),
    };
  }

  private async ensureRoomAccess(
    roomId: string,
    accessKey: string | null,
    clientId: string,
  ): Promise<boolean> {
    const providedHash = accessKey
      ? this.hashRoomAccessKey(roomId, accessKey)
      : null;
    const now = new Date();

    const [registry] = await this.roomRegistryModel.findOrCreate({
      where: { roomId },
      defaults: {
        roomId,
        accessKeyHash: providedHash,
        createdBy: clientId,
        lastActiveAt: now,
      } as RoomRegistryModel,
    });

    if (registry.accessKeyHash && registry.accessKeyHash !== providedHash) {
      return false;
    }

    registry.lastActiveAt = now;
    await registry.save();
    return true;
  }

  private async getOrCreateRoom(roomId: string): Promise<RoomState> {
    const existing = this.rooms.get(roomId);
    if (existing) {
      return existing;
    }

    const inFlight = this.roomLoadById.get(roomId);
    if (inFlight) {
      return inFlight;
    }

    const loadPromise = (async () => {
      const persistedMessages = await this.roomMessageModel.findAll({
        where: { roomId },
        order: [['sentAt', 'DESC']],
        limit: RepoGateway.MAX_ROOM_MESSAGES,
      });
      const created: RoomState = {
        participants: new Map<string, RoomParticipant>(),
        messages: persistedMessages.reverse().map((item) => this.toRoomMessage(item)),
        pointers: new Map<string, RoomPointer>(),
      };
      this.rooms.set(roomId, created);
      return created;
    })().finally(() => {
      this.roomLoadById.delete(roomId);
    });

    this.roomLoadById.set(roomId, loadPromise);
    return loadPromise;
  }

  private async trimPersistedRoomMessages(roomId: string): Promise<void> {
    const keepRows = await this.roomMessageModel.findAll({
      where: { roomId },
      attributes: ['id'],
      order: [['sentAt', 'DESC']],
      limit: RepoGateway.MAX_PERSISTED_ROOM_MESSAGES,
      raw: true,
    });
    const keepIds = keepRows
      .map((row) => {
        const candidate = row as { id?: unknown };
        return typeof candidate.id === 'string' ? candidate.id : null;
      })
      .filter((value): value is string => Boolean(value));

    if (keepIds.length === 0) {
      return;
    }

    await this.roomMessageModel.destroy({
      where: {
        roomId,
        id: {
          [Op.notIn]: keepIds,
        },
      },
    });
  }

  private async persistRoomMessage(message: RoomMessage): Promise<void> {
    await this.roomMessageModel.upsert({
      id: message.id,
      roomId: message.roomId,
      authorId: message.authorId,
      authorName: message.authorName,
      authorColor: message.authorColor,
      text: message.text,
      replyToId: message.replyToId,
      attachments: message.attachments,
      sentAt: new Date(message.createdAt),
    } as RoomMessageModel);

    const tick = (this.persistedTrimTickByRoom.get(message.roomId) ?? 0) + 1;
    if (tick >= 20) {
      this.persistedTrimTickByRoom.set(message.roomId, 0);
      await this.trimPersistedRoomMessages(message.roomId);
    } else {
      this.persistedTrimTickByRoom.set(message.roomId, tick);
    }
  }

  private resolveNarratorReplyTarget(
    room: RoomState,
    clientId: string,
    action: NarratorActionNormalized,
  ): string | null {
    if (action.sourceMessageId) {
      const exact = room.messages.find(
        (item) => item.id === action.sourceMessageId && item.authorId === clientId,
      );
      if (exact) {
        return exact.id;
      }
    }

    const normalizedQuestion = (action.question ?? '').trim().toLowerCase();
    const now = Date.now();
    let recentAuthorMessageId: string | null = null;
    for (let index = room.messages.length - 1; index >= 0; index -= 1) {
      const message = room.messages[index];
      if (!message || message.authorId !== clientId) {
        continue;
      }

      if (!recentAuthorMessageId) {
        recentAuthorMessageId = message.id;
      }

      const ageMs = Math.max(
        0,
        now - new Date(message.createdAt).getTime(),
      );
      if (ageMs > 180_000) {
        break;
      }

      if (!normalizedQuestion) {
        continue;
      }

      const text = message.text.trim().toLowerCase();
      if (!text) {
        continue;
      }

      if (
        text === normalizedQuestion ||
        text.includes(normalizedQuestion) ||
        normalizedQuestion.includes(text)
      ) {
        return message.id;
      }
    }

    return recentAuthorMessageId;
  }

  private async publishNarratorRoomMessage(
    client: Socket,
    text: string,
    action: NarratorActionNormalized,
  ): Promise<void> {
    const roomId = this.roomByClient.get(client.id);
    if (!roomId) {
      return;
    }

    const room = await this.getOrCreateRoom(roomId);
    const normalizedText = this.normalizeChatText(text);
    if (!normalizedText) {
      return;
    }

    const replyToCandidate =
      action.type === 'chat_question'
        ? this.resolveNarratorReplyTarget(room, client.id, action)
        : null;
    const replyToId =
      replyToCandidate &&
      room.messages.some((message) => message.id === replyToCandidate)
        ? replyToCandidate
        : null;

    const message: RoomMessage = {
      id: `msg_narrator_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      roomId,
      authorId: RepoGateway.NARRATOR_BOT_ID,
      authorName: RepoGateway.NARRATOR_BOT_NAME,
      authorColor: RepoGateway.NARRATOR_BOT_COLOR,
      text: normalizedText,
      replyToId,
      attachments: [],
      createdAt: new Date().toISOString(),
    };

    room.messages.push(message);
    if (room.messages.length > RepoGateway.MAX_ROOM_MESSAGES) {
      room.messages.splice(0, room.messages.length - RepoGateway.MAX_ROOM_MESSAGES);
    }

    try {
      await this.persistRoomMessage(message);
    } catch (error) {
      this.logger.warn(
        `Failed to persist narrator room message for room "${roomId}": ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }

    this.server.to(roomId).emit('room_message', message);
  }

  private emitRoomParticipants(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }

    const participants = Array.from(room.participants.values()).sort(
      (a, b) => a.joinedAt.localeCompare(b.joinedAt),
    );

    this.server.to(roomId).emit('room_participants', {
      roomId,
      participants,
    });
  }

  private leaveRoom(client: Socket): void {
    const roomId = this.roomByClient.get(client.id);
    this.pointerTickByClient.delete(client.id);
    this.roomMessageTickByClient.delete(client.id);
    this.narratorTickByClient.delete(client.id);
    this.narratorFlightByClient.delete(client.id);
    if (!roomId) {
      return;
    }

    this.roomByClient.delete(client.id);
    client.leave(roomId);

    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }

    room.participants.delete(client.id);
    const pointerDeleted = room.pointers.delete(client.id);
    if (pointerDeleted) {
      this.server.to(roomId).emit('room_pointer_remove', {
        roomId,
        socketId: client.id,
      });
    }

    if (room.participants.size === 0) {
      room.messages.length = 0;
      room.pointers.clear();
      this.rooms.delete(roomId);
      this.persistedTrimTickByRoom.delete(roomId);
      return;
    }

    this.emitRoomParticipants(roomId);
  }

  @SubscribeMessage('room_join')
  async handleRoomJoin(
    @MessageBody() payload: RoomJoinPayload,
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    const roomId = this.normalizeRoomId(payload?.roomId);
    if (!roomId) {
      client.emit('room_error', { message: 'Invalid room id.' });
      return;
    }

    const accessKey = this.normalizeAccessKey(payload?.accessKey);
    const allowed = await this.ensureRoomAccess(roomId, accessKey, client.id);
    if (!allowed) {
      client.emit('room_error', { message: 'Access key is invalid for this room.' });
      return;
    }

    this.leaveRoom(client);

    const room = await this.getOrCreateRoom(roomId);
    const participant: RoomParticipant = {
      socketId: client.id,
      nickname: this.normalizeNickname(payload?.nickname, `Guest-${client.id.slice(0, 4)}`),
      color: this.hashColorFromSocket(client.id),
      joinedAt: new Date().toISOString(),
    };

    room.participants.set(client.id, participant);
    this.roomByClient.set(client.id, roomId);
    client.join(roomId);

    client.emit('room_state', {
      roomId,
      participants: Array.from(room.participants.values()),
      messages: room.messages.slice(-RepoGateway.MAX_ROOM_MESSAGES),
      pointers: Array.from(room.pointers.values()),
    });
    this.emitRoomParticipants(roomId);
  }

  @SubscribeMessage('room_leave')
  handleRoomLeave(@ConnectedSocket() client: Socket): void {
    this.leaveRoom(client);
  }

  @SubscribeMessage('room_message')
  async handleRoomMessage(
    @MessageBody() payload: RoomMessagePayload,
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    const now = Date.now();
    const previousTick = this.roomMessageTickByClient.get(client.id) ?? 0;
    if (now - previousTick < RepoGateway.ROOM_MESSAGE_MIN_INTERVAL_MS) {
      client.emit('room_error', { message: 'Message rate limited. Please slow down.' });
      return;
    }
    this.roomMessageTickByClient.set(client.id, now);

    const roomId = this.roomByClient.get(client.id);
    if (!roomId) {
      client.emit('room_error', { message: 'Join a room first.' });
      return;
    }

    const payloadRoomId = this.normalizeRoomId(payload?.roomId);
    if (payloadRoomId && payloadRoomId !== roomId) {
      client.emit('room_error', { message: 'Room mismatch.' });
      return;
    }

    const room = this.rooms.get(roomId);
    const participant = room?.participants.get(client.id);
    if (!room || !participant) {
      return;
    }

    const text = this.normalizeChatText(payload?.text);
    const attachments = this.normalizeAttachments(payload?.attachments);
    if (!text && attachments.length === 0) {
      return;
    }
    const clientMessageId = this.normalizeClientMessageId(payload?.clientMessageId);
    if (clientMessageId) {
      const duplicate = room.messages.find((message) => message.id === clientMessageId);
      if (duplicate) {
        return;
      }
    }

    let replyToId: string | null = null;
    if (typeof payload?.replyToId === 'string') {
      const candidate = payload.replyToId.trim();
      if (candidate) {
        const exists = room.messages.some((message) => message.id === candidate);
        if (exists) {
          replyToId = candidate;
        }
      }
    }

    const message: RoomMessage = {
      id: clientMessageId ?? `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      roomId,
      authorId: participant.socketId,
      authorName: participant.nickname,
      authorColor: participant.color,
      text,
      replyToId,
      attachments,
      createdAt: new Date().toISOString(),
    };

    room.messages.push(message);
    if (room.messages.length > RepoGateway.MAX_ROOM_MESSAGES) {
      room.messages.splice(0, room.messages.length - RepoGateway.MAX_ROOM_MESSAGES);
    }

    try {
      await this.persistRoomMessage(message);
    } catch (error) {
      this.logger.warn(
        `Failed to persist room message for room "${roomId}": ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }

    this.server.to(roomId).emit('room_message', message);
  }

  @SubscribeMessage('room_pointer')
  handleRoomPointer(
    @MessageBody() payload: RoomPointerPayload,
    @ConnectedSocket() client: Socket,
  ): void {
    const roomId = this.roomByClient.get(client.id);
    if (!roomId) {
      return;
    }

    const now = Date.now();
    const previousTick = this.pointerTickByClient.get(client.id) ?? 0;
    if (now - previousTick < RepoGateway.POINTER_MIN_INTERVAL_MS) {
      return;
    }
    this.pointerTickByClient.set(client.id, now);

    const payloadRoomId = this.normalizeRoomId(payload?.roomId);
    if (payloadRoomId && payloadRoomId !== roomId) {
      return;
    }

    if (
      typeof payload?.x !== 'number' ||
      typeof payload?.y !== 'number' ||
      typeof payload?.z !== 'number'
    ) {
      return;
    }

    if (
      !Number.isFinite(payload.x) ||
      !Number.isFinite(payload.y) ||
      !Number.isFinite(payload.z)
    ) {
      return;
    }

    const room = this.rooms.get(roomId);
    const participant = room?.participants.get(client.id);
    if (!room || !participant) {
      return;
    }

    const pointer: RoomPointer = {
      roomId,
      socketId: client.id,
      nickname: participant.nickname,
      color: participant.color,
      x: Math.max(-5000, Math.min(5000, payload.x)),
      y: Math.max(-5000, Math.min(5000, payload.y)),
      z: Math.max(-5000, Math.min(5000, payload.z)),
      path:
        typeof payload.path === 'string'
          ? payload.path.slice(0, 420)
          : null,
      updatedAt: now,
    };

    room.pointers.set(client.id, pointer);
    client.to(roomId).emit('room_pointer', pointer);
  }

  @SubscribeMessage('narrator_action')
  async handleNarratorAction(
    @MessageBody() payload: NarratorActionPayload,
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    const requestId = this.normalizeNarratorRequestId(payload?.requestId);
    if (!RepoGateway.NARRATOR_ENABLED) {
      this.emitNarratorAck(client, {
        requestId,
        status: 'disabled',
        message: 'Narrator is disabled on this environment.',
      });
      client.emit('narrator_status', {
        status: 'error',
        message: 'Narrator is disabled on this environment.',
        requestId,
      } satisfies NarratorStatusPayload);
      return;
    }

    const now = Date.now();
    const previousTick = this.narratorTickByClient.get(client.id) ?? 0;
    if (now - previousTick < RepoGateway.NARRATOR_MIN_INPUT_INTERVAL_MS) {
      const retryAfterMs = Math.max(
        0,
        RepoGateway.NARRATOR_MIN_INPUT_INTERVAL_MS - (now - previousTick),
      );
      this.emitNarratorAck(client, {
        requestId,
        status: 'throttled',
        retryAfterMs,
        message: 'Narrator request throttled.',
      });
      client.emit('narrator_status', {
        status: 'idle',
        requestId,
      } satisfies NarratorStatusPayload);
      return;
    }
    if (this.narratorFlightByClient.has(client.id)) {
      this.emitNarratorAck(client, {
        requestId,
        status: 'busy',
        message: 'Narrator is still generating previous story.',
      });
      client.emit('narrator_status', {
        status: 'idle',
        requestId,
      } satisfies NarratorStatusPayload);
      return;
    }

    const action = this.normalizeNarratorAction(payload);
    if (!action) {
      this.emitNarratorAck(client, {
        requestId,
        status: 'invalid',
        message: 'Narrator payload is invalid.',
      });
      client.emit('narrator_status', {
        status: 'error',
        message: 'Narrator payload is invalid.',
        requestId,
      } satisfies NarratorStatusPayload);
      return;
    }

    this.narratorTickByClient.set(client.id, now);
    this.narratorFlightByClient.add(client.id);
    const uiActions = this.extractNarratorUiActions(action);
    this.emitNarratorAck(client, {
      requestId,
      status: 'accepted',
    });
    client.emit('narrator_status', {
      status: 'thinking',
      requestId,
    } satisfies NarratorStatusPayload);

    try {
      const prompt = this.buildNarratorPrompt(action, uiActions);
      let generated: string | null;
      if (RepoGateway.NARRATOR_REQUIRE_LLM) {
        generated = await this.requestNarration(prompt);
      } else {
        const llmAttempt = this.requestNarration(prompt).catch(() => null);
        let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
        let fallbackTimedOut = false;
        const fallbackDeadline = new Promise<null>((resolve) => {
          fallbackTimer = setTimeout(() => {
            fallbackTimedOut = true;
            resolve(null);
          }, RepoGateway.NARRATOR_FALLBACK_TIMEOUT_MS);
        });
        generated = await Promise.race([llmAttempt, fallbackDeadline]);
        if (fallbackTimer !== null) {
          clearTimeout(fallbackTimer);
        }
        if (!generated && fallbackTimedOut) {
          this.logger.debug(
            `Narrator fallback mode activated after ${RepoGateway.NARRATOR_FALLBACK_TIMEOUT_MS}ms for socket ${client.id}.`,
          );
        }
      }
      if (!generated && RepoGateway.NARRATOR_REQUIRE_LLM) {
        throw new Error('Narrator LLM returned empty response.');
      }

      const text = generated ?? this.fallbackNarratorText(action, uiActions);
      if (action.type === 'chat_question') {
        await this.publishNarratorRoomMessage(client, text, action);
      }
      const story: NarratorStoryPayload = {
        id: `story_${now}_${Math.random().toString(36).slice(2, 8)}`,
        action: action.type,
        requestId,
        text,
        createdAt: new Date().toISOString(),
        ...(uiActions.length > 0 ? { uiActions } : {}),
      };
      client.emit('narrator_story', story);
      client.emit('narrator_status', {
        status: 'idle',
        requestId,
      } satisfies NarratorStatusPayload);
    } catch (error) {
      this.logger.warn(
        `Narrator failed for socket ${client.id}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      if (RepoGateway.NARRATOR_REQUIRE_LLM) {
        client.emit('narrator_status', {
          status: 'error',
          message: 'Narrator LLM unavailable: no fallback allowed.',
          requestId,
        } satisfies NarratorStatusPayload);
        return;
      }

      const story: NarratorStoryPayload = {
        id: `story_fallback_${now}_${Math.random().toString(36).slice(2, 8)}`,
        action: action.type,
        requestId,
        text: this.fallbackNarratorText(action, uiActions),
        createdAt: new Date().toISOString(),
        ...(uiActions.length > 0 ? { uiActions } : {}),
      };
      if (action.type === 'chat_question') {
        await this.publishNarratorRoomMessage(client, story.text, action);
      }
      client.emit('narrator_story', story);
      client.emit('narrator_status', {
        status: 'error',
        message: 'Narrator fallback mode: local LLM unavailable.',
        requestId,
      } satisfies NarratorStatusPayload);
    } finally {
      this.narratorFlightByClient.delete(client.id);
    }
  }

  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    }),
  )
  @SubscribeMessage('parse')
  async handleParse(
    @MessageBody() dto: ParseRepositoryDto,
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    const now = Date.now();
    const previousTick = this.parseTickByClient.get(client.id) ?? 0;
    if (now - previousTick < RepoGateway.PARSE_MIN_INTERVAL_MS) {
      client.emit('error', {
        message: `Parse request throttled. Retry in ${Math.max(
          0,
          RepoGateway.PARSE_MIN_INTERVAL_MS - (now - previousTick),
        )}ms.`,
      });
      return;
    }
    if (this.activeParseRuns.size >= RepoGateway.MAX_ACTIVE_PARSE_RUNS) {
      client.emit('error', {
        message: 'Parser is busy. Try again in a few seconds.',
      });
      return;
    }
    this.parseTickByClient.set(client.id, now);

    const previousRunId = this.parseRunByClient.get(client.id);
    if (typeof previousRunId === 'number') {
      this.activeParseRuns.delete(previousRunId);
    }

    const runId = Date.now() + Math.random();
    this.activeParseRuns.add(runId);
    this.parseRunByClient.set(client.id, runId);
    const isActive = () =>
      this.parseRunByClient.get(client.id) === runId && client.connected;

    try {
      const result = await this.parserService.parseRepository(
        dto.repoUrl,
        (progress) => {
          if (!isActive()) {
            return;
          }
          client.emit('progress', progress);
        },
        (partial) => {
          if (!isActive()) {
            return;
          }
          client.emit('partial_result', partial);
        },
        () => isActive(),
        dto.githubToken,
      );

      if (!isActive()) {
        return;
      }
      client.emit('result', result);
    } catch (error: any) {
      if (!isActive()) {
        return;
      }
      if (error instanceof ParseCancelledError) {
        this.logger.log(`Parse cancelled for socket ${client.id}.`);
        return;
      }

      const message =
        error?.response?.message ?? error?.message ?? 'Failed to parse repository.';

      this.logger.error(message);
      client.emit('error', { message });
    } finally {
      this.activeParseRuns.delete(runId);
    }
  }

  handleDisconnect(client: Socket): void {
    const runId = this.parseRunByClient.get(client.id);
    if (typeof runId === 'number') {
      this.activeParseRuns.delete(runId);
    }
    this.parseRunByClient.delete(client.id);
    this.parseTickByClient.delete(client.id);
    this.roomMessageTickByClient.delete(client.id);
    this.pointerTickByClient.delete(client.id);
    this.narratorTickByClient.delete(client.id);
    this.narratorFlightByClient.delete(client.id);
    this.leaveRoom(client);
  }
}
