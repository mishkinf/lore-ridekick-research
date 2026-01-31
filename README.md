# lore-ridekick-research

Lore extension for Ridekick user research — speaker profiles, hypothesis testing, and pain point tracking.

## Installation

```bash
lore extension install lore-ridekick-research
```

Or install from local path during development:

```bash
cd ~/.config/lore/extensions
npm install /path/to/lore-ridekick-research
```

## Tools

### `ridekick_speakers`

Get speaker profiles from user interviews. Shows who said what across all interviews.

```typescript
// MCP call
{ tool: 'ridekick_speakers', args: { speaker: 'optional-filter' } }

// Returns
{
  total_speakers: 5,
  profiles: [
    { name: "Sarah", appearances: 3, sources: [...], themes: ["pricing", "trust"] },
    ...
  ]
}
```

### `ridekick_hypothesis`

Test a hypothesis against user research evidence.

```typescript
// MCP call
{ tool: 'ridekick_hypothesis', args: { hypothesis: "Users find car pricing confusing" } }

// Returns
{
  hypothesis: "Users find car pricing confusing",
  verdict: "SUPPORTED",  // SUPPORTED | CONTRADICTED | MIXED | INSUFFICIENT_EVIDENCE
  confidence: "HIGH",    // HIGH | MEDIUM | LOW
  supporting: [{ source: "Interview Jan 15", evidence: "..." }],
  contradicting: [...],
  recommendation: "..."
}
```

### `ridekick_pain_points`

Aggregate pain points with frequency counts.

```typescript
// MCP call
{ tool: 'ridekick_pain_points', args: { limit: 10 } }

// Returns
{
  total_sources_analyzed: 12,
  top_pain_point: "Pricing Confusion",
  pain_points: [
    { category: "Pricing Confusion", frequency: 8, sample_quotes: [...] },
    { category: "Trust Issues", frequency: 6, sample_quotes: [...] },
    ...
  ]
}
```

## Development

```bash
npm install
npm run build
```

## Requirements

- Lore >= 0.1.0
- Environment variables: `SUPABASE_URL`, `SUPABASE_ANON_KEY`
