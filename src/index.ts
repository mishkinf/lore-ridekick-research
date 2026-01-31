/**
 * Lore Ridekick Research Extension
 * 
 * Tools for user research on the Ridekick project:
 * - Speaker profiles: who said what across interviews
 * - Hypothesis testing: validate assumptions with evidence
 * - Pain point tracking: aggregate pain points with frequency
 */

import type { LoreExtension, ExtensionToolContext, ExtensionCommand, ExtensionHooks } from './types.js';

// ============================================================================
// Helpers
// ============================================================================

interface SourceResult {
  id: string;
  title: string;
  summary: string;
  participants?: string[];
  content?: string;
  created_at: string;
  projects: string[];
}

async function getAllSources(
  project: string = 'ridekick',
  context: ExtensionToolContext
): Promise<SourceResult[]> {
  // Use lore's query function from context (no direct DB access needed)
  if (!context.query) {
    console.error('[ridekick] context.query not available - is this an older lore version?');
    return [];
  }
  
  const results = await context.query({ project, limit: 200 });
  return results as SourceResult[];
}

// ============================================================================
// Tools
// ============================================================================

const speakersTool = {
  definition: {
    name: 'ridekick_speakers',
    description: 'Get speaker profiles from Ridekick user interviews. Shows who said what across all interviews, with key themes and notable quotes.',
    inputSchema: {
      type: 'object',
      properties: {
        speaker: {
          type: 'string',
          description: 'Filter to a specific speaker name (optional)',
        },
        project: {
          type: 'string',
          description: 'Project to search (default: ridekick)',
          default: 'ridekick',
        },
      },
    },
  },
  handler: async (args: Record<string, unknown>, context: ExtensionToolContext) => {
    const project = (args.project as string) || 'ridekick';
    const speakerFilter = args.speaker as string | undefined;
    
    const sources = await getAllSources(project, context);
    
    // Aggregate by speaker
    const speakerMap = new Map<string, {
      appearances: number;
      sources: string[];
      themes: Set<string>;
    }>();
    
    for (const source of sources) {
      const participants = source.participants || [];
      for (const participant of participants) {
        if (speakerFilter && !participant.toLowerCase().includes(speakerFilter.toLowerCase())) {
          continue;
        }
        
        const existing = speakerMap.get(participant) || {
          appearances: 0,
          sources: [],
          themes: new Set<string>(),
        };
        
        existing.appearances++;
        existing.sources.push(source.title);
        
        // Extract themes from summary (simple keyword extraction)
        const summary = source.summary || '';
        const keywords = ['pricing', 'trust', 'time', 'dealer', 'negotiation', 'research', 'stress', 'confidence'];
        for (const keyword of keywords) {
          if (summary.toLowerCase().includes(keyword)) {
            existing.themes.add(keyword);
          }
        }
        
        speakerMap.set(participant, existing);
      }
    }
    
    // Format results
    const profiles = Array.from(speakerMap.entries()).map(([name, data]) => ({
      name,
      appearances: data.appearances,
      sources: data.sources.slice(0, 5),
      themes: Array.from(data.themes),
    }));
    
    profiles.sort((a, b) => b.appearances - a.appearances);
    
    return {
      total_speakers: profiles.length,
      profiles: speakerFilter ? profiles : profiles.slice(0, 10),
    };
  },
};

const hypothesisTool = {
  definition: {
    name: 'ridekick_hypothesis',
    description: 'Test a hypothesis against Ridekick user research evidence. Returns supporting and contradicting evidence.',
    inputSchema: {
      type: 'object',
      properties: {
        hypothesis: {
          type: 'string',
          description: 'The hypothesis to test (e.g., "Users find car pricing confusing")',
        },
        project: {
          type: 'string',
          description: 'Project to search (default: ridekick)',
          default: 'ridekick',
        },
      },
      required: ['hypothesis'],
    },
  },
  handler: async (args: Record<string, unknown>, context: ExtensionToolContext) => {
    const hypothesis = args.hypothesis as string;
    const project = (args.project as string) || 'ridekick';
    
    if (!hypothesis) {
      throw new Error('hypothesis is required');
    }
    
    // Extract keywords from hypothesis
    const words = hypothesis.toLowerCase().split(/\s+/);
    const stopWords = new Set(['users', 'find', 'the', 'a', 'an', 'is', 'are', 'that', 'this', 'to', 'for', 'of', 'in', 'on', 'with']);
    const keywords = words.filter(w => w.length > 3 && !stopWords.has(w));
    
    const sources = await getAllSources(project, context);
    
    const supporting: Array<{ source: string; evidence: string }> = [];
    const contradicting: Array<{ source: string; evidence: string }> = [];
    const neutral: Array<{ source: string }> = [];
    
    for (const source of sources) {
      const content = `${source.summary || ''} ${source.content || ''}`.toLowerCase();
      const matchCount = keywords.filter(k => content.includes(k)).length;
      
      if (matchCount === 0) {
        continue;
      }
      
      // Simple sentiment detection
      const positiveWords = ['love', 'great', 'easy', 'helpful', 'good', 'like', 'enjoy', 'simple'];
      const negativeWords = ['hate', 'confusing', 'hard', 'difficult', 'frustrating', 'stress', 'annoying', 'pain', 'problem'];
      
      const positiveCount = positiveWords.filter(w => content.includes(w)).length;
      const negativeCount = negativeWords.filter(w => content.includes(w)).length;
      
      // Extract a relevant snippet
      const snippet = source.summary?.slice(0, 200) || 'No summary available';
      
      if (negativeCount > positiveCount) {
        supporting.push({ source: source.title, evidence: snippet });
      } else if (positiveCount > negativeCount) {
        contradicting.push({ source: source.title, evidence: snippet });
      } else if (matchCount >= 2) {
        neutral.push({ source: source.title });
      }
    }
    
    const totalEvidence = supporting.length + contradicting.length;
    let verdict = 'INSUFFICIENT_EVIDENCE';
    let confidence = 'LOW';
    
    if (totalEvidence >= 3) {
      if (supporting.length > contradicting.length * 2) {
        verdict = 'SUPPORTED';
        confidence = supporting.length >= 5 ? 'HIGH' : 'MEDIUM';
      } else if (contradicting.length > supporting.length * 2) {
        verdict = 'CONTRADICTED';
        confidence = contradicting.length >= 5 ? 'HIGH' : 'MEDIUM';
      } else {
        verdict = 'MIXED';
        confidence = 'MEDIUM';
      }
    }
    
    return {
      hypothesis,
      verdict,
      confidence,
      supporting: supporting.slice(0, 5),
      contradicting: contradicting.slice(0, 5),
      neutral_mentions: neutral.length,
      recommendation: verdict === 'INSUFFICIENT_EVIDENCE' 
        ? 'Need more user interviews to validate this hypothesis'
        : verdict === 'MIXED'
        ? 'Consider segmenting users - hypothesis may be true for some segments'
        : undefined,
    };
  },
};

// Simple test tool to verify extension architecture works
const pingTool = {
  definition: {
    name: 'ridekick_ping',
    description: 'Test tool to verify the extension system is working. Returns sample data.',
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'Optional message to echo back',
          default: 'pong',
        },
        delay_ms: {
          type: 'number',
          description: 'Simulate a slow operation (milliseconds)',
          default: 0,
        },
        simulate_error: {
          type: 'boolean',
          description: 'Simulate an error for testing',
          default: false,
        },
      },
    },
  },
  handler: async (args: Record<string, unknown>, context: ExtensionToolContext) => {
    const message = (args.message as string) || 'pong';
    const delayMs = (args.delay_ms as number) || 0;
    const simulateError = (args.simulate_error as boolean) || false;
    
    // Simulate delay if requested
    if (delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    
    // Simulate error if requested
    if (simulateError) {
      throw new Error('Simulated error for testing');
    }
    
    return {
      status: 'ok',
      message,
      timestamp: new Date().toISOString(),
      extension: 'lore-ridekick-research',
      version: '0.1.0',
      features_tested: [
        'Tool execution',
        'Argument parsing',
        'Return value serialization',
        delayMs > 0 ? `Async delay (${delayMs}ms)` : null,
      ].filter(Boolean),
    };
  },
};

// AI-powered analysis tool using Anthropic API
const analyzeTool = {
  definition: {
    name: 'ridekick_analyze',
    description: 'AI-powered analysis of Ridekick user research. Uses Claude to synthesize insights from interview data. Takes longer but provides deeper analysis. Can optionally save the analysis as a new document (requires approval).',
    inputSchema: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: 'What do you want to analyze? e.g., "What are the main reasons users avoid car dealerships?"',
        },
        max_sources: {
          type: 'number',
          description: 'Maximum sources to include in analysis (default: 10)',
          default: 10,
        },
        save_as_document: {
          type: 'boolean',
          description: 'Propose saving the analysis as a new document in lore (requires approval)',
          default: false,
        },
      },
      required: ['question'],
    },
  },
  handler: async (args: Record<string, unknown>, context: ExtensionToolContext) => {
    const question = args.question as string;
    const maxSources = (args.max_sources as number) || 10;
    const saveAsDocument = (args.save_as_document as boolean) || false;
    
    if (!question) {
      throw new Error('question is required');
    }
    
    // Get sources from lore
    const sources = await getAllSources('ridekick', context);
    
    if (sources.length === 0) {
      return {
        status: 'error',
        message: 'No ridekick sources found. Add some user research data first.',
      };
    }
    
    // Prepare context from sources (limit to avoid token overflow)
    const sourcesToAnalyze = sources.slice(0, maxSources);
    const sourceContext = sourcesToAnalyze.map((s, i) => 
      `[Source ${i + 1}: ${s.title}]\n${s.summary || 'No summary'}`
    ).join('\n\n');
    
    // Call Claude API
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return {
        status: 'error', 
        message: 'ANTHROPIC_API_KEY not set. Cannot perform AI analysis.',
        sources_available: sources.length,
      };
    }
    
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          messages: [{
            role: 'user',
            content: `You are analyzing user research data for Ridekick, a car buying service app.

Based on the following user research sources, answer this question:
${question}

USER RESEARCH SOURCES:
${sourceContext}

Provide a clear, actionable analysis. Include:
1. Key findings (bullet points)
2. Supporting evidence from the sources
3. Recommendations (if applicable)

Be concise but thorough.`
          }],
        }),
      });
      
      if (!response.ok) {
        const error = await response.text();
        return {
          status: 'error',
          message: `Claude API error: ${response.status}`,
          details: error,
        };
      }
      
      const data = await response.json() as { content: Array<{ text: string }> };
      const analysis = data.content?.[0]?.text || 'No response from Claude';
      
      // Optionally propose saving as a document
      let proposalId: string | undefined;
      if (saveAsDocument && context.propose) {
        const title = `Analysis: ${question.slice(0, 50)}${question.length > 50 ? '...' : ''}`;
        const content = `# ${question}\n\n${analysis}\n\n---\n*Generated by ridekick_analyze from ${sourcesToAnalyze.length} sources on ${new Date().toISOString()}*`;
        
        const proposal = await context.propose({
          type: 'create_source',
          title,
          content,
          project: 'ridekick',
          reason: `AI analysis of "${question}" based on ${sourcesToAnalyze.length} user research sources`,
        });
        proposalId = proposal.id;
      }
      
      return {
        status: 'ok',
        question,
        analysis,
        sources_analyzed: sourcesToAnalyze.length,
        source_titles: sourcesToAnalyze.map(s => s.title),
        proposal_id: proposalId,
        proposal_note: proposalId ? 'Analysis proposed as new document. Review with: lore pending show ' + proposalId : undefined,
      };
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

const painPointsTool = {
  definition: {
    name: 'ridekick_pain_points',
    description: 'Aggregate pain points from Ridekick user research with frequency counts. Identifies common themes and frustrations.',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Project to search (default: ridekick)',
          default: 'ridekick',
        },
        limit: {
          type: 'number',
          description: 'Maximum pain points to return (default: 10)',
          default: 10,
        },
      },
    },
  },
  handler: async (args: Record<string, unknown>, context: ExtensionToolContext) => {
    const project = (args.project as string) || 'ridekick';
    const limit = (args.limit as number) || 10;
    
    const sources = await getAllSources(project, context);
    
    // Common pain point patterns for car buying
    const painPointPatterns = [
      { pattern: /pric(e|ing|es)/i, category: 'Pricing Confusion', keywords: ['price', 'pricing', 'cost', 'expensive', 'overpriced'] },
      { pattern: /trust|honest|scam|shady/i, category: 'Trust Issues', keywords: ['trust', 'honest', 'scam', 'shady', 'skeptical'] },
      { pattern: /time|hours|long|slow/i, category: 'Time Consuming', keywords: ['time', 'hours', 'long', 'slow', 'waiting'] },
      { pattern: /negotiat/i, category: 'Negotiation Stress', keywords: ['negotiate', 'negotiation', 'haggle', 'bargain'] },
      { pattern: /dealer|salesperson|sales/i, category: 'Dealer Experience', keywords: ['dealer', 'salesperson', 'pushy', 'pressure'] },
      { pattern: /research|information|compare/i, category: 'Research Burden', keywords: ['research', 'information', 'compare', 'options'] },
      { pattern: /confus|overwhelm|complicated/i, category: 'Complexity', keywords: ['confusing', 'overwhelming', 'complicated', 'complex'] },
      { pattern: /financ|loan|credit|payment/i, category: 'Financing', keywords: ['financing', 'loan', 'credit', 'payment', 'interest'] },
      { pattern: /trade.?in|value/i, category: 'Trade-in Value', keywords: ['trade-in', 'value', 'worth'] },
      { pattern: /hidden|fee|surprise/i, category: 'Hidden Costs', keywords: ['hidden', 'fees', 'surprise', 'unexpected'] },
    ];
    
    const painPointCounts = new Map<string, { count: number; sources: string[]; quotes: string[] }>();
    
    for (const source of sources) {
      const content = `${source.summary || ''} ${source.content || ''}`;
      
      for (const pp of painPointPatterns) {
        if (pp.pattern.test(content)) {
          const existing = painPointCounts.get(pp.category) || { count: 0, sources: [], quotes: [] };
          existing.count++;
          if (!existing.sources.includes(source.title)) {
            existing.sources.push(source.title);
          }
          
          // Try to extract a relevant quote
          const sentences = content.split(/[.!?]+/);
          for (const sentence of sentences) {
            if (pp.keywords.some(k => sentence.toLowerCase().includes(k)) && sentence.length > 20 && sentence.length < 200) {
              if (existing.quotes.length < 3) {
                existing.quotes.push(sentence.trim());
              }
              break;
            }
          }
          
          painPointCounts.set(pp.category, existing);
        }
      }
    }
    
    // Sort by frequency
    const painPoints = Array.from(painPointCounts.entries())
      .map(([category, data]) => ({
        category,
        frequency: data.count,
        sources_count: data.sources.length,
        sample_sources: data.sources.slice(0, 3),
        sample_quotes: data.quotes,
      }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, limit);
    
    return {
      total_sources_analyzed: sources.length,
      pain_points: painPoints,
      top_pain_point: painPoints[0]?.category || 'None identified',
      coverage_note: sources.length < 5 
        ? 'Limited data - need more user interviews for reliable pain point analysis'
        : undefined,
    };
  },
};

// ============================================================================
// Extension Export
// ============================================================================

// ============================================================================
// CLI Commands
// ============================================================================

const ridekickCommand: ExtensionCommand = {
  name: 'ridekick',
  description: 'Ridekick research shortcuts',
  register: (program: any, context) => {
    const cmd = program
      .command('ridekick')
      .description('Ridekick user research commands');
    
    cmd
      .command('status')
      .description('Show Ridekick research status')
      .action(async () => {
        console.log('📊 Ridekick Research Status');
        console.log('─'.repeat(40));
        console.log('Extension: lore-ridekick-research v0.1.0');
        console.log('Tools: ridekick_speakers, ridekick_hypothesis, ridekick_pain_points');
        console.log('Middleware: ridekick-logger (active)');
        console.log('Hooks: onSourceCreated, onResearchCompleted');
      });
    
    cmd
      .command('summary')
      .description('Quick pain points summary')
      .action(async () => {
        console.log('💡 Run: lore tool call ridekick_pain_points');
        console.log('   or use lore browse → Tools → ridekick_pain_points');
      });
  },
};

// ============================================================================
// Hooks
// ============================================================================

const ridekickHooks: ExtensionHooks = {
  onSourceCreated: async (event, context) => {
    // Only log for ridekick project sources
    if (event.projects?.includes('ridekick')) {
      const log = context.logger || console.error;
      log(`[ridekick] 📄 New source added to Ridekick: ${event.title}`);
    }
  },
  onResearchCompleted: async (result, context) => {
    const log = context.logger || console.error;
    log(`[ridekick] 🔬 Research completed: ${result.question.slice(0, 50)}...`);
  },
};

// ============================================================================
// Extension Definition
// ============================================================================

const extension: LoreExtension = {
  name: 'lore-ridekick-research',
  version: '0.1.0',
  
  // Permissions: what this extension can do
  permissions: {
    read: true,           // Query sources
    proposeCreate: true,  // Propose new documents (e.g., analysis summaries)
    proposeModify: false, // No modifications to existing
    proposeDelete: false, // No deletions
  },
  
  tools: [
    pingTool,  // Test tool first - for verifying architecture
    analyzeTool,  // AI-powered analysis using Claude
    speakersTool,
    hypothesisTool,
    painPointsTool,
  ],
  
  // CLI commands: lore ridekick status, lore ridekick summary
  commands: [ridekickCommand],
  
  // Hooks: react to source creation and research completion
  hooks: ridekickHooks,
  
  // Middleware: intercept tool calls
  middleware: [
    {
      name: 'ridekick-logger',
      beforeToolCall: async (toolName, args, context) => {
        if (toolName.startsWith('ridekick_')) {
          // Use context.logger if available (TUI-safe), otherwise skip in CLI mode
          const log = context.logger || (() => {});
          log(`[ridekick] 🔍 Calling ${toolName}`);
        }
        return { args }; // pass through unchanged
      },
      afterToolCall: async (toolName, args, result, context) => {
        if (toolName.startsWith('ridekick_')) {
          const log = context.logger || (() => {});
          const summary = typeof result === 'object' && result !== null
            ? Object.keys(result).join(', ')
            : typeof result;
          log(`[ridekick] ✅ ${toolName} completed`);
        }
        return result; // pass through unchanged
      },
    },
  ],
  
  // Events: react to system events (use context.logger for TUI-safe logging)
  events: {
    'search': (event, context) => {
      const log = context.logger || (() => {});
      log(`[ridekick] 🔎 Search performed`);
    },
    'ingest': (event, context) => {
      const log = context.logger || (() => {});
      log(`[ridekick] 📥 Document ingested`);
    },
  },
};

export default extension;
