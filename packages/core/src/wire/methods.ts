import type * as herdr from '../protocol/herdr-types.generated';

/** Every method herdr's schema declares. */
export type HerdrMethod = herdr.Request['method'];

/** The `params` object a method takes, from the generated schema types. */
export type ParamsOf<M extends HerdrMethod> = Extract<herdr.Request, { method: M }>['params'];

/** The JSON shape a required result field must have; `any` accepts every value. */
export type FieldKind = 'string' | 'integer' | 'boolean' | 'array' | 'object' | 'any';

type ResultFields = Partial<
  Record<herdr.ResponseResult['type'], Readonly<Record<string, FieldKind>>>
>;

/**
 * The `result` variants the app consumes (by their `type` tag), each with its required top-level
 * fields per herdr's success_response schema, `type` excluded: the envelope already establishes
 * success, so a result without its tag still decodes. A test re-derives this table from the
 * schema so drift fails loudly.
 */
export const RESULT_FIELDS = {
  pong: { version: 'string', protocol: 'integer' },
  agent_explain: { explain: 'any' },
  agent_info: { agent: 'object' },
  agent_prompted: { agent: 'object' },
  agent_started: { agent: 'object', argv: 'array' },
  agent_list: { agents: 'array' },
  pane_process_info: { process_info: 'object' },
  pane_read: { read: 'object' },
  plugin_enabled: { plugin: 'object' },
  plugin_list: { plugins: 'array' },
  session_snapshot: { snapshot: 'object' },
  subscription_started: {},
  tab_created: { tab: 'object', root_pane: 'object' },
  tab_info: { tab: 'object' },
  ok: {},
  workspace_created: { workspace: 'object', tab: 'object', root_pane: 'object' },
  workspace_info: { workspace: 'object' },
  worktree_created: { workspace: 'object', tab: 'object', root_pane: 'object', worktree: 'object' },
  worktree_list: { source: 'object', worktrees: 'array' },
  worktree_removed: { workspace_id: 'string', path: 'string', forced: 'boolean' },
} as const satisfies ResultFields;

export type ResultTag = keyof typeof RESULT_FIELDS;

export const RESULT_TAGS = Object.keys(RESULT_FIELDS) as readonly ResultTag[];

/** A decoded result payload; its `type` tag is optional, as on the Swift side. */
export type ResultOf<T extends ResultTag> = Omit<
  Extract<herdr.ResponseResult, { type: T }>,
  'type'
> & { readonly type?: T };

/**
 * The methods the app calls and the result each answers with. The schema does not link methods
 * to result variants, so this table is curated (mirrors the Swift transport's call sites).
 */
export const METHOD_RESULT = {
  ping: 'pong',
  'agent.explain': 'agent_explain',
  'agent.focus': 'agent_info',
  'agent.get': 'agent_info',
  'agent.list': 'agent_list',
  'agent.prompt': 'agent_prompted',
  'agent.read': 'pane_read',
  'agent.rename': 'agent_info',
  'agent.send_keys': 'ok',
  'agent.start': 'agent_started',
  'events.subscribe': 'subscription_started',
  'tab.create': 'tab_created',
  'tab.rename': 'tab_info',
  'tab.close': 'ok',
  'pane.process_info': 'pane_process_info',
  'pane.read': 'pane_read',
  'pane.send_input': 'ok',
  'pane.close': 'ok',
  'plugin.enable': 'plugin_enabled',
  'plugin.list': 'plugin_list',
  'session.snapshot': 'session_snapshot',
  'workspace.create': 'workspace_created',
  'workspace.rename': 'workspace_info',
  'workspace.close': 'ok',
  'worktree.create': 'worktree_created',
  'worktree.list': 'worktree_list',
  'worktree.remove': 'worktree_removed',
} as const satisfies Partial<Record<HerdrMethod, ResultTag>>;

export type WireMethod = keyof typeof METHOD_RESULT;

export type MethodResult<M extends WireMethod> = ResultOf<(typeof METHOD_RESULT)[M]>;

export const WIRE_METHODS = Object.keys(METHOD_RESULT) as readonly WireMethod[];
