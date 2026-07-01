/**
 * Flow Tools tests.
 *
 * 读取/校验类工具（search_flows、get_flow_detail、search_users、validate_flow、
 * search_schemas）已迁入 MCP Server，由 mcp.spec.ts 覆盖。
 * 此文件测试 LangGraph 专有工具集合（flowOnlyTools）和 flowService 校验逻辑。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../flow-models/FlowDefinition.js', () => ({
  FlowDefinitionModel: { find: vi.fn(), findById: vi.fn() },
}))
vi.mock('../../flow-models/FlowVersion.js', () => ({
  FlowVersionModel: { findById: vi.fn() },
}))
vi.mock('../../models/FormSchema.js', () => ({
  FormSchemaModel: { find: vi.fn() },
}))
vi.mock('../../models/User.js', () => ({
  UserModel: { find: vi.fn() },
}))

import { flowOnlyTools } from '../tools/flowTools.js'
import { validateFlowGraph } from '../services/flowService.js'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('flowOnlyTools (LangGraph 专有)', () => {
  it('defines 4 tools', () => {
    expect(flowOnlyTools).toHaveLength(4)
  })

  it('has correct tool names', () => {
    const names = flowOnlyTools.map((t) => t.name)
    expect(names).toEqual([
      'generate_schema',
      'save_and_bind_schema',
      'bind_schema_to_flow_node',
      'update_flow',
    ])
  })

  it('all tools have non-empty descriptions', () => {
    for (const t of flowOnlyTools) {
      expect(t.description.length).toBeGreaterThan(0)
    }
  })
})

// 读取/校验类工具的 invoke 测试已迁至 mcp.spec.ts（通过 InMemoryTransport 测试 MCP 工具）
// search_schemas (schemaTools) 已删除，由 MCP schema__search 覆盖

describe('validateFlowGraph', () => {
  it('returns valid for valid flow', () => {
    const result = validateFlowGraph({
      nodes: [
        { id: 'n1', data: { bpmnType: 'startEvent' } },
        { id: 'n2', data: { bpmnType: 'userTask', label: '审批', candidateUsers: ['u1'] } },
        { id: 'n3', data: { bpmnType: 'endEvent' } },
      ],
      edges: [
        { id: 'e1', source: { cell: 'n1' }, target: { cell: 'n2' } },
        { id: 'e2', source: { cell: 'n2' }, target: { cell: 'n3' } },
      ],
    })
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('reports missing startEvent', () => {
    const result = validateFlowGraph({
      nodes: [
        { id: 'n1', data: { bpmnType: 'userTask', label: '审批', candidateUsers: ['u1'] } },
        { id: 'n2', data: { bpmnType: 'endEvent' } },
      ],
      edges: [],
    })
    expect(result.errors).toContain('缺少 startEvent 开始节点')
  })

  it('reports missing endEvent', () => {
    const result = validateFlowGraph({
      nodes: [
        { id: 'n1', data: { bpmnType: 'startEvent' } },
        { id: 'n2', data: { bpmnType: 'userTask', label: '审批', candidateUsers: ['u1'] } },
      ],
      edges: [],
    })
    expect(result.errors).toContain('缺少 endEvent 结束节点')
  })

  it('reports empty nodes', () => {
    const result = validateFlowGraph({ nodes: [], edges: [] })
    expect(result.errors).toContain('流程至少需要一个节点')
  })

  it('reports invalid edge references', () => {
    const result = validateFlowGraph({
      nodes: [
        { id: 'n1', data: { bpmnType: 'startEvent' } },
        { id: 'n2', data: { bpmnType: 'endEvent' } },
      ],
      edges: [
        { id: 'e1', source: { cell: 'n1' }, target: { cell: 'nonexistent' } },
      ],
    })
    expect(result.errors.some((e) => e.includes('nonexistent'))).toBe(true)
  })

  it('reports userTask without assignee', () => {
    const result = validateFlowGraph({
      nodes: [
        { id: 'n1', data: { bpmnType: 'startEvent' } },
        { id: 'n2', data: { bpmnType: 'userTask', label: '审批' } },
        { id: 'n3', data: { bpmnType: 'endEvent' } },
      ],
      edges: [
        { id: 'e1', source: { cell: 'n1' }, target: { cell: 'n2' } },
        { id: 'e2', source: { cell: 'n2' }, target: { cell: 'n3' } },
      ],
    })
    expect(result.errors.some((e) => e.includes('缺少指派人配置'))).toBe(true)
  })

  it('reports timerEvent without timer config', () => {
    const result = validateFlowGraph({
      nodes: [
        { id: 'n1', data: { bpmnType: 'startEvent' } },
        { id: 'n2', data: { bpmnType: 'timerEvent', label: '超时' } },
        { id: 'n3', data: { bpmnType: 'endEvent' } },
      ],
      edges: [
        { id: 'e1', source: { cell: 'n1' }, target: { cell: 'n2' } },
        { id: 'e2', source: { cell: 'n2' }, target: { cell: 'n3' } },
      ],
    })
    expect(result.errors.some((e) => e.includes('缺少 timerType'))).toBe(true)
  })

  it('reports exclusiveGateway without conditions', () => {
    const result = validateFlowGraph({
      nodes: [
        { id: 'n1', data: { bpmnType: 'startEvent' } },
        { id: 'n2', data: { bpmnType: 'exclusiveGateway', gatewayDirection: 'diverging' } },
        { id: 'n3', data: { bpmnType: 'endEvent' } },
        { id: 'n4', data: { bpmnType: 'endEvent' } },
      ],
      edges: [
        { id: 'e1', source: { cell: 'n1' }, target: { cell: 'n2' } },
        { id: 'e2', source: { cell: 'n2' }, target: { cell: 'n3' } },
        { id: 'e3', source: { cell: 'n2' }, target: { cell: 'n4' } },
      ],
    })
    expect(result.errors.some((e) => e.includes('排他网关'))).toBe(true)
  })

  it('accepts exclusiveGateway with defaultFlow', () => {
    const result = validateFlowGraph({
      nodes: [
        { id: 'n1', data: { bpmnType: 'startEvent' } },
        { id: 'n2', data: { bpmnType: 'exclusiveGateway', gatewayDirection: 'diverging', defaultFlow: 'e2' } },
        { id: 'n3', data: { bpmnType: 'endEvent' } },
        { id: 'n4', data: { bpmnType: 'endEvent' } },
      ],
      edges: [
        { id: 'e1', source: { cell: 'n1' }, target: { cell: 'n2' } },
        { id: 'e2', source: { cell: 'n2' }, target: { cell: 'n3' } },
        { id: 'e3', source: { cell: 'n2' }, target: { cell: 'n4' } },
      ],
    })
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })
})
