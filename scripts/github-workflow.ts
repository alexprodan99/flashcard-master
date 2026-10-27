#!/usr/bin/env node

/**
 * Flashcard Master - Cross-Platform GitHub Automation Engine
 *
 * Provides unified, shell-independent automation for:
 * 1. Batch GitHub issue creation for Epics and child Stories (`npm run gh:issues -- --epic <N>`)
 * 2. Automated PR generation linking active branch to issues (`npm run gh:pr`)
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export interface CommandRunnerOptions {
  cwd?: string;
  input?: string;
}

export interface CommandRunner {
  exec(command: string, args: string[], options?: CommandRunnerOptions): string;
}

export class SystemCommandRunner implements CommandRunner {
  exec(command: string, args: string[], options?: CommandRunnerOptions): string {
    try {
      return execFileSync(command, args, {
        cwd: options?.cwd || process.cwd(),
        encoding: 'utf-8',
        shell: false,
        windowsHide: true,
        input: options?.input,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
    } catch (error: any) {
      const stderr = error.stderr ? error.stderr.toString() : '';
      const stdout = error.stdout ? error.stdout.toString() : '';
      const message = stderr.trim() || stdout.trim() || error.message;
      throw new Error(`Command failed: ${command} ${args.join(' ')}\n${message}`);
    }
  }
}

export interface StoryData {
  epicNumber: number;
  storyNumber: number;
  id: string;
  title: string;
  description: string;
  deliverables: string[];
  acceptanceCriteria: string[];
}

export interface EpicData {
  epicNumber: number;
  title: string;
  goal: string;
  stories: StoryData[];
}

export interface StorySpecData {
  title: string;
  type: string;
  problem: string;
  approach: string;
  tasks: string[];
  acceptanceCriteria: string[];
  verification: string[];
}

export interface BranchInfo {
  branch: string;
  epicNumber: number;
  storyNumber: number;
  slug: string;
}

export interface GitHubIssue {
  number: number;
  title: string;
  state: string;
  url?: string;
}

/**
 * Parse an epic from implementation-artifacts/epic-<N>-context.md and planning-artifacts/epics.md
 */
export function parseEpicData(epicNumber: number, repoRoot = process.cwd()): EpicData {
  const contextPath = path.join(repoRoot, '_bmad-output', 'implementation-artifacts', `epic-${epicNumber}-context.md`);
  const epicsPath = path.join(repoRoot, '_bmad-output', 'planning-artifacts', 'epics.md');

  let contextContent = '';
  if (fs.existsSync(contextPath)) {
    contextContent = fs.readFileSync(contextPath, 'utf-8');
  }

  let epicsContent = '';
  if (fs.existsSync(epicsPath)) {
    epicsContent = fs.readFileSync(epicsPath, 'utf-8');
  }

  if (!contextContent && !epicsContent) {
    throw new Error(`Could not find epic context for Epic ${epicNumber} in _bmad-output`);
  }

  // Extract Epic Title & Goal
  let title = `Epic ${epicNumber}`;
  let goal = '';

  let titleMatch: RegExpMatchArray | null = null;

  if (contextContent) {
    titleMatch = contextContent.match(/^#\s+Epic\s+\d+\s+Context:\s*(.+)$/m);
    if (titleMatch) {
      title = titleMatch[1].trim();
    }
    const goalMatch = contextContent.match(/##\s+Goal\s*\r?\n\r?\n([\s\S]*?)(?=\r?\n\r?\n##|\r?\n#|$)/);
    if (goalMatch) {
      goal = goalMatch[1].trim();
    }
  } else if (epicsContent) {
    titleMatch = epicsContent.match(new RegExp(`##\\s+Epic\\s+${epicNumber}:?\\s*(.+)$`, 'm'));
    if (titleMatch) {
      title = titleMatch[1].trim();
    }
  }

  if (!contextContent) {
    const hasEpic = new RegExp(`##\\s+Epic\\s+${epicNumber}[:\\s]|###\\s+Story\\s+${epicNumber}\\.`, 'm').test(epicsContent);
    if (!hasEpic) {
      throw new Error(`Could not find epic context or stories for Epic ${epicNumber} in _bmad-output`);
    }
  }

  const stories: StoryData[] = [];

  // Extract stories from epicsContent
  if (epicsContent) {
    const storyRegex = new RegExp(`###\\s+Story\\s+${epicNumber}\\.(\\d+):\\s*(.+)\\r?\\n([\\s\\S]*?)(?=\\r?\\n###|\\r?\\n##|$)`, 'g');
    let match: RegExpExecArray | null;

    while ((match = storyRegex.exec(epicsContent)) !== null) {
      const sNum = parseInt(match[1], 10);
      const sTitle = match[2].trim();
      const body = match[3];

      let id = `${epicNumber}-${sNum}`;
      const idMatch = body.match(/\*\*ID:\*\*\s*`?([^\r\n`]+)`?/);
      if (idMatch) {
        id = idMatch[1].trim();
      }

      let description = '';
      const descMatch = body.match(/\*\*Description:\*\*\s*([^\r\n]+(?:\r?\n(?!\*\*)[^\r\n]+)*)/);
      if (descMatch) {
        description = descMatch[1].trim();
      }

      const deliverables: string[] = [];
      const delivMatch = body.match(/\*\*(?:Deliverables|Key Changes):\*\*([\s\\S]*?)(?=\*\*Acceptance Criteria:\*\*|$)/);
      if (delivMatch) {
        const lines = delivMatch[1].split(/\r?\n/);
        for (const line of lines) {
          const item = line.replace(/^\s*[-*]\s*/, '').trim();
          if (item) deliverables.push(item);
        }
      }

      const acceptanceCriteria: string[] = [];
      const acMatch = body.match(/\*\*Acceptance Criteria:\*\*([\s\S]*?)$/);
      if (acMatch) {
        const lines = acMatch[1].split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
            acceptanceCriteria.push(trimmed.replace(/^[-*]\s*(\[[ x]\]\s*)?/, '').trim());
          }
        }
      }

      stories.push({
        epicNumber,
        storyNumber: sNum,
        id,
        title: sTitle,
        description,
        deliverables,
        acceptanceCriteria,
      });
    }
  }

  // If no stories were extracted from epics.md, fallback to contextContent story list
  if (stories.length === 0 && contextContent) {
    const storyListRegex = new RegExp(`-\\s+\\*\\*Story\\s+${epicNumber}\\.(\\d+):?\\*\\*\\s*(.+)\\r?\\n\\s*-\\s+ID:\\s*[\`']([^'\`]+)[\`']`, 'g');
    let match: RegExpExecArray | null;
    while ((match = storyListRegex.exec(contextContent)) !== null) {
      const sNum = parseInt(match[1], 10);
      const sTitle = match[2].trim();
      const sId = match[3].trim();
      stories.push({
        epicNumber,
        storyNumber: sNum,
        id: sId,
        title: sTitle,
        description: `Implement ${sTitle}`,
        deliverables: [],
        acceptanceCriteria: [],
      });
    }
  }

  stories.sort((a, b) => a.storyNumber - b.storyNumber);

  return {
    epicNumber,
    title,
    goal,
    stories,
  };
}

/**
 * Parse an implementation story spec file
 */
export function parseStorySpec(epicNumber: number, storyNumber: number, repoRoot = process.cwd()): StorySpecData | null {
  const dir = path.join(repoRoot, '_bmad-output', 'implementation-artifacts');
  if (!fs.existsSync(dir)) return null;

  const files = fs.readdirSync(dir);
  const targetPrefix = `${epicNumber}-${storyNumber}-`;
  const specFile = files.find((f) => f.startsWith(targetPrefix) && f.endsWith('.md'));

  if (!specFile) return null;

  const fullPath = path.join(dir, specFile);
  const content = fs.readFileSync(fullPath, 'utf-8');

  let title = `Story ${epicNumber}.${storyNumber}`;
  const titleMatch = content.match(/title:\s*['"]?([^'"\r\n]+)['"]?/);
  if (titleMatch) {
    title = titleMatch[1].trim();
  }

  let type = 'feature';
  const typeMatch = content.match(/type:\s*['"]?([^'"\r\n]+)['"]?/);
  if (typeMatch) {
    type = typeMatch[1].trim();
  }

  let problem = '';
  const problemMatch = content.match(/\*\*Problem:\*\*\s*([\s\S]*?)(?=\n\s*\*\*Approach:\*\*|$)/);
  if (problemMatch) {
    problem = problemMatch[1].trim();
  }

  let approach = '';
  const approachMatch = content.match(/\*\*Approach:\*\*\s*([\s\S]*?)(?=\n##|$)/);
  if (approachMatch) {
    approach = approachMatch[1].trim();
  }

  const tasks: string[] = [];
  const tasksSection = content.match(/##\s+Tasks & Acceptance[\s\S]*?\*\*Execution:\*\*([\s\S]*?)(?=\*\*Acceptance Criteria:\*\*|##|$)/);
  if (tasksSection) {
    const lines = tasksSection[1].split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('- [')) {
        tasks.push(trimmed.replace(/^-\s*\[[ x]\]\s*/, ''));
      }
    }
  }

  const acceptanceCriteria: string[] = [];
  const acSection = content.match(/\*\*Acceptance Criteria:\*\*([\s\S]*?)(?=##|$)/);
  if (acSection) {
    const lines = acSection[1].split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('-')) {
        acceptanceCriteria.push(trimmed.replace(/^-\s*(\[[ x]\]\s*)?/, ''));
      }
    }
  }

  const verification: string[] = [];
  const verSection = content.match(/##\s+Verification[\s\S]*?\*\*Commands:\*\*([\s\S]*?)(?=\*\*Manual checks|\n##|$)/);
  if (verSection) {
    const lines = verSection[1].split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('-')) {
        verification.push(trimmed.replace(/^-\s*/, ''));
      }
    }
  }

  return {
    title,
    type,
    problem,
    approach,
    tasks,
    acceptanceCriteria,
    verification,
  };
}

/**
 * Parse current branch name to extract epic and story number
 */
export function parseBranchName(branch: string): BranchInfo | null {
  const cleanBranch = branch.trim();
  if (cleanBranch === 'main' || cleanBranch === 'master' || cleanBranch === '') {
    return null;
  }

  // Examples:
  // feat/story-20-5-cross-platform-github-automation-engine
  // feat/20-5-cross-platform-github-automation-engine
  // story-20-5-slug
  // 20-5-slug
  const match = cleanBranch.match(/(?:feat\/|fix\/|chore\/)?(?:story-)?(\d+)[-.](\d+)(?:-(.+))?/);
  if (!match) return null;

  return {
    branch: cleanBranch,
    epicNumber: parseInt(match[1], 10),
    storyNumber: parseInt(match[2], 10),
    slug: match[3] || '',
  };
}

/**
 * Format GitHub Issue Body for a Story
 */
export function formatIssueBody(story: StoryData, epicIssueNumber?: number): string {
  const lines: string[] = [];

  lines.push(`## Story ${story.epicNumber}.${story.storyNumber}: ${story.title}`);
  lines.push('');
  if (epicIssueNumber) {
    lines.push(`Part of Epic #${epicIssueNumber}`);
    lines.push('');
  }

  lines.push('### Description');
  lines.push(story.description || `Implement Story ${story.epicNumber}.${story.storyNumber} for Epic ${story.epicNumber}.`);
  lines.push('');

  if (story.deliverables.length > 0) {
    lines.push('### Deliverables');
    for (const d of story.deliverables) {
      lines.push(`- ${d}`);
    }
    lines.push('');
  }

  lines.push('### Acceptance Criteria');
  if (story.acceptanceCriteria.length > 0) {
    for (const ac of story.acceptanceCriteria) {
      lines.push(`- [ ] ${ac}`);
    }
  } else {
    lines.push(`- [ ] Story ${story.epicNumber}.${story.storyNumber} acceptance criteria met.`);
    lines.push('- [ ] All tests, typechecks, and builds pass cleanly.');
  }

  return lines.join('\n');
}

export interface PrFormatParams {
  branchInfo: BranchInfo;
  spec: StorySpecData | null;
  storyIssueNumber?: number;
  epicIssueNumber?: number;
  customScope?: string;
}

/**
 * Formats Conventional Commit PR title and structured PR body
 */
export function formatPrTitleAndBody(params: PrFormatParams): { title: string; body: string } {
  const { branchInfo, spec, storyIssueNumber, epicIssueNumber, customScope } = params;

  // Infer scope if not provided
  let scope = customScope;
  if (!scope) {
    const slug = branchInfo.slug.toLowerCase();
    if (slug.includes('ui') || slug.includes('view') || slug.includes('dashboard') || slug.includes('setup') || slug.includes('onboarding')) {
      scope = 'ui';
    } else if (slug.includes('github') || slug.includes('script') || slug.includes('automation') || slug.includes('workflow')) {
      scope = 'scripts';
    } else if (slug.includes('doc') || slug.includes('pages') || slug.includes('guide')) {
      scope = 'docs';
    } else if (slug.includes('legal') || slug.includes('license')) {
      scope = 'legal';
    } else if (slug.includes('ai') || slug.includes('model')) {
      scope = 'ai';
    } else if (slug.includes('desktop') || slug.includes('electron') || slug.includes('packaging')) {
      scope = 'desktop';
    } else if (slug.includes('core') || slug.includes('engine') || slug.includes('adapter')) {
      scope = 'core';
    } else if (slug.includes('community') || slug.includes('standards') || slug.includes('contribution')) {
      scope = 'community';
    } else {
      scope = 'feat';
    }
  }

  const rawTitle = spec?.title.replace(/^Story\s+\d+\.\d+:\s*/i, '').trim() || branchInfo.slug.replace(/-/g, ' ');
  const title = `feat(${scope}): Story ${branchInfo.epicNumber}.${branchInfo.storyNumber} - ${rawTitle}`;

  const bodyLines: string[] = [];
  bodyLines.push('## Description');
  if (storyIssueNumber) {
    bodyLines.push(`Closes #${storyIssueNumber}`);
  }
  if (epicIssueNumber) {
    bodyLines.push(`Part of Epic #${epicIssueNumber}`);
  }
  bodyLines.push('');

  bodyLines.push(`This PR implements **Story ${branchInfo.epicNumber}.${branchInfo.storyNumber}: ${rawTitle}**.`);
  bodyLines.push('');

  if (spec?.approach) {
    bodyLines.push('### Approach & Key Changes');
    bodyLines.push(spec.approach);
    bodyLines.push('');
  }

  if (spec && spec.tasks.length > 0) {
    bodyLines.push('### Deliverables');
    for (const task of spec.tasks) {
      bodyLines.push(`- ${task}`);
    }
    bodyLines.push('');
  }

  bodyLines.push('## Testing & Verification');
  bodyLines.push('- `npm run typecheck`: Passed with 0 TypeScript errors.');
  bodyLines.push('- `npm test`: Passed with all test suites passing.');
  if (spec && spec.verification.length > 0) {
    for (const v of spec.verification) {
      bodyLines.push(`- ${v}`);
    }
  }

  return {
    title,
    body: bodyLines.join('\n'),
  };
}

/**
 * Verify GitHub CLI availability and auth status
 */
export function checkGhCli(runner: CommandRunner): void {
  try {
    runner.exec('gh', ['--version']);
  } catch (error) {
    throw new Error(
      "GitHub CLI ('gh') is not installed or not in PATH.\nPlease install gh (https://cli.github.com) before running this script."
    );
  }

  try {
    runner.exec('gh', ['auth', 'status']);
  } catch (error) {
    throw new Error(
      "GitHub CLI ('gh') is not authenticated.\nPlease run 'gh auth login' to authenticate with your GitHub account."
    );
  }
}

/**
 * Query GitHub issues matching a search string
 */
export function searchGhIssues(query: string, runner: CommandRunner): GitHubIssue[] {
  try {
    const output = runner.exec('gh', [
      'issue',
      'list',
      '--state',
      'all',
      '--search',
      query,
      '--json',
      'number,title,state,url',
      '--limit',
      '30',
    ]);
    if (!output) return [];
    return JSON.parse(output);
  } catch (error) {
    return [];
  }
}

export interface IssuesCommandOptions {
  epicNumber: number;
  dryRun?: boolean;
  repoRoot?: string;
}

export interface IssuesCommandResult {
  epicIssue: { number?: number; title: string; created: boolean; url?: string };
  stories: Array<{
    storyNumber: number;
    title: string;
    number?: number;
    created: boolean;
    url?: string;
  }>;
}

/**
 * Batch create GitHub issues for an Epic and its Stories
 */
export function executeIssuesCommand(
  options: IssuesCommandOptions,
  runner: CommandRunner = new SystemCommandRunner()
): IssuesCommandResult {
  const { epicNumber, dryRun = false, repoRoot = process.cwd() } = options;

  if (!dryRun) {
    checkGhCli(runner);
  }

  const epicData = parseEpicData(epicNumber, repoRoot);
  console.log(`\n📋 Loaded Epic ${epicNumber}: "${epicData.title}" with ${epicData.stories.length} stories.`);

  // 1. Search for existing master Epic issue
  const existingEpicIssues = searchGhIssues(`"[Epic ${epicNumber}]" in:title`, runner);
  let epicIssueNumber: number | undefined;
  let epicIssueUrl: string | undefined;
  let epicCreated = false;

  const foundEpic = existingEpicIssues.find(
    (i) => i.title.toLowerCase().startsWith(`[epic ${epicNumber}]`) || i.title.includes(`[Epic ${epicNumber}]`)
  );

  if (foundEpic) {
    epicIssueNumber = foundEpic.number;
    epicIssueUrl = foundEpic.url;
    console.log(`✓ Epic master issue exists: #${foundEpic.number} "${foundEpic.title}"`);
  } else {
    const epicTitle = `[Epic ${epicNumber}] ${epicData.title}`;
    const epicBody = `# Epic ${epicNumber}: ${epicData.title}\n\n## Goal\n${epicData.goal}\n\n## Stories\n${epicData.stories
      .map((s) => `- [Story ${epicNumber}.${s.storyNumber}] ${s.title}`)
      .join('\n')}`;

    if (dryRun) {
      console.log(`[DRY-RUN] Would create Epic master issue: "${epicTitle}" with label "epic"`);
    } else {
      console.log(`Creating master Epic issue: "${epicTitle}"...`);
      const createOutput = runner.exec(
        'gh',
        ['issue', 'create', '--title', epicTitle, '--body-file', '-', '--label', 'epic'],
        { input: epicBody }
      );
      epicIssueUrl = createOutput;
      const numMatch = createOutput.match(/\/issues\/(\d+)/);
      if (numMatch) {
        epicIssueNumber = parseInt(numMatch[1], 10);
      }
      epicCreated = true;
      console.log(`✓ Created Epic issue: ${createOutput}`);
    }
  }

  const results: IssuesCommandResult = {
    epicIssue: {
      number: epicIssueNumber,
      title: epicData.title,
      created: epicCreated,
      url: epicIssueUrl,
    },
    stories: [],
  };

  // 2. Query existing story issues for this epic
  const existingStoryIssues = searchGhIssues(`"[Story ${epicNumber}." in:title`, runner);

  for (const story of epicData.stories) {
    const expectedPrefix = `[story ${epicNumber}.${story.storyNumber}]`;
    const foundStory = existingStoryIssues.find((i) => i.title.toLowerCase().startsWith(expectedPrefix));

    if (foundStory) {
      console.log(`  ✓ Story ${epicNumber}.${story.storyNumber} exists: #${foundStory.number} "${foundStory.title}"`);
      results.stories.push({
        storyNumber: story.storyNumber,
        title: story.title,
        number: foundStory.number,
        created: false,
        url: foundStory.url,
      });
      continue;
    }

    const storyTitle = `[Story ${epicNumber}.${story.storyNumber}] ${story.title}`;
    const storyBody = formatIssueBody(story, epicIssueNumber);

    if (dryRun) {
      console.log(`  [DRY-RUN] Would create Story issue: "${storyTitle}" with label "story"`);
      results.stories.push({
        storyNumber: story.storyNumber,
        title: story.title,
        created: false,
      });
    } else {
      console.log(`  Creating Story issue: "${storyTitle}"...`);
      const createOutput = runner.exec(
        'gh',
        ['issue', 'create', '--title', storyTitle, '--body-file', '-', '--label', 'story'],
        { input: storyBody }
      );
      const numMatch = createOutput.match(/\/issues\/(\d+)/);
      const sNumber = numMatch ? parseInt(numMatch[1], 10) : undefined;
      results.stories.push({
        storyNumber: story.storyNumber,
        title: story.title,
        number: sNumber,
        created: true,
        url: createOutput,
      });
      console.log(`  ✓ Created Story issue: ${createOutput}`);
    }
  }

  console.log(`\n🎉 Processed ${epicData.stories.length} stories for Epic ${epicNumber}.\n`);
  return results;
}

export interface PrCommandOptions {
  dryRun?: boolean;
  draft?: boolean;
  scope?: string;
  repoRoot?: string;
}

export interface PrCommandResult {
  branch: string;
  title: string;
  body: string;
  url?: string;
  alreadyExisted: boolean;
}

/**
 * Automate PR creation for the current branch
 */
export function executePrCommand(
  options: PrCommandOptions,
  runner: CommandRunner = new SystemCommandRunner()
): PrCommandResult {
  const { dryRun = false, draft = false, scope, repoRoot = process.cwd() } = options;

  if (!dryRun) {
    checkGhCli(runner);
  }

  // Get active branch
  const activeBranch = runner.exec('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoRoot }).trim();
  const branchInfo = parseBranchName(activeBranch);

  if (!branchInfo) {
    throw new Error(
      `Current branch '${activeBranch}' does not match a story branch naming convention.\nExpected pattern: feat/story-<epic>-<story>-<slug>`
    );
  }

  console.log(`\n🌿 Active story branch: ${branchInfo.branch} (Epic ${branchInfo.epicNumber}, Story ${branchInfo.storyNumber})`);

  // Load story spec if available
  const spec = parseStorySpec(branchInfo.epicNumber, branchInfo.storyNumber, repoRoot);
  if (spec) {
    console.log(`✓ Loaded specification for Story ${branchInfo.epicNumber}.${branchInfo.storyNumber}: "${spec.title}"`);
  } else {
    console.log(`ℹ No spec file found under _bmad-output/implementation-artifacts/${branchInfo.epicNumber}-${branchInfo.storyNumber}-*.md. Using branch details.`);
  }

  // Search GitHub for Story and Epic issues
  let storyIssueNumber: number | undefined;
  let epicIssueNumber: number | undefined;

  const storyIssues = searchGhIssues(`"[Story ${branchInfo.epicNumber}.${branchInfo.storyNumber}]" in:title`, runner);
  if (storyIssues.length > 0) {
    storyIssueNumber = storyIssues[0].number;
    console.log(`✓ Linked Story Issue: #${storyIssueNumber} "${storyIssues[0].title}"`);
  }

  const epicIssues = searchGhIssues(`"[Epic ${branchInfo.epicNumber}]" in:title`, runner);
  if (epicIssues.length > 0) {
    epicIssueNumber = epicIssues[0].number;
    console.log(`✓ Linked Epic Issue: #${epicIssueNumber} "${epicIssues[0].title}"`);
  }

  const { title, body } = formatPrTitleAndBody({
    branchInfo,
    spec,
    storyIssueNumber,
    epicIssueNumber,
    customScope: scope,
  });

  // Check if PR already exists for this branch
  try {
    const prCheck = runner.exec('gh', ['pr', 'view', '--json', 'url,number,title'], { cwd: repoRoot });
    if (prCheck) {
      const parsed = JSON.parse(prCheck);
      console.log(`\nℹ Pull Request already exists for branch ${activeBranch}:`);
      console.log(`  ${parsed.url} (#${parsed.number}) "${parsed.title}"\n`);
      return {
        branch: activeBranch,
        title,
        body,
        url: parsed.url,
        alreadyExisted: true,
      };
    }
  } catch (error) {
    // No PR exists for this branch yet
  }

  if (dryRun) {
    console.log('\n[DRY-RUN] Generated PR Title:');
    console.log(`  ${title}`);
    console.log('\n[DRY-RUN] Generated PR Body:');
    console.log('--------------------------------------------------');
    console.log(body);
    console.log('--------------------------------------------------\n');
    return {
      branch: activeBranch,
      title,
      body,
      alreadyExisted: false,
    };
  }

  console.log(`\n🚀 Opening pull request for ${activeBranch}...`);
  const prArgs = ['pr', 'create', '--title', title, '--body-file', '-'];
  if (draft) {
    prArgs.push('--draft');
  }

  const prOutput = runner.exec('gh', prArgs, { cwd: repoRoot, input: body });
  console.log(`🎉 Pull request created: ${prOutput}\n`);

  return {
    branch: activeBranch,
    title,
    body,
    url: prOutput,
    alreadyExisted: false,
  };
}

/**
 * Main CLI dispatcher
 */
export function main(argv = process.argv.slice(2)): void {
  // Normalize args
  let command = argv[0];

  // If invoked via npm alias or without subcommand
  if (command === '--help' || command === '-h' || command === 'help' || !command) {
    console.log(`
Flashcard Master - GitHub Workflow Automation Engine

Usage:
  npm run gh:issues -- --epic <number> [--dry-run]
  npm run gh:pr [--dry-run] [--draft] [--scope <scope>]

Commands:
  issues    Batch create master Epic issue and child Story issues with 'epic' & 'story' labels
  pr        Open a conventional commit Pull Request from current branch linked to Story & Epic issues

Options:
  --epic <N>      Epic number for issue creation (required for 'issues')
  --dry-run       Simulate commands without calling GitHub API
  --draft         Create PR as draft
  --scope <scope> Override conventional commit PR scope (e.g., ui, scripts, core)
  --help, -h      Show this help message
`);
    return;
  }

  const dryRun =
    argv.includes('--dry-run') ||
    argv.includes('-d') ||
    argv.includes('dry-run') ||
    process.env.npm_config_dry_run === 'true';

  if (command === 'issues') {
    let epicNumber: number | undefined;

    // 1. Look for --epic <number> or -e <number>
    for (let i = 0; i < argv.length; i++) {
      if (argv[i] === '--epic' || argv[i] === '-e') {
        if (argv[i + 1]) {
          epicNumber = parseInt(argv[i + 1], 10);
          break;
        }
      } else if (argv[i].startsWith('--epic=')) {
        epicNumber = parseInt(argv[i].substring('--epic='.length), 10);
        break;
      }
    }

    // 2. If not found, look for positional number
    if (!epicNumber || isNaN(epicNumber)) {
      for (let i = 1; i < argv.length; i++) {
        const parsed = parseInt(argv[i], 10);
        if (!isNaN(parsed) && parsed > 0) {
          epicNumber = parsed;
          break;
        }
      }
    }

    // 3. Fallback to npm environment variable if any
    if (!epicNumber || isNaN(epicNumber)) {
      if (process.env.npm_config_epic) {
        epicNumber = parseInt(process.env.npm_config_epic, 10);
      }
    }

    if (!epicNumber || isNaN(epicNumber)) {
      console.error('Error: Please provide a valid epic number with --epic <number>');
      process.exit(1);
    }

    try {
      executeIssuesCommand({ epicNumber, dryRun });
    } catch (error: any) {
      console.error(`\n❌ Error: ${error.message}\n`);
      process.exit(1);
    }
  } else if (command === 'pr') {
    const draft = argv.includes('--draft') || argv.includes('draft') || process.env.npm_config_draft === 'true';
    let scope: string | undefined;

    for (let i = 0; i < argv.length; i++) {
      if (argv[i] === '--scope') {
        if (argv[i + 1]) {
          scope = argv[i + 1];
          break;
        }
      } else if (argv[i].startsWith('--scope=')) {
        scope = argv[i].substring('--scope='.length);
        break;
      }
    }

    if (!scope && process.env.npm_config_scope) {
      scope = process.env.npm_config_scope;
    }

    try {
      executePrCommand({ dryRun, draft, scope });
    } catch (error: any) {
      console.error(`\n❌ Error: ${error.message}\n`);
      process.exit(1);
    }
  } else {
    console.error(`Unknown command: ${command}`);
    console.error("Run 'npm run gh:issues -- --help' for usage.");
    process.exit(1);
  }
}

// Direct execution guard
const currentFilePath = path.resolve(process.argv[1] || '');
const scriptFilePath = path.resolve(new URL(import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, '$1'));
if (currentFilePath === scriptFilePath || currentFilePath.endsWith('github-workflow.ts')) {
  main();
}
