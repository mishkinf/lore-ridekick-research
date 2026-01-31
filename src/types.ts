/**
 * Lore Extension Types (copied from lore for standalone compilation)
 */

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ExtensionQueryOptions {
  query?: string;
  project?: string;
  limit?: number;
  sourceType?: string;
}

export interface ExtensionQueryResult {
  id: string;
  title: string;
  summary: string;
  content?: string;
  projects: string[];
  participants?: string[];
  created_at: string;
  score?: number;
}

export interface ExtensionToolContext {
  mode: 'mcp' | 'cli';
  dataDir?: string;
  dbPath?: string;
  logger?: (message: string) => void;
  // Query lore's database (use this instead of direct DB access)
  query?: (options: ExtensionQueryOptions) => Promise<ExtensionQueryResult[]>;
}

export type ExtensionToolHandler = (
  args: Record<string, unknown>,
  context: ExtensionToolContext
) => Promise<unknown> | unknown;

export interface ExtensionTool {
  definition: ToolDefinition;
  handler: ExtensionToolHandler;
}

// Middleware types
export interface ExtensionMiddleware {
  name: string;
  beforeToolCall?: (
    toolName: string,
    args: Record<string, unknown>,
    context: ExtensionToolContext
  ) => Promise<{ args?: Record<string, unknown>; skip?: boolean; result?: unknown }>;
  afterToolCall?: (
    toolName: string,
    args: Record<string, unknown>,
    result: unknown,
    context: ExtensionToolContext
  ) => Promise<unknown>;
}

// Event types
export type LoreEventType = 'search' | 'ingest' | 'sync' | 'tool.call' | 'tool.result' | 'startup' | 'shutdown';

export interface LoreEvent {
  type: LoreEventType;
  payload: unknown;
  timestamp: number;
}

export type EventHandler = (event: LoreEvent, context: ExtensionToolContext) => void | Promise<void>;

// Command types
export interface ExtensionCommandContext {
  defaultDataDir: string;
  logger?: (message: string) => void;
}

export interface ExtensionCommand {
  name: string;
  description?: string;
  register: (program: unknown, context: ExtensionCommandContext) => void | Promise<void>;
}

// Hook types
export interface SourceCreatedEvent {
  id: string;
  title: string;
  source_type: string;
  projects: string[];
}

export interface ResearchPackage {
  question: string;
  answer: string;
  sources: unknown[];
}

export interface ExtensionHooks {
  onSourceCreated?: (event: SourceCreatedEvent, context: ExtensionToolContext) => void | Promise<void>;
  onResearchCompleted?: (result: ResearchPackage, context: ExtensionToolContext) => void | Promise<void>;
}

export interface LoreExtension {
  name: string;
  version: string;
  tools?: ExtensionTool[];
  commands?: ExtensionCommand[];
  hooks?: ExtensionHooks;
  components?: unknown[];
  middleware?: ExtensionMiddleware[];
  events?: { [K in LoreEventType]?: EventHandler };
}
