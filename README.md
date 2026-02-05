# Prompt Coach

A Claude Code plugin that analyzes your prompting history and provides actionable feedback to help you prompt more effectively.

## Installation

```
/plugin github:Heskel/prompt-coach
```

## Usage

| Command | Description |
|---------|-------------|
| `/prompt-coach` | Quick review of recent prompts (last 7 days) |
| `/prompt-coach weekly` | Full weekly summary with detailed analysis |
| `/prompt-coach deep` | Deep dive with full prompt text examples |

## What It Tracks

- **First-time success rate** - How often your prompts work without needing corrections
- **Fix patterns** - Detects when you say "no", "wrong", "try again", etc.
- **Prompt length** - Identifies too-short (vague) or too-long (over-explaining) prompts
- **Fix chains** - Multiple corrections in a row (indicates unclear initial prompt)

## How It Works

1. Claude Code already logs all conversations to `~/.claude/projects/`
2. The analyzer script parses these transcripts (no extra logging needed)
3. When you run `/prompt-coach`, Claude reads the analysis and coaches you

**Zero tokens used for logging** - analysis only happens when you ask for it.

## Example Output

```
## Your Prompting Report (Last 7 Days)

### The Good
- 85% first-time success rate
- Good use of file paths to provide context

### Areas to Improve
- 5 very short prompts detected. Example: "fix it"
  **Better**: "Fix the TypeScript error in src/api/users.ts line 23"

### Your Challenge This Week
Before hitting enter, ask: "Does this prompt include WHAT I want AND WHERE?"
```

## Privacy

- All data stays local on your machine
- No external services or APIs
- Only analyzes transcripts already stored by Claude Code

## Requirements

- Node.js (for the analyzer script)
- Claude Code

## License

MIT
