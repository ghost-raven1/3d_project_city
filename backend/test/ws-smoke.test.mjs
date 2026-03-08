import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { io } from 'socket.io-client';

const STARTUP_TIMEOUT_MS = 30000;
const SOCKET_CONNECT_TIMEOUT_MS = 8000;
const TEST_DATABASE_URL = (
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  ''
).trim();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomPort() {
  return 4500 + Math.floor(Math.random() * 300);
}

async function isPortOpen(port) {
  return await new Promise((resolve) => {
    const socket = net.createConnection({
      host: '127.0.0.1',
      port,
    });

    socket.once('connect', () => {
      socket.end();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
    socket.setTimeout(450, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function waitForEvent(socket, event, { timeoutMs = 6000, predicate = null } = {}) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(event, onEvent);
      reject(new Error(`Timeout waiting for event "${event}"`));
    }, timeoutMs);

    const onEvent = (payload) => {
      if (predicate && !predicate(payload)) {
        return;
      }
      clearTimeout(timeout);
      socket.off(event, onEvent);
      resolve(payload);
    };

    socket.on(event, onEvent);
  });
}

async function connectSocket(namespaceUrl, label) {
  const socket = io(namespaceUrl, {
    transports: ['websocket'],
    autoConnect: true,
    reconnection: false,
    timeout: SOCKET_CONNECT_TIMEOUT_MS,
  });

  const [connected] = await Promise.race([
    once(socket, 'connect').then(() => [true]),
    once(socket, 'connect_error').then(([error]) => {
      throw new Error(
        `${label} failed to connect: ${error?.message ?? 'unknown connect_error'}`,
      );
    }),
    sleep(SOCKET_CONNECT_TIMEOUT_MS).then(() => {
      throw new Error(`${label} connect timeout`);
    }),
  ]);

  if (!connected) {
    throw new Error(`${label} did not connect`);
  }

  return socket;
}

async function stopBackend(processHandle) {
  if (processHandle.exitCode !== null) {
    return;
  }

  processHandle.kill('SIGTERM');
  const exited = await Promise.race([
    once(processHandle, 'exit').then(() => true),
    sleep(3000).then(() => false),
  ]);

  if (!exited && processHandle.exitCode === null) {
    processHandle.kill('SIGKILL');
    await once(processHandle, 'exit');
  }
}

async function startBackendServer() {
  const backendDir = process.cwd();
  const distMainPath = path.join(backendDir, 'dist', 'main.js');
  if (!fs.existsSync(distMainPath)) {
    throw new Error('backend/dist/main.js is missing. Run `npm run build --workspace backend` first.');
  }

  const port = randomPort();

  let logs = '';
  const backend = spawn(process.execPath, ['dist/main.js'], {
    cwd: backendDir,
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_URL: TEST_DATABASE_URL,
      DB_SYNCHRONIZE: 'true',
      DB_SSL: 'false',
      CORS_ORIGIN: '*',
      WS_CORS_ORIGIN: '*',
      NARRATOR_ENABLED: 'true',
      NARRATOR_BASE_URL: 'http://127.0.0.1:65535',
      NARRATOR_TIMEOUT_MS: '1200',
      NARRATOR_MIN_INTERVAL_MS: '1800',
      NARRATOR_MAX_PROMPT_CHARS: '320',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const appendLog = (chunk) => {
    logs += chunk.toString('utf8');
    if (logs.length > 20000) {
      logs = logs.slice(-20000);
    }
  };
  backend.stdout?.on('data', appendLog);
  backend.stderr?.on('data', appendLog);

  const startedAt = Date.now();
  while (Date.now() - startedAt < STARTUP_TIMEOUT_MS) {
    if (backend.exitCode !== null) {
      throw new Error(`Backend exited early with code ${backend.exitCode}\n${logs}`);
    }

    if (await isPortOpen(port)) {
      return {
        backend,
        port,
        logs: () => logs,
      };
    }
    await sleep(140);
  }

  throw new Error(`Backend startup timeout on port ${port}\n${logs}`);
}

const wsSmoke = TEST_DATABASE_URL ? test : test.skip;

wsSmoke(
  'ws smoke: rooms/chat/pointers/narrator ack+timeout flow',
  { timeout: 70000 },
  async (t) => {
    const server = await startBackendServer();
    const sockets = [];
    t.after(async () => {
      sockets.forEach((socket) => socket.close());
      await stopBackend(server.backend);
    });

    const wsBaseUrl = `http://127.0.0.1:${server.port}/parser`;
    const s1 = await connectSocket(wsBaseUrl, 's1');
    const s2 = await connectSocket(wsBaseUrl, 's2');
    sockets.push(s1, s2);

    const roomId = `smoke-room-${Date.now().toString(36)}`;
    const accessKey = 'smoke-secret';

    const joinStatePromise = waitForEvent(s1, 'room_state', {
      predicate: (payload) => payload?.roomId === roomId,
    });
    s1.emit('room_join', {
      roomId,
      nickname: 'Smoke-A',
      accessKey,
    });
    const joinState = await joinStatePromise;
    assert.equal(joinState.roomId, roomId);
    assert.ok(Array.isArray(joinState.participants));

    const denyPromise = waitForEvent(s2, 'room_error', {
      predicate: (payload) =>
        typeof payload?.message === 'string' &&
        payload.message.toLowerCase().includes('access key'),
    });
    s2.emit('room_join', {
      roomId,
      nickname: 'Smoke-B',
      accessKey: 'wrong-key',
    });
    await denyPromise;

    const s2JoinPromise = waitForEvent(s2, 'room_state', {
      predicate: (payload) => payload?.roomId === roomId,
    });
    s2.emit('room_join', {
      roomId,
      nickname: 'Smoke-B',
      accessKey,
    });
    const s2RoomState = await s2JoinPromise;
    assert.ok((s2RoomState.participants ?? []).length >= 2);

    const attachmentDataUrl = `data:text/plain;base64,${Buffer.from('smoke test file').toString('base64')}`;
    const firstMessagePromise = waitForEvent(s2, 'room_message', {
      predicate: (message) => message?.authorId === s1.id && message?.text === 'hello from smoke',
    });
    s1.emit('room_message', {
      roomId,
      text: 'hello from smoke',
      attachments: [
        {
          name: 'smoke.txt',
          mimeType: 'text/plain',
          dataUrl: attachmentDataUrl,
          size: 15,
        },
      ],
    });
    const firstMessage = await firstMessagePromise;
    assert.equal(firstMessage.attachments.length, 1);
    assert.equal(firstMessage.attachments[0]?.name, 'smoke.txt');

    const replyMessagePromise = waitForEvent(s1, 'room_message', {
      predicate: (message) =>
        message?.authorId === s2.id &&
        message?.replyToId === firstMessage.id &&
        message?.text === 'ack reply',
    });
    s2.emit('room_message', {
      roomId,
      text: 'ack reply',
      replyToId: firstMessage.id,
      attachments: [],
    });
    const replyMessage = await replyMessagePromise;
    assert.equal(replyMessage.replyToId, firstMessage.id);

    const pointerPromise = waitForEvent(s2, 'room_pointer', {
      predicate: (payload) => payload?.socketId === s1.id && payload?.path === 'src/app.ts',
    });
    s1.emit('room_pointer', {
      roomId,
      x: 1.4,
      y: 0.2,
      z: -0.8,
      path: 'src/app.ts',
    });
    const pointer = await pointerPromise;
    assert.equal(pointer.path, 'src/app.ts');

    const pointerRemovePromise = waitForEvent(s2, 'room_pointer_remove', {
      predicate: (payload) => payload?.socketId === s1.id,
    });
    s1.emit('room_leave');
    await pointerRemovePromise;
    s2.emit('room_leave');

    const rejoinPromise = waitForEvent(s1, 'room_state', {
      predicate: (payload) => payload?.roomId === roomId,
    });
    s1.emit('room_join', {
      roomId,
      nickname: 'Smoke-A',
      accessKey,
    });
    const rejoinState = await rejoinPromise;
    assert.ok((rejoinState.messages ?? []).length >= 2);
    assert.ok((rejoinState.messages ?? []).some((item) => item.replyToId === firstMessage.id));

    const acceptedRequestId = `narrator_${Date.now().toString(36)}_1`;
    const narratorAckAcceptedPromise = waitForEvent(s1, 'narrator_ack', {
      predicate: (payload) =>
        payload?.requestId === acceptedRequestId && payload?.status === 'accepted',
    });
    const narratorThinkingPromise = waitForEvent(s1, 'narrator_status', {
      predicate: (payload) =>
        payload?.requestId === acceptedRequestId && payload?.status === 'thinking',
    });
    const narratorStoryPromise = waitForEvent(s1, 'narrator_story', {
      timeoutMs: 16000,
      predicate: (payload) => payload?.requestId === acceptedRequestId,
    });
    s1.emit('narrator_action', {
      requestId: acceptedRequestId,
      type: 'repo_loaded',
      repoUrl: 'https://github.com/facebook/react',
      viewMode: 'overview',
      timelineLabel: 'Latest',
      stats: {
        totalFiles: 20,
        totalCommits: 100,
        topLanguage: 'TypeScript',
      },
    });
    await narratorAckAcceptedPromise;
    await narratorThinkingPromise;

    const throttledRequestId = `narrator_${Date.now().toString(36)}_2`;
    const narratorAckThrottledPromise = waitForEvent(s1, 'narrator_ack', {
      predicate: (payload) =>
        payload?.requestId === throttledRequestId &&
        (payload?.status === 'throttled' || payload?.status === 'busy'),
    });
    s1.emit('narrator_action', {
      requestId: throttledRequestId,
      type: 'mode_change',
      viewMode: 'risk',
      timelineLabel: 'Latest',
    });
    await narratorAckThrottledPromise;

    const narratorStory = await narratorStoryPromise;
    assert.equal(narratorStory.requestId, acceptedRequestId);
    assert.ok(typeof narratorStory.text === 'string' && narratorStory.text.length > 0);

    await sleep(1900);
    const chatQuestionRequestId = `narrator_${Date.now().toString(36)}_3`;
    const chatAckPromise = waitForEvent(s1, 'narrator_ack', {
      predicate: (payload) =>
        payload?.requestId === chatQuestionRequestId && payload?.status === 'accepted',
    });
    const chatStoryPromise = waitForEvent(s1, 'narrator_story', {
      timeoutMs: 16000,
      predicate: (payload) => payload?.requestId === chatQuestionRequestId,
    });
    const narratorRoomMessagePromise = waitForEvent(s1, 'room_message', {
      timeoutMs: 16000,
      predicate: (payload) => payload?.authorId === 'narrator_bot',
    });
    s1.emit('narrator_action', {
      requestId: chatQuestionRequestId,
      type: 'chat_question',
      question: 'Что сейчас самое рискованное в проекте?',
      viewMode: 'risk',
      timelineLabel: 'Latest',
    });
    await chatAckPromise;
    const chatStory = await chatStoryPromise;
    assert.equal(chatStory.requestId, chatQuestionRequestId);
    assert.ok(typeof chatStory.text === 'string' && chatStory.text.length > 0);

    const narratorRoomMessage = await narratorRoomMessagePromise;
    assert.equal(narratorRoomMessage.authorId, 'narrator_bot');
    assert.equal(narratorRoomMessage.authorName, 'Narrator');
    assert.ok(
      typeof narratorRoomMessage.text === 'string' &&
        narratorRoomMessage.text.length > 0,
    );
  },
);
