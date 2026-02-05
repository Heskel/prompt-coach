#!/usr/bin/env node

/**
 * Prompt Analyzer for Claude Code
 * Analyzes transcript JSONL files to extract prompting patterns and metrics.
 *
 * Usage:
 *   node prompt-analyzer.js [options]
 *
 * Options:
 *   --days N        Analyze last N days (default: 7)
 *   --limit N       Limit to N most recent prompts (default: 100)
 *   --verbose       Include full prompt text in output
 *   --project P     Filter to specific project path substring
 *   --output FILE   Write JSON output to file instead of stdout
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

// Fix patterns that indicate a previous prompt didn't work
const FIX_PATTERNS = [
  /^no[,.]?\s/i,
  /^wrong/i,
  /^that'?s not/i,
  /^actually[,.]?\s/i,
  /^try again/i,
  /^fix (this|that|it)/i,
  /^undo/i,
  /^revert/i,
  /^that broke/i,
  /^it'?s (still|not) (working|right)/i,
  /^please (fix|correct|redo)/i,
  /didn'?t work/i,
  /not what i (wanted|meant|asked)/i,
  /^wait[,.]?\s/i,
  /^stop[,.]?\s/i,
  /^cancel/i,
  /^ignore (that|this|previous)/i,
];

// Patterns that indicate a successful completion acknowledgment
const SUCCESS_PATTERNS = [
  /^(thanks|thank you|thx|ty)/i,
  /^(perfect|great|awesome|nice|good job|well done)/i,
  /^(that'?s? (it|right|correct|perfect))/i,
  /^(yes|yep|yeah|yup)[,!.]?\s*$/i,
  /^(looks good|lgtm)/i,
];

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    days: 7,
    limit: 100,
    verbose: false,
    project: null,
    output: null,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--days':
        options.days = parseInt(args[++i], 10);
        break;
      case '--limit':
        options.limit = parseInt(args[++i], 10);
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--project':
        options.project = args[++i];
        break;
      case '--output':
        options.output = args[++i];
        break;
      case '--help':
        console.log(`
Prompt Analyzer for Claude Code

Usage: node prompt-analyzer.js [options]

Options:
  --days N        Analyze last N days (default: 7)
  --limit N       Limit to N most recent prompts (default: 100)
  --verbose       Include full prompt text in output
  --project P     Filter to specific project path substring
  --output FILE   Write JSON output to file instead of stdout
  --help          Show this help message
`);
        process.exit(0);
    }
  }

  return options;
}

function getClaudeProjectsDir() {
  const homeDir = os.homedir();
  return path.join(homeDir, '.claude', 'projects');
}

async function findTranscriptFiles(projectsDir, options) {
  const files = [];
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - options.days);

  if (!fs.existsSync(projectsDir)) {
    return files;
  }

  const projectDirs = fs.readdirSync(projectsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  for (const projectDir of projectDirs) {
    if (options.project && !projectDir.toLowerCase().includes(options.project.toLowerCase())) {
      continue;
    }

    const projectPath = path.join(projectsDir, projectDir);
    const entries = fs.readdirSync(projectPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        const filePath = path.join(projectPath, entry.name);
        const stats = fs.statSync(filePath);

        if (stats.mtime >= cutoffDate) {
          files.push({
            path: filePath,
            project: projectDir,
            sessionId: entry.name.replace('.jsonl', ''),
            mtime: stats.mtime,
          });
        }
      }
    }
  }

  // Sort by modification time, newest first
  files.sort((a, b) => b.mtime - a.mtime);
  return files;
}

async function parseTranscript(filePath) {
  const entries = [];

  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (line.trim()) {
      try {
        entries.push(JSON.parse(line));
      } catch (e) {
        // Skip malformed lines
      }
    }
  }

  return entries;
}

function extractPromptText(message) {
  if (!message || !message.content) return '';

  if (typeof message.content === 'string') {
    return message.content;
  }

  if (Array.isArray(message.content)) {
    return message.content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('\n');
  }

  return '';
}

function isFixPrompt(text) {
  const cleanText = text.trim();
  return FIX_PATTERNS.some(pattern => pattern.test(cleanText));
}

function isSuccessAck(text) {
  const cleanText = text.trim();
  return SUCCESS_PATTERNS.some(pattern => pattern.test(cleanText));
}

function analyzeConversation(entries) {
  const prompts = [];
  const tokenUsage = {
    totalInput: 0,
    totalOutput: 0,
    totalCacheRead: 0,
    totalCacheCreation: 0,
  };

  let lastUserPrompt = null;
  let conversationTurns = 0;

  for (const entry of entries) {
    // User message
    if (entry.type === 'user' && entry.message?.role === 'user' && !entry.isMeta) {
      const text = extractPromptText(entry.message);
      if (!text) continue;

      const isFix = isFixPrompt(text);
      const isSuccess = isSuccessAck(text);

      const prompt = {
        timestamp: entry.timestamp,
        text: text,
        charCount: text.length,
        estimatedTokens: Math.ceil(text.length / 4),
        isFix: isFix,
        isSuccessAck: isSuccess,
        uuid: entry.uuid,
        parentUuid: entry.parentUuid,
        sessionId: entry.sessionId,
      };

      // If this is a fix, mark the previous prompt as needing correction
      if (isFix && prompts.length > 0) {
        prompts[prompts.length - 1].followedByFix = true;
      }

      prompts.push(prompt);
      lastUserPrompt = prompt;
      conversationTurns++;
    }

    // Assistant message with token usage
    if (entry.type === 'assistant' && entry.message?.usage) {
      const usage = entry.message.usage;
      tokenUsage.totalInput += usage.input_tokens || 0;
      tokenUsage.totalOutput += usage.output_tokens || 0;
      tokenUsage.totalCacheRead += usage.cache_read_input_tokens || 0;
      tokenUsage.totalCacheCreation += usage.cache_creation_input_tokens || 0;

      // Link token usage to the prompt that triggered this response
      if (lastUserPrompt) {
        lastUserPrompt.responseTokens = {
          input: usage.input_tokens || 0,
          output: usage.output_tokens || 0,
          cacheRead: usage.cache_read_input_tokens || 0,
          cacheCreation: usage.cache_creation_input_tokens || 0,
        };
      }
    }
  }

  return { prompts, tokenUsage, conversationTurns };
}

function calculateMetrics(allPrompts) {
  if (allPrompts.length === 0) {
    return {
      totalPrompts: 0,
      fixPrompts: 0,
      successAcks: 0,
      firstTimeSuccessRate: 0,
      avgPromptLength: 0,
      avgTokensPerPrompt: 0,
    };
  }

  const fixPrompts = allPrompts.filter(p => p.isFix).length;
  const successAcks = allPrompts.filter(p => p.isSuccessAck).length;
  const promptsFollowedByFix = allPrompts.filter(p => p.followedByFix).length;

  // First-time success rate: prompts NOT followed by a fix
  const substantivePrompts = allPrompts.filter(p => !p.isFix && !p.isSuccessAck);
  const successfulFirstTries = substantivePrompts.filter(p => !p.followedByFix).length;
  const firstTimeSuccessRate = substantivePrompts.length > 0
    ? (successfulFirstTries / substantivePrompts.length) * 100
    : 0;

  const avgPromptLength = allPrompts.reduce((sum, p) => sum + p.charCount, 0) / allPrompts.length;

  const promptsWithTokens = allPrompts.filter(p => p.responseTokens);
  const avgTokensPerPrompt = promptsWithTokens.length > 0
    ? promptsWithTokens.reduce((sum, p) => sum + (p.responseTokens?.input || 0) + (p.responseTokens?.output || 0), 0) / promptsWithTokens.length
    : 0;

  return {
    totalPrompts: allPrompts.length,
    fixPrompts,
    successAcks,
    promptsFollowedByFix,
    firstTimeSuccessRate: Math.round(firstTimeSuccessRate * 10) / 10,
    avgPromptLength: Math.round(avgPromptLength),
    avgTokensPerPrompt: Math.round(avgTokensPerPrompt),
  };
}

function identifyPatterns(allPrompts) {
  const patterns = {
    veryShortPrompts: [],   // < 20 chars, likely too vague
    veryLongPrompts: [],    // > 2000 chars, maybe over-explaining
    fixChains: [],          // Multiple fixes in a row
    topFixedPrompts: [],    // Prompts that needed fixes
  };

  // Find very short prompts (excluding success acks)
  patterns.veryShortPrompts = allPrompts
    .filter(p => p.charCount < 20 && !p.isSuccessAck && !p.isFix)
    .slice(0, 5);

  // Find very long prompts
  patterns.veryLongPrompts = allPrompts
    .filter(p => p.charCount > 2000)
    .slice(0, 5);

  // Find fix chains (consecutive fixes)
  let chainStart = -1;
  let chainLength = 0;
  for (let i = 0; i < allPrompts.length; i++) {
    if (allPrompts[i].isFix) {
      if (chainStart === -1) chainStart = i;
      chainLength++;
    } else {
      if (chainLength >= 2) {
        patterns.fixChains.push({
          startIndex: chainStart,
          length: chainLength,
          prompts: allPrompts.slice(chainStart, chainStart + chainLength).map(p => p.text.substring(0, 100)),
        });
      }
      chainStart = -1;
      chainLength = 0;
    }
  }

  // Find prompts that were followed by fixes
  patterns.topFixedPrompts = allPrompts
    .filter(p => p.followedByFix && !p.isFix)
    .slice(0, 10);

  return patterns;
}

async function main() {
  const options = parseArgs();
  const projectsDir = getClaudeProjectsDir();

  const transcriptFiles = await findTranscriptFiles(projectsDir, options);

  if (transcriptFiles.length === 0) {
    const result = {
      error: 'No transcript files found',
      projectsDir,
      options,
    };
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const allPrompts = [];
  const sessionSummaries = [];
  let totalTokenUsage = {
    totalInput: 0,
    totalOutput: 0,
    totalCacheRead: 0,
    totalCacheCreation: 0,
  };

  for (const file of transcriptFiles) {
    const entries = await parseTranscript(file.path);
    const { prompts, tokenUsage, conversationTurns } = analyzeConversation(entries);

    if (prompts.length > 0) {
      // Add project context to prompts
      prompts.forEach(p => p.project = file.project);
      allPrompts.push(...prompts);

      sessionSummaries.push({
        sessionId: file.sessionId,
        project: file.project,
        date: file.mtime.toISOString().split('T')[0],
        promptCount: prompts.length,
        fixCount: prompts.filter(p => p.isFix).length,
        tokenUsage,
      });

      totalTokenUsage.totalInput += tokenUsage.totalInput;
      totalTokenUsage.totalOutput += tokenUsage.totalOutput;
      totalTokenUsage.totalCacheRead += tokenUsage.totalCacheRead;
      totalTokenUsage.totalCacheCreation += tokenUsage.totalCacheCreation;
    }
  }

  // Sort all prompts by timestamp, newest first
  allPrompts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  // Limit to requested number
  const limitedPrompts = allPrompts.slice(0, options.limit);

  // Calculate metrics
  const metrics = calculateMetrics(limitedPrompts);
  const patterns = identifyPatterns(limitedPrompts);

  // Build result
  const result = {
    summary: {
      analyzedPeriod: `Last ${options.days} days`,
      totalSessions: sessionSummaries.length,
      totalPrompts: allPrompts.length,
      analyzedPrompts: limitedPrompts.length,
      tokenUsage: totalTokenUsage,
    },
    metrics,
    patterns: {
      veryShortPromptsCount: patterns.veryShortPrompts.length,
      veryLongPromptsCount: patterns.veryLongPrompts.length,
      fixChainCount: patterns.fixChains.length,
      promptsNeedingFixCount: patterns.topFixedPrompts.length,
    },
    insights: generateInsights(metrics, patterns),
    examples: {
      recentFixedPrompts: patterns.topFixedPrompts.slice(0, 5).map(p => ({
        timestamp: p.timestamp,
        text: options.verbose ? p.text : p.text.substring(0, 200) + (p.text.length > 200 ? '...' : ''),
        charCount: p.charCount,
        project: p.project,
      })),
      veryShortPrompts: patterns.veryShortPrompts.map(p => ({
        text: p.text,
        timestamp: p.timestamp,
      })),
    },
    sessionSummaries: sessionSummaries.slice(0, 10),
  };

  const output = JSON.stringify(result, null, 2);

  if (options.output) {
    fs.writeFileSync(options.output, output);
    console.log(`Analysis written to ${options.output}`);
  } else {
    console.log(output);
  }
}

function generateInsights(metrics, patterns) {
  const insights = [];

  // First-time success rate insights
  if (metrics.firstTimeSuccessRate < 50) {
    insights.push({
      type: 'warning',
      category: 'effectiveness',
      message: `Your first-time success rate is ${metrics.firstTimeSuccessRate}%. More than half your prompts need follow-up corrections. Focus on being more specific upfront.`,
    });
  } else if (metrics.firstTimeSuccessRate < 70) {
    insights.push({
      type: 'info',
      category: 'effectiveness',
      message: `Your first-time success rate is ${metrics.firstTimeSuccessRate}%. Room for improvement - aim for 80%+.`,
    });
  } else if (metrics.firstTimeSuccessRate >= 80) {
    insights.push({
      type: 'success',
      category: 'effectiveness',
      message: `Excellent! Your first-time success rate is ${metrics.firstTimeSuccessRate}%. You're prompting effectively.`,
    });
  }

  // Prompt length insights
  if (patterns.veryShortPrompts.length > 3) {
    insights.push({
      type: 'warning',
      category: 'specificity',
      message: `You have ${patterns.veryShortPrompts.length} very short prompts (<20 chars). Short prompts often lack context and lead to misunderstandings.`,
    });
  }

  if (patterns.veryLongPrompts.length > 3) {
    insights.push({
      type: 'info',
      category: 'efficiency',
      message: `You have ${patterns.veryLongPrompts.length} very long prompts (>2000 chars). Consider if all that context is necessary, or if you could link to files instead.`,
    });
  }

  // Fix chain insights
  if (patterns.fixChains.length > 0) {
    insights.push({
      type: 'warning',
      category: 'effectiveness',
      message: `Found ${patterns.fixChains.length} fix chains (multiple corrections in a row). When this happens, consider stepping back and re-explaining the full goal.`,
    });
  }

  // Token efficiency
  if (metrics.avgTokensPerPrompt > 50000) {
    insights.push({
      type: 'info',
      category: 'cost',
      message: `Average tokens per prompt: ${metrics.avgTokensPerPrompt.toLocaleString()}. This is high - you might benefit from more focused, incremental requests.`,
    });
  }

  return insights;
}

main().catch(console.error);
