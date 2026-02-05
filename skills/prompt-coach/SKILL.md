---
name: prompt-coach
description: Use when the user wants feedback on their prompting patterns, asks to review their prompts, wants to improve their prompting skills, or requests a weekly summary of their Claude Code usage.
---

# Prompt Coach

Analyzes your Claude Code prompting history and provides actionable feedback to help you prompt more effectively.

## Commands

| Command | What it does |
|---------|--------------|
| `/prompt-coach` | Quick review of recent prompts |
| `/prompt-coach weekly` | Full weekly summary with detailed analysis |
| `/prompt-coach deep` | Deep dive with full prompt text examples |

## How to Use

The analyzer script is at: `prompt-analyzer.js` (same directory as this skill)

### Quick Review (default)
```bash
node "<skill-directory>/prompt-analyzer.js" --days 7 --limit 50
```

### Weekly Summary (`/prompt-coach weekly`)
```bash
node "<skill-directory>/prompt-analyzer.js" --days 7 --limit 200
```

### Deep Dive (`/prompt-coach deep`)
```bash
node "<skill-directory>/prompt-analyzer.js" --days 7 --verbose
```

**Note**: Replace `<skill-directory>` with the actual path to this skill's folder. On Windows this is typically `C:\Users\<username>\.claude\skills\prompt-coach\`.

## Interpreting Results

### Key Metrics

| Metric | Good | Needs Work |
|--------|------|------------|
| `firstTimeSuccessRate` | >80% | <60% |
| `fixPrompts` / `totalPrompts` | <10% | >20% |
| `avgPromptLength` | 100-1000 chars | <50 or >2000 |

### Pattern Flags

- **veryShortPrompts**: Prompts <20 chars are often too vague
- **veryLongPrompts**: Prompts >2000 chars may over-explain (link to files instead)
- **fixChains**: Multiple corrections in a row = original prompt was unclear
- **promptsNeedingFix**: These are learning opportunities

## Coaching Framework

When providing feedback, focus on:

### 1. Celebrate Wins
Start with what's working. High success rate? Acknowledge it.

### 2. Identify Patterns
Look at the `examples` section. What do failed prompts have in common?

Common issues:
- **Too vague**: "fix it" → "fix the null pointer in getUserById on line 42"
- **Missing context**: "add auth" → "add JWT auth following the pattern in src/middleware/auth.ts"
- **Assuming knowledge**: "like before" → specify which previous approach

### 3. Give Concrete Rewrites
For each problematic prompt example, show:
- The original prompt
- Why it likely failed
- A better version

### 4. Actionable Tips
End with 2-3 specific things to try next session.

## Example Output Format

```markdown
## Your Prompting Report (Last 7 Days)

### The Good
- 85% first-time success rate - you're being clear most of the time
- Good use of file paths to provide context

### Areas to Improve
- 5 very short prompts detected. Example: "fix it"
  **Better**: "Fix the TypeScript error in src/api/users.ts line 23 - it's complaining about undefined"

- 1 fix chain found (3 corrections in a row)
  **Tip**: When this happens, stop and re-explain the full goal from scratch

### Your Challenge This Week
Before hitting enter, ask yourself: "Does this prompt include WHAT I want AND WHERE to do it?"
```

## Data Location

Transcripts are stored at: `~/.claude/projects/<project-id>/<session-id>.jsonl`

The analyzer reads these automatically - no manual logging needed.
