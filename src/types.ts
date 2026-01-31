/**
 * Lore Extension Types (copied from lore for standalone compilation)
 */

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ExtensionToolContext {
  mode: 'mcp' | 'cli';
  dataDir?: string;
  dbPath?: string;
  logger?: (message: string) => void;
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

export interface LoreExtension {
  name: string;
  version: string;
  tools?: ExtensionTool[];
  commands?: unknown[];
  hooks?: Record<string, unknown>;
  components?: unknown[];
  middleware?: ExtensionMiddleware[];
  events?: { [K in LoreEventType]?: EventHandler };
}
