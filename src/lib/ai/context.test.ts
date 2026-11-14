import { describe, it, expect, vi } from 'vitest';
import { buildContext } from './context';
import * as schema from '../db/schema';

// Mock the DB layer
vi.mock('../db/schema', () => ({
  getDb: vi.fn(),
}));

describe('ContextEngine', () => {
  it('should build a context string with memories and active specs', async () => {
    const mockDb = {
      memories: {
        where: () => ({ equals: () => ({ toArray: async () => [
          { content: 'We prefer function components.', weight: 0.8, kind: 'lesson' },
          { content: 'Old irrelevant pattern.', weight: 0.2, kind: 'lesson' }, // Should be skipped or de-prioritized
        ] }) })
      },
      specs: {
        where: () => ({ equals: () => ({ toArray: async () => [
          { title: 'Feature A', content: 'Implement feature A.', status: 'implementing' }
        ] }) })
      },
      devLogs: {
        where: () => ({ equals: () => ({ toArray: async () => [
          { title: 'Started Feature A', body: 'Added scaffolding.', createdAt: 1000 }
        ] }) })
      },
      standards: {
        where: () => ({ equals: () => ({ toArray: async () => [
          { title: 'typescript', enforced: true, rule: 'Use strict typing.', category: 'architecture' }
        ] }) })
      }
    };

    vi.mocked(schema.getDb).mockReturnValue(mockDb as any);

    const ctx = await buildContext('project-123');

    // Assert that the context string includes our high-weight memory
    expect(ctx).toContain('We prefer function components.');
    
    // Assert it includes the active spec
    expect(ctx).toContain('Feature A');

    // Assert it includes the recent dev log
    expect(ctx).toContain('Started Feature A');
    
    // Assert it includes enabled standards
    expect(ctx).toContain('typescript: Use strict typing.');
  });
});
