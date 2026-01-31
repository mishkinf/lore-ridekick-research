/**
 * Lore Ridekick Research Extension
 * 
 * Tools for user research on the Ridekick project:
 * - Speaker profiles: who said what across interviews
 * - Hypothesis testing: validate assumptions with evidence
 * - Pain point tracking: aggregate pain points with frequency
 */

import type { LoreExtension, ExtensionToolContext } from './types.js';

// ============================================================================
// Helpers
// ============================================================================

async function querySupabase(
  sql: string,
  context: ExtensionToolContext
): Promise<unknown[]> {
  // In a real implementation, we'd use the Supabase client
  // For now, we'll use the REST API with env vars
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set');
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/query`, {
    method: 'POST',
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql }),
  });

  if (!response.ok) {
    // Fallback: try direct table query for sources
    return [];
  }

  return response.json();
}

async function searchSources(
  query: string,
  project: string = 'ridekick',
  context: ExtensionToolContext
): Promise<Array<{ id: string; title: string; summary: string; participants: string[]; created_at: string }>> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set');
  }

  // Simple text search on sources table
  const response = await fetch(
    `${supabaseUrl}/rest/v1/sources?select=id,title,summary,participants,created_at&projects=cs.{${project}}&or=(title.ilike.*${encodeURIComponent(query)}*,summary.ilike.*${encodeURIComponent(query)}*)&order=created_at.desc&limit=20`,
    {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
    }
  );

  if (!response.ok) {
    return [];
  }

  return response.json();
}

async function getAllSources(
  project: string = 'ridekick',
  context: ExtensionToolContext
): Promise<Array<{ id: string; title: string; summary: string; participants: string[]; content: string; created_at: string }>> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set');
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/sources?select=id,title,summary,participants,content,created_at&projects=cs.{${project}}&order=created_at.desc`,
    {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
    }
  );

  if (!response.ok) {
    return [];
  }

  return response.json();
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

const extension: LoreExtension = {
  name: 'lore-ridekick-research',
  version: '0.1.0',
  
  tools: [
    speakersTool,
    hypothesisTool,
    painPointsTool,
  ],
  
  // Middleware: intercept tool calls
  middleware: [
    {
      name: 'ridekick-logger',
      beforeToolCall: async (toolName, args, context) => {
        if (toolName.startsWith('ridekick_')) {
          console.error(`[ridekick] 🔍 Calling ${toolName} with:`, JSON.stringify(args));
        }
        return { args }; // pass through unchanged
      },
      afterToolCall: async (toolName, args, result, context) => {
        if (toolName.startsWith('ridekick_')) {
          const summary = typeof result === 'object' && result !== null
            ? Object.keys(result).join(', ')
            : typeof result;
          console.error(`[ridekick] ✅ ${toolName} returned: ${summary}`);
        }
        return result; // pass through unchanged
      },
    },
  ],
  
  // Events: react to system events
  events: {
    'tool.call': (event, context) => {
      // Log all tool calls (not just ridekick ones)
      // console.error(`[ridekick-events] Tool called:`, event.payload);
    },
    'search': (event, context) => {
      console.error(`[ridekick-events] 🔎 Search performed:`, JSON.stringify(event.payload));
    },
    'ingest': (event, context) => {
      console.error(`[ridekick-events] 📥 Document ingested:`, JSON.stringify(event.payload));
    },
  },
};

export default extension;
