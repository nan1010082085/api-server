/**
 * 插件中心注册表 — 合并配置中的 Expert / Skill / Tool / MCP 声明。
 */

import type {
  ExpertDeclaration,
  LegacyAgentKey,
  McpServerDeclaration,
  PluginManifest,
  PluginRuntime,
  PluginToolDeclaration,
  SkillDeclaration,
} from './types.js'

function isEnabled(item: { enabled?: boolean }): boolean {
  return item.enabled !== false
}

export class PluginRegistry {
  private experts = new Map<string, ExpertDeclaration>()
  private expertsByLegacy = new Map<LegacyAgentKey, ExpertDeclaration>()
  private skills = new Map<string, SkillDeclaration>()
  private tools = new Map<string, PluginToolDeclaration>()
  private mcpServers = new Map<string, McpServerDeclaration>()

  registerManifest(manifest: PluginManifest, label: string): void {
    for (const item of manifest.mcpServers ?? []) {
      if (!isEnabled(item)) continue
      this.mcpServers.set(item.id, item)
    }
    for (const item of manifest.tools ?? []) {
      this.tools.set(item.name, item)
    }
    for (const item of manifest.skills ?? []) {
      if (!isEnabled(item)) continue
      this.skills.set(item.id, item)
    }
    for (const item of manifest.experts ?? []) {
      if (!isEnabled(item)) continue
      this.experts.set(item.id, item)
      if (item.legacyAgentKey) {
        this.expertsByLegacy.set(item.legacyAgentKey, item)
      }
    }
  }

  getExpert(id: string): ExpertDeclaration | undefined {
    return this.experts.get(id)
  }

  getExpertByLegacyKey(key: LegacyAgentKey): ExpertDeclaration | undefined {
    return this.expertsByLegacy.get(key)
  }

  listExperts(opts: { runtime?: PluginRuntime } = {}): ExpertDeclaration[] {
    const items = [...this.experts.values()]
    if (!opts.runtime) return items
    return items.filter((e) => !e.runtime?.length || e.runtime.includes(opts.runtime))
  }

  getSkill(id: string): SkillDeclaration | undefined {
    return this.skills.get(id)
  }

  listSkills(): SkillDeclaration[] {
    return [...this.skills.values()]
  }

  getToolDeclaration(name: string): PluginToolDeclaration | undefined {
    return this.tools.get(name)
  }

  listToolDeclarations(): PluginToolDeclaration[] {
    return [...this.tools.values()]
  }

  getMcpServer(id: string): McpServerDeclaration | undefined {
    return this.mcpServers.get(id)
  }

  listMcpServers(): McpServerDeclaration[] {
    return [...this.mcpServers.values()]
  }

  /** 合并 expert.tools + skills 引用的 tools，去重保序 */
  resolveExpertToolNames(expertId: string): string[] {
    const expert = this.experts.get(expertId)
    if (!expert) return []
    return this.mergeToolNames(expert.tools, expert.skills)
  }

  resolveExpertToolNamesByLegacyKey(key: LegacyAgentKey): string[] {
    const expert = this.expertsByLegacy.get(key)
    if (!expert) return []
    return this.mergeToolNames(expert.tools, expert.skills)
  }

  private mergeToolNames(toolNames: string[], skillIds?: string[]): string[] {
    const seen = new Set<string>()
    const result: string[] = []
    const add = (name: string) => {
      if (!name || seen.has(name)) return
      seen.add(name)
      result.push(name)
    }
    for (const name of toolNames) add(name)
    for (const skillId of skillIds ?? []) {
      const skill = this.skills.get(skillId)
      for (const name of skill?.tools ?? []) add(name)
    }
    return result
  }

  /** 供 LangGraph router / taskPlanner：按 context 与关键词匹配专家 */
  matchExpertsByRouting(input: {
    text?: string
    contextSource?: string
    runtime?: PluginRuntime
  }): ExpertDeclaration[] {
    const text = (input.text ?? '').toLowerCase()
    const scored: Array<{ expert: ExpertDeclaration; score: number }> = []

    for (const expert of this.listExperts({ runtime: input.runtime ?? 'langgraph' })) {
      if (!expert.routing || expert.legacyAgentKey === 'general') continue
      let score = expert.routing.priority ?? 0

      if (input.contextSource && expert.routing.contextSources?.includes(input.contextSource as never)) {
        score += 100
      }
      for (const kw of expert.routing.keywords ?? []) {
        if (text.includes(kw.toLowerCase())) score += 10
      }
      if (score > (expert.routing.priority ?? 0)) {
        scored.push({ expert, score })
      }
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .map((item) => item.expert)
  }
}
