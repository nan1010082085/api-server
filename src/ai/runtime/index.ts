/**
 * AI runtime — 纯函数层，供 graph / workflow / API 等多入口复用。
 */

export {
  resolveIntent,
  type IntentRouterInput,
  type IntentRouterOutput,
  type IntentRouterContext,
  type PluginRegistryLike,
} from './intentRouter.js'

export {
  analyzeRequirement,
  needsConfirmation,
  type RequirementAnalysisInput,
  type RequirementAnalysis,
  type RequirementAnalyzerContext,
} from './requirementAnalyzer.js'

export {
  planTasks,
  type TaskPlanInput,
  type TaskPlanOutput,
  type TaskPlanStep,
  type TaskPlannerContext,
} from './taskPlanner.js'

export {
  generateSummary,
  generateSummaryText,
  type SummarizerInput,
  type SummarizerContext,
} from './summarizer.js'

export {
  routeCollaboration,
  type CollaborationRouterInput,
  type CollaborationRouterOutput,
  type CollaborationRecord,
} from './collaborationRouter.js'
