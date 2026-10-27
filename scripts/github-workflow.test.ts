import { describe, it, expect, vi } from 'vitest';
import {
  parseEpicData,
  parseStorySpec,
  parseBranchName,
  formatIssueBody,
  formatPrTitleAndBody,
  checkGhCli,
  searchGhIssues,
  executeIssuesCommand,
  executePrCommand,
  type CommandRunner,
  type StoryData,
  type BranchInfo,
} from './github-workflow.js';

describe('github-workflow automation engine', () => {
  describe('parseBranchName', () => {
    it('parses conventional story branch names', () => {
      const res = parseBranchName('feat/story-20-5-cross-platform-github-automation-engine');
      expect(res).toEqual({
        branch: 'feat/story-20-5-cross-platform-github-automation-engine',
        epicNumber: 20,
        storyNumber: 5,
        slug: 'cross-platform-github-automation-engine',
      });
    });

    it('parses shortened numeric branch names', () => {
      const res = parseBranchName('feat/18-2-settings-studio');
      expect(res).toEqual({
        branch: 'feat/18-2-settings-studio',
        epicNumber: 18,
        storyNumber: 2,
        slug: 'settings-studio',
      });
    });

    it('parses story-N-S branch format', () => {
      const res = parseBranchName('story-19-1-infinite-scroll');
      expect(res).toEqual({
        branch: 'story-19-1-infinite-scroll',
        epicNumber: 19,
        storyNumber: 1,
        slug: 'infinite-scroll',
      });
    });

    it('returns null for main or master or unrecognized branches', () => {
      expect(parseBranchName('main')).toBeNull();
      expect(parseBranchName('master')).toBeNull();
      expect(parseBranchName('feat/unrelated-patch')).toBeNull();
      expect(parseBranchName('')).toBeNull();
    });
  });

  describe('parseEpicData', () => {
    it('extracts Epic 20 context and stories correctly', () => {
      const data = parseEpicData(20);
      expect(data.epicNumber).toBe(20);
      expect(data.title).toContain('Open-Source Foundations');
      expect(data.goal).toContain('Flashcard Master');
      expect(data.stories.length).toBeGreaterThanOrEqual(7);

      const s5 = data.stories.find((s) => s.storyNumber === 5);
      expect(s5).toBeDefined();
      expect(s5?.title).toContain('Cross-Platform GitHub');
      expect(s5?.acceptanceCriteria.length).toBeGreaterThan(0);
    });

    it('throws error for non-existent epic', () => {
      expect(() => parseEpicData(999)).toThrow(/Could not find epic context/);
    });
  });

  describe('parseStorySpec', () => {
    it('parses existing Story 20.5 spec file', () => {
      const spec = parseStorySpec(20, 5);
      expect(spec).not.toBeNull();
      expect(spec?.title).toContain('Story 20.5');
      expect(spec?.problem).toBeTruthy();
      expect(spec?.approach).toBeTruthy();
      expect(spec?.tasks.length).toBeGreaterThan(0);
      expect(spec?.acceptanceCriteria.length).toBeGreaterThan(0);
    });

    it('returns null for non-existent story spec', () => {
      const spec = parseStorySpec(99, 99);
      expect(spec).toBeNull();
    });
  });

  describe('formatIssueBody', () => {
    it('formats a clean Markdown issue body with Epic linkage', () => {
      const story: StoryData = {
        epicNumber: 20,
        storyNumber: 5,
        id: '20-5-cross-platform-github-automation-engine',
        title: 'Cross-Platform GitHub Automation',
        description: 'Implement GitHub CLI automation in TypeScript.',
        deliverables: ['scripts/github-workflow.ts', 'SKILL.md'],
        acceptanceCriteria: ['Runs on Windows and Linux', 'Idempotent creation'],
      };

      const body = formatIssueBody(story, 44);
      expect(body).toContain('## Story 20.5: Cross-Platform GitHub Automation');
      expect(body).toContain('Part of Epic #44');
      expect(body).toContain('### Description');
      expect(body).toContain('Implement GitHub CLI automation in TypeScript.');
      expect(body).toContain('### Deliverables');
      expect(body).toContain('- scripts/github-workflow.ts');
      expect(body).toContain('### Acceptance Criteria');
      expect(body).toContain('- [ ] Runs on Windows and Linux');
      expect(body).toContain('- [ ] Idempotent creation');
    });
  });

  describe('formatPrTitleAndBody', () => {
    const branchInfo: BranchInfo = {
      branch: 'feat/story-20-5-cross-platform-github-automation-engine',
      epicNumber: 20,
      storyNumber: 5,
      slug: 'cross-platform-github-automation-engine',
    };

    it('generates conventional commit PR title and body with linkages', () => {
      const spec = parseStorySpec(20, 5);
      const res = formatPrTitleAndBody({
        branchInfo,
        spec,
        storyIssueNumber: 52,
        epicIssueNumber: 44,
      });

      expect(res.title).toBe('feat(scripts): Story 20.5 - Cross-Platform GitHub Issue & PR Automation Engine');
      expect(res.body).toContain('## Description');
      expect(res.body).toContain('Closes #52');
      expect(res.body).toContain('Part of Epic #44');
      expect(res.body).toContain('## Testing & Verification');
      expect(res.body).toContain('npm run typecheck');
      expect(res.body).toContain('npm test');
    });

    it('infers proper scopes for various story slugs', () => {
      const uiBranch: BranchInfo = {
        branch: 'feat/story-20-4-contextual-setup-ux',
        epicNumber: 20,
        storyNumber: 4,
        slug: 'contextual-setup-ux',
      };
      const resUi = formatPrTitleAndBody({ branchInfo: uiBranch, spec: null });
      expect(resUi.title).toContain('feat(ui):');

      const docsBranch: BranchInfo = {
        branch: 'feat/story-20-3-documentation-hub',
        epicNumber: 20,
        storyNumber: 3,
        slug: 'documentation-hub',
      };
      const resDocs = formatPrTitleAndBody({ branchInfo: docsBranch, spec: null });
      expect(resDocs.title).toContain('feat(docs):');

      const customRes = formatPrTitleAndBody({
        branchInfo: docsBranch,
        spec: null,
        customScope: 'custom-scope',
      });
      expect(customRes.title).toContain('feat(custom-scope):');
    });
  });

  describe('checkGhCli', () => {
    it('throws error when gh is not installed', () => {
      const mockRunner: CommandRunner = {
        exec: vi.fn().mockImplementation((cmd) => {
          if (cmd === 'gh') throw new Error('Command not found');
          return '';
        }),
      };

      expect(() => checkGhCli(mockRunner)).toThrow(/not installed or not in PATH/);
    });

    it('throws error when gh is unauthenticated', () => {
      const mockRunner: CommandRunner = {
        exec: vi.fn().mockImplementation((cmd, args) => {
          if (args[0] === '--version') return 'gh version 2.100.0';
          if (args[0] === 'auth' && args[1] === 'status') throw new Error('You are not logged into any GitHub hosts');
          return '';
        }),
      };

      expect(() => checkGhCli(mockRunner)).toThrow(/not authenticated/);
    });
  });

  describe('searchGhIssues', () => {
    it('parses valid json array from gh issue list', () => {
      const mockRunner: CommandRunner = {
        exec: vi.fn().mockReturnValue(JSON.stringify([{ number: 44, title: '[Epic 20] Foundation', state: 'OPEN' }])),
      };

      const issues = searchGhIssues('[Epic 20]', mockRunner);
      expect(issues).toHaveLength(1);
      expect(issues[0].number).toBe(44);
    });

    it('returns empty array on runner error', () => {
      const mockRunner: CommandRunner = {
        exec: vi.fn().mockImplementation(() => {
          throw new Error('fail');
        }),
      };

      expect(searchGhIssues('anything', mockRunner)).toEqual([]);
    });
  });

  describe('executeIssuesCommand', () => {
    it('skips existing issues and handles dry-run without mutations', () => {
      const execMock = vi.fn().mockImplementation((cmd, args) => {
        if (args.includes('list')) {
          return JSON.stringify([
            { number: 44, title: '[Epic 20] Open-Source Foundations, Community Documentation & Cross-Platform Desktop Distribution', state: 'OPEN' },
            { number: 45, title: '[Story 20.1] Model Documentation Audit & In-Repo LLM Model Advisor Skill', state: 'CLOSED' },
          ]);
        }
        return '';
      });

      const runner: CommandRunner = { exec: execMock };

      const res = executeIssuesCommand({ epicNumber: 20, dryRun: true }, runner);
      expect(res.epicIssue.number).toBe(44);
      expect(res.stories.length).toBeGreaterThanOrEqual(7);

      const s1 = res.stories.find((s) => s.storyNumber === 1);
      expect(s1?.number).toBe(45);
      expect(s1?.created).toBe(false);

      // Verify no issue create commands executed during dry-run
      expect(execMock).not.toHaveBeenCalledWith('gh', expect.arrayContaining(['issue', 'create']), expect.anything());
    });

    it('creates missing story issues during non-dry run', () => {
      let createdCounter = 100;
      const execMock = vi.fn().mockImplementation((cmd, args) => {
        if (args[0] === '--version') return 'gh version 2.100.0';
        if (args[0] === 'auth') return 'Logged in to github.com';
        if (args.includes('list')) {
          return JSON.stringify([
            { number: 44, title: '[Epic 20] Open-Source Foundations, Community Documentation & Cross-Platform Desktop Distribution', state: 'OPEN' },
          ]);
        }
        if (args[0] === 'issue' && args[1] === 'create') {
          return `https://github.com/example/repo/issues/${++createdCounter}`;
        }
        return '';
      });

      const runner: CommandRunner = { exec: execMock };
      const res = executeIssuesCommand({ epicNumber: 20, dryRun: false }, runner);

      expect(res.epicIssue.number).toBe(44);
      const createdStories = res.stories.filter((s) => s.created);
      expect(createdStories.length).toBeGreaterThan(0);
      expect(createdStories[0].url).toContain('/issues/');
    });
  });

  describe('executePrCommand', () => {
    it('generates PR in dry-run mode without calling gh pr create', () => {
      const execMock = vi.fn().mockImplementation((cmd, args) => {
        if (cmd === 'git') return 'feat/story-20-5-cross-platform-github-automation-engine';
        if (args.includes('list')) {
          return JSON.stringify([
            { number: 44, title: '[Epic 20] Foundations', state: 'OPEN' },
            { number: 50, title: '[Story 20.5] GitHub Automation', state: 'OPEN' },
          ]);
        }
        if (args[0] === 'pr' && args[1] === 'view') {
          throw new Error('no pull request');
        }
        return '';
      });

      const runner: CommandRunner = { exec: execMock };
      const res = executePrCommand({ dryRun: true }, runner);

      expect(res.branch).toBe('feat/story-20-5-cross-platform-github-automation-engine');
      expect(res.title).toContain('feat(scripts): Story 20.5');
      expect(res.body).toContain('Part of Epic #44');
      expect(res.alreadyExisted).toBe(false);
      expect(execMock).not.toHaveBeenCalledWith('gh', expect.arrayContaining(['pr', 'create']), expect.anything());
    });

    it('returns existing PR details when PR already exists', () => {
      const execMock = vi.fn().mockImplementation((cmd, args) => {
        if (args[0] === '--version') return 'gh version 2.100.0';
        if (args[0] === 'auth') return 'Logged in';
        if (cmd === 'git') return 'feat/story-20-5-cross-platform-github-automation-engine';
        if (args[0] === 'pr' && args[1] === 'view') {
          return JSON.stringify({
            url: 'https://github.com/example/repo/pull/99',
            number: 99,
            title: 'feat(scripts): Story 20.5',
          });
        }
        return '[]';
      });

      const runner: CommandRunner = { exec: execMock };
      const res = executePrCommand({ dryRun: false }, runner);

      expect(res.alreadyExisted).toBe(true);
      expect(res.url).toBe('https://github.com/example/repo/pull/99');
    });

    it('throws error when active branch is main', () => {
      const execMock = vi.fn().mockImplementation((cmd) => {
        if (cmd === 'git') return 'main';
        return '';
      });

      const runner: CommandRunner = { exec: execMock };
      expect(() => executePrCommand({ dryRun: true }, runner)).toThrow(/does not match a story branch naming convention/);
    });
  });
});
