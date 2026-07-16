/**
 * @vitest-environment node
 */
import { describe, it, expect, vi } from 'vitest'

// Mock getMetadata so dynamicPrompt tests don't require platform-shared package resolution
vi.mock('../tools/toolHandlers.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../tools/toolHandlers.js')>()
  return {
    ...actual,
    getMetadata: () => ({
      widgets: [],
      flowNodes: [],
      flowNodeGroups: [],
      pageComponents: [],
    }),
  }
})

import { PluginRegistry } from '../plugins/registry.js'
import { resolveExpertSystemPrompt } from '../plugins/resolveExpertPrompt.js'
import type { ExpertDeclaration, SkillDeclaration, PluginManifest } from '../plugins/types.js'

// ── helpers ──────────────────────────────────────────────────────────────────

function makeRegistry(skills: SkillDeclaration[] = [], experts: ExpertDeclaration[] = []) {
  const registry = new PluginRegistry()
  const manifest: PluginManifest = { version: 1, skills, experts }
  registry.registerManifest(manifest, 'test')
  return registry
}

function makeSkill(id: string, content: string, opts: Partial<SkillDeclaration> = {}): SkillDeclaration {
  return { id, label: id, content, ...opts }
}

function makeExpert(
  id: string,
  opts: Partial<ExpertDeclaration> & { skills?: string[] } = {},
): ExpertDeclaration {
  return {
    id,
    label: id,
    tools: [],
    ...opts,
  }
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('resolveExpertSystemPrompt', () => {
  it('returns empty string when no systemPrompt, no dynamicPrompt, no skills', async () => {
    const expert = makeExpert('e1')
    const registry = makeRegistry()
    const result = await resolveExpertSystemPrompt(expert, registry)
    expect(result).toBe('')
  })

  it('returns systemPrompt when no skills', async () => {
    const expert = makeExpert('e1', { systemPrompt: 'Hello world' })
    const registry = makeRegistry()
    const result = await resolveExpertSystemPrompt(expert, registry)
    expect(result).toBe('Hello world')
  })

  it('trims systemPrompt', async () => {
    const expert = makeExpert('e1', { systemPrompt: '  Hello world  ' })
    const registry = makeRegistry()
    const result = await resolveExpertSystemPrompt(expert, registry)
    expect(result).toBe('Hello world')
  })

  it('returns skill content when no base prompt', async () => {
    const skill = makeSkill('s1', 'Skill content')
    const expert = makeExpert('e1', { skills: ['s1'] })
    const registry = makeRegistry([skill], [expert])
    const result = await resolveExpertSystemPrompt(expert, registry)
    expect(result).toBe('Skill content')
  })

  it('appends skills after base prompt with double newline', async () => {
    const skill = makeSkill('s1', 'Skill block')
    const expert = makeExpert('e1', { systemPrompt: 'Base', skills: ['s1'] })
    const registry = makeRegistry([skill], [expert])
    const result = await resolveExpertSystemPrompt(expert, registry)
    expect(result).toBe('Base\n\nSkill block')
  })

  it('joins multiple skills with double newline', async () => {
    const s1 = makeSkill('s1', 'First skill')
    const s2 = makeSkill('s2', 'Second skill')
    const expert = makeExpert('e1', { systemPrompt: 'Base', skills: ['s1', 's2'] })
    const registry = makeRegistry([s1, s2], [expert])
    const result = await resolveExpertSystemPrompt(expert, registry)
    expect(result).toBe('Base\n\nFirst skill\n\nSecond skill')
  })

  it('preserves skill order from expert.skills array', async () => {
    const s1 = makeSkill('s1', 'AAA')
    const s2 = makeSkill('s2', 'BBB')
    const s3 = makeSkill('s3', 'CCC')
    const expert = makeExpert('e1', { skills: ['s3', 's1', 's2'] })
    const registry = makeRegistry([s1, s2, s3], [expert])
    const result = await resolveExpertSystemPrompt(expert, registry)
    expect(result).toBe('CCC\n\nAAA\n\nBBB')
  })

  it('skips missing skill ids silently', async () => {
    const s1 = makeSkill('s1', 'Exists')
    const expert = makeExpert('e1', { skills: ['s1', 'nonexistent', 'also-missing'] })
    const registry = makeRegistry([s1], [expert])
    const result = await resolveExpertSystemPrompt(expert, registry)
    expect(result).toBe('Exists')
  })

  it('skips skills with empty content', async () => {
    const s1 = makeSkill('s1', '')
    const s2 = makeSkill('s2', 'Has content')
    const expert = makeExpert('e1', { skills: ['s1', 's2'] })
    const registry = makeRegistry([s1, s2], [expert])
    const result = await resolveExpertSystemPrompt(expert, registry)
    expect(result).toBe('Has content')
  })

  it('skips disabled skills (enabled: false)', async () => {
    // PluginRegistry.registerManifest skips disabled items
    const s1 = makeSkill('s1', 'Disabled', { enabled: false })
    const s2 = makeSkill('s2', 'Active')
    const expert = makeExpert('e1', { skills: ['s1', 's2'] })
    const registry = makeRegistry([s1, s2], [expert])
    const result = await resolveExpertSystemPrompt(expert, registry)
    expect(result).toBe('Active')
  })

  it('trims skill content', async () => {
    const s1 = makeSkill('s1', '  Padded content  ')
    const expert = makeExpert('e1', { skills: ['s1'] })
    const registry = makeRegistry([s1], [expert])
    const result = await resolveExpertSystemPrompt(expert, registry)
    expect(result).toBe('Padded content')
  })

  it('returns only skills when base is empty and skills exist', async () => {
    const s1 = makeSkill('s1', 'Skill A')
    const s2 = makeSkill('s2', 'Skill B')
    const expert = makeExpert('e1', { skills: ['s1', 's2'] })
    const registry = makeRegistry([s1, s2], [expert])
    const result = await resolveExpertSystemPrompt(expert, registry)
    expect(result).toBe('Skill A\n\nSkill B')
  })

  it('duplicate skill ids in expert.skills duplicates content', async () => {
    const s1 = makeSkill('s1', 'Same content')
    const expert = makeExpert('e1', { skills: ['s1', 's1'] })
    const registry = makeRegistry([s1], [expert])
    const result = await resolveExpertSystemPrompt(expert, registry)
    expect(result).toBe('Same content\n\nSame content')
  })

  it('empty skills array returns base only', async () => {
    const expert = makeExpert('e1', { systemPrompt: 'Base only', skills: [] })
    const registry = makeRegistry()
    const result = await resolveExpertSystemPrompt(expert, registry)
    expect(result).toBe('Base only')
  })

  it('empty base + empty skills returns empty string', async () => {
    const expert = makeExpert('e1', { skills: [] })
    const registry = makeRegistry()
    const result = await resolveExpertSystemPrompt(expert, registry)
    expect(result).toBe('')
  })

  describe('dynamicPrompt', () => {
    it('uses general prompt builder when dynamicPrompt is general', async () => {
      const expert = makeExpert('e1', { dynamicPrompt: 'general' })
      const registry = makeRegistry()
      const result = await resolveExpertSystemPrompt(expert, registry, {
        generalPromptBuilder: () => 'Custom general prompt',
      })
      expect(result).toBe('Custom general prompt')
    })

    it('falls back to default general prompt when no builder provided', async () => {
      const expert = makeExpert('e1', { dynamicPrompt: 'general' })
      const registry = makeRegistry()
      const result = await resolveExpertSystemPrompt(expert, registry)
      expect(result).toBe('你是通用 AI 助手。')
    })

    it('appends skills after dynamicPrompt base', async () => {
      const s1 = makeSkill('s1', 'Extra rules')
      const expert = makeExpert('e1', { dynamicPrompt: 'general', skills: ['s1'] })
      const registry = makeRegistry([s1], [expert])
      const result = await resolveExpertSystemPrompt(expert, registry, {
        generalPromptBuilder: () => 'General base',
      })
      expect(result).toBe('General base\n\nExtra rules')
    })

    it('dynamicPrompt takes precedence over systemPrompt', async () => {
      const expert = makeExpert('e1', {
        dynamicPrompt: 'general',
        systemPrompt: 'This should be ignored',
      })
      const registry = makeRegistry()
      const result = await resolveExpertSystemPrompt(expert, registry, {
        generalPromptBuilder: () => 'Dynamic wins',
      })
      expect(result).toBe('Dynamic wins')
    })

    it('unknown dynamicPrompt value produces empty base', async () => {
      const expert = makeExpert('e1', { dynamicPrompt: 'unknown' as never })
      const registry = makeRegistry()
      const result = await resolveExpertSystemPrompt(expert, registry)
      expect(result).toBe('')
    })
  })

  describe('Skill priority over base', () => {
    it('skills appear after base prompt (last wins for LLM)', async () => {
      const s1 = makeSkill('s1', 'Skill overrides base')
      const expert = makeExpert('e1', { systemPrompt: 'Base instruction', skills: ['s1'] })
      const registry = makeRegistry([s1], [expert])
      const result = await resolveExpertSystemPrompt(expert, registry)
      // Skill is appended after base, so LLM sees it last
      expect(result.endsWith('Skill overrides base')).toBe(true)
      expect(result.startsWith('Base instruction')).toBe(true)
    })

    it('later skills have higher priority (appear last)', async () => {
      const s1 = makeSkill('s1', 'Low priority')
      const s2 = makeSkill('s2', 'High priority')
      const expert = makeExpert('e1', { skills: ['s1', 's2'] })
      const registry = makeRegistry([s1, s2], [expert])
      const result = await resolveExpertSystemPrompt(expert, registry)
      expect(result).toBe('Low priority\n\nHigh priority')
    })
  })
})
