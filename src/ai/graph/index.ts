/**
 * AI Agent Graph — exports.
 *
 * Re-exports the compiled graph, node functions, state types,
 * and shared utilities still used by tools and schemaGenerator.
 */

// Compiled graph (primary entry point)
export { graph, routeAfterTaskChain, afterAgent, routeAfterCollaborationRouter, afterToolsRoute } from './graph.js'

// Checkpointer (for thread-based conversation persistence)
export { checkpointer } from './checkpointer.js'

// State definition
export { AgentStateAnnotation } from './state.js'
export type { AIConversationState, AgentStateUpdate, ActiveAgent, TaskStep, AIContext } from './state.js'

// LangGraph expert node
export { pluginExpertAgentNode } from './pluginExpertAgent.js'

// Shared utilities (used by tools and schemaGenerator)
export {
  getModelForTask,
  getActiveModelIdentifiers,
  escapeRegex,
} from './agentBase.js'
export type { TaskType } from './agentBase.js'
