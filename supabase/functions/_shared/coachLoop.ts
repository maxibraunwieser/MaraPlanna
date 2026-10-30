// Talking to the Claude Messages API: streaming, and the loop that lets Claude call tools.
// The HTTP call is injected, so the tests run without network and without a key.

import { PROPOSAL_TOOLS, TOOL_DEFS, runTool, type CoachAction, type ToolState } from './coachTools.ts';

export type Json = Record<string, unknown>;

export interface TextBlock {
  type: 'text';
  text: string;
}
export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Json;
}
export type Block = TextBlock | ToolUseBlock;

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string | (Block | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean })[];
}

/** What the website sees while the answer is being written (one JSON object per line). */
export type CoachEvent =
  | { t: 'text'; d: string }
  | { t: 'status'; d: string }
  | { t: 'actions'; d: CoachAction[] }
  | { t: 'done'; id: string }
  | { t: 'error'; d: string };

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// Server-sent events
// ---------------------------------------------------------------------------

/** Parses an SSE byte stream into { event, data } records; works across chunk boundaries. */
export async function* parseSse(body: ReadableStream<Uint8Array>): AsyncGenerator<{ event: string; data: string }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const flush = function* (block: string) {
    let event = 'message';
    const data: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
    }
    if (data.length) yield { event, data: data.join('\n') };
  };
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    buffer = buffer.replace(/\r\n/g, '\n');
    let at: number;
    while ((at = buffer.indexOf('\n\n')) >= 0) {
      yield* flush(buffer.slice(0, at));
      buffer = buffer.slice(at + 2);
    }
    if (done) break;
  }
  if (buffer.trim()) yield* flush(buffer);
}

export interface StreamResult {
  blocks: Block[];
  stopReason: string | null;
  usage: { input: number; output: number; cacheRead: number };
}

/** One streamed model call. Calls onText for every piece of text as it arrives. */
export async function streamMessage(
  fetchFn: typeof fetch,
  cfg: { apiKey: string; baseUrl: string; model: string; maxTokens: number; system: string; messages: ChatMessage[]; signal?: AbortSignal },
  onText: (s: string) => void,
): Promise<StreamResult> {
  const res = await fetchFn(`${cfg.baseUrl}/v1/messages`, {
    method: 'POST',
    signal: cfg.signal,
    headers: { 'content-type': 'application/json', 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: cfg.maxTokens,
      stream: true,
      // The data block is large and stays the same within a conversation: cache it.
      system: [{ type: 'text', text: cfg.system, cache_control: { type: 'ephemeral' } }],
      tools: TOOL_DEFS,
      messages: cfg.messages,
    }),
  });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '');
    let message = '';
    try {
      message = String((JSON.parse(detail) as { error?: { message?: string } }).error?.message ?? '');
    } catch {
      // not JSON
    }
    throw new ApiError(res.status, message || `The AI service answered with status ${res.status}.`);
  }

  const blocks: (Block & { _json?: string })[] = [];
  const usage = { input: 0, output: 0, cacheRead: 0 };
  let stopReason: string | null = null;
  for await (const { event, data } of parseSse(res.body)) {
    if (event === 'ping') continue;
    let msg: Json;
    try {
      msg = JSON.parse(data) as Json;
    } catch {
      continue;
    }
    const type = (msg.type as string | undefined) ?? event;
    if (type === 'error') {
      const e = msg.error as { message?: string } | undefined;
      throw new ApiError(500, e?.message ?? 'The AI service reported an error.');
    } else if (type === 'message_start') {
      const u = ((msg.message as Json | undefined)?.usage ?? {}) as Json;
      usage.input = Number(u.input_tokens ?? 0);
      usage.cacheRead = Number(u.cache_read_input_tokens ?? 0);
    } else if (type === 'content_block_start') {
      const b = msg.content_block as Json;
      const i = Number(msg.index);
      blocks[i] = b.type === 'tool_use' ? { type: 'tool_use', id: String(b.id), name: String(b.name), input: {}, _json: '' } : { type: 'text', text: String(b.text ?? '') };
    } else if (type === 'content_block_delta') {
      const i = Number(msg.index);
      const delta = msg.delta as Json;
      const block = blocks[i];
      if (delta.type === 'text_delta' && block?.type === 'text') {
        const t = String(delta.text ?? '');
        block.text += t;
        if (t) onText(t);
      } else if (delta.type === 'input_json_delta' && block?.type === 'tool_use') {
        block._json = (block._json ?? '') + String(delta.partial_json ?? '');
      }
    } else if (type === 'message_delta') {
      stopReason = ((msg.delta as Json | undefined)?.stop_reason as string | undefined) ?? stopReason;
      usage.output = Number(((msg.usage as Json | undefined)?.output_tokens ?? usage.output) as number);
    }
  }
  const out: Block[] = [];
  for (const b of blocks) {
    if (!b) continue;
    if (b.type === 'tool_use') {
      let input: Json = {};
      try {
        input = b._json ? (JSON.parse(b._json) as Json) : {};
      } catch {
        input = {};
      }
      out.push({ type: 'tool_use', id: b.id, name: b.name, input });
    } else if (b.text) {
      out.push(b);
    }
  }
  return { blocks: out, stopReason, usage };
}

// ---------------------------------------------------------------------------
// The loop
// ---------------------------------------------------------------------------

const STATUS: Record<string, string> = {
  get_activities: 'Looking through your activities…',
  get_activity_laps: 'Checking the laps of that run…',
  get_workouts: 'Looking at your planned sessions…',
  get_wellness: 'Checking your recovery data…',
  propose_move_workout: 'Preparing a change to your plan…',
  propose_skip_workouts: 'Preparing a change to your plan…',
  propose_scale_workouts: 'Preparing a change to your plan…',
  propose_edit_workouts: 'Preparing a change to your plan…',
  propose_plan_changes: 'Preparing a change to your plan…',
};

export interface CoachRun {
  fetchFn: typeof fetch;
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens: number;
  system: string;
  history: ChatMessage[];
  state: ToolState;
  emit: (e: CoachEvent) => void;
  signal?: AbortSignal;
  maxRounds?: number;
}

export interface CoachOutcome {
  text: string;
  actions: CoachAction[];
  usage: { input: number; output: number; cacheRead: number };
}

/** Lets Claude answer, calling tools as needed (at most maxRounds model calls). */
export async function runCoach(run: CoachRun): Promise<CoachOutcome> {
  const messages = [...run.history];
  const usage = { input: 0, output: 0, cacheRead: 0 };
  let text = '';
  const rounds = run.maxRounds ?? 5;

  for (let round = 0; round < rounds; round++) {
    // Keep paragraphs of different rounds apart.
    let first = true;
    const result = await streamMessage(
      run.fetchFn,
      { apiKey: run.apiKey, baseUrl: run.baseUrl, model: run.model, maxTokens: run.maxTokens, system: run.system, messages, signal: run.signal },
      (t) => {
        if (first && text && !text.endsWith('\n')) {
          text += '\n\n';
          run.emit({ t: 'text', d: '\n\n' });
        }
        first = false;
        text += t;
        run.emit({ t: 'text', d: t });
      },
    );
    usage.input += result.usage.input;
    usage.output += result.usage.output;
    usage.cacheRead += result.usage.cacheRead;

    const calls = result.blocks.filter((b): b is ToolUseBlock => b.type === 'tool_use');
    if (result.stopReason !== 'tool_use' || !calls.length) break;

    messages.push({ role: 'assistant', content: result.blocks });
    const results: { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }[] = [];
    for (const call of calls) {
      run.emit({ t: 'status', d: STATUS[call.name] ?? 'Thinking…' });
      let out;
      try {
        out = await runTool(call.name, call.input, run.state);
      } catch (e) {
        out = { content: `The tool failed: ${(e as Error).message}`, isError: true };
      }
      results.push({ type: 'tool_result', tool_use_id: call.id, content: out.content, ...(out.isError ? { is_error: true } : {}) });
    }
    messages.push({ role: 'user', content: results });
    if (round === rounds - 1) {
      text += (text ? '\n\n' : '') + '(I stopped here to keep the answer short. Ask me to continue if you want more.)';
      run.emit({ t: 'text', d: '\n\n(I stopped here to keep the answer short. Ask me to continue if you want more.)' });
    }
  }
  if (run.state.actions.length) run.emit({ t: 'actions', d: run.state.actions });
  return { text: text.trim(), actions: run.state.actions, usage };
}

export { PROPOSAL_TOOLS };
