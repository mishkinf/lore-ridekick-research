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

export interface LoreExtension {
  name: string;
  version: string;
  tools?: ExtensionTool[];
  commands?: unknown[];
  hooks?: Record<string, unknown>;
  components?: unknown[];
}
