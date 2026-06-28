/**
 * 迁移脚本：将所有 UUID 字符串 _id 转换为 MongoDB ObjectId
 *
 * 用法：tsx scripts/migrate-to-objectid.ts
 *
 * 步骤：
 * 1. 遍历所有集合
 * 2. 对于每条记录，如果 _id 是字符串格式（非 ObjectId），生成新的 ObjectId
 * 3. 更新所有引用该 _id 的外键字段
 * 4. 删除旧记录，插入新记录
 */

import 'dotenv/config'
import mongoose from 'mongoose'

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://101.42.90.95:27018/schema-form'

// 判断是否为有效的 ObjectId（24位十六进制字符串）
function isValidObjectId(id: string): boolean {
  return /^[0-9a-f]{24}$/i.test(id)
}

// 集合之间的外键映射关系
// 格式：{ 集合名: { 外键字段: 引用的集合名 } }
const FOREIGN_KEY_MAP: Record<string, Record<string, string>> = {
  // 菜单
  menus: { parentId: 'menus', microAppId: 'microapps' },
  // 部门
  depts: { parentId: 'depts' },
  // 角色
  roles: { deptId: 'depts' },
  // 用户
  users: { deptId: 'depts' },
  // 表单模式
  formschemas: { createdBy: 'users' },
  // 流程定义
  flowdefinitions: { createdBy: 'users' },
  // 流程版本
  flowversions: { definitionId: 'flowdefinitions' },
  // 流程实例
  flowinstances: { definitionId: 'flowdefinitions', versionId: 'flowversions', startedBy: 'users' },
  // 任务实例
  taskinstances: { instanceId: 'flowinstances', assignee: 'users' },
  // 审批日志
  approvallogs: { instanceId: 'flowinstances', taskId: 'taskinstances', operator: 'users' },
  // 定时任务
  timerjobs: { instanceId: 'flowinstances' },
  // 通知
  notifications: { userId: 'users' },
  // 表单提交
  formsubmissions: { schemaId: 'formschemas', submitterId: 'users' },
  // 字典数据
  dictdatas: { dictTypeId: 'dicttypes' },
  // 发布模式
  publishedschemas: { sourceId: 'formschemas' },
  // Webhook
  webhooks: { createdBy: 'users' },
  // Webhook 日志
  webhooklogs: { webhookId: 'webhooks' },
  // AI 对话
  aiconversations: { schemaId: 'formschemas', flowId: 'flowdefinitions' },
  // AI 版本
  aiversions: { conversationId: 'aiconversations' },
  // AI 反馈
  aifeedbacks: { conversationId: 'aiconversations', userId: 'users' },
  // 插件
  plugins: {},
  // 用户插件
  userplugins: { userId: 'users', pluginId: 'plugins' },
  // 提示词模板
  prompttemplates: {},
  // 提示词版本
  promptversions: { promptId: 'prompttemplates' },
  // 凭证
  credentials: { createdBy: 'users' },
  // 微应用
  microapps: {},
  // 客户端
  clients: {},
  // 配置
  configs: {},
  // 岗位
  posts: {},
  // SSO 会话
  ssosessions: { userId: 'users' },
  // 授权码
  authorizationcodes: { userId: 'users', clientId: 'clients' },
  // API 密钥
  apikeys: { userId: 'users' },
  // 审计日志
  auditlogs: { userId: 'users' },
  // 登录日志
  loginlogs: { userId: 'users' },
  // 用户行为
  userbehaviors: { userId: 'users' },
  // 协作会话
  collaborationsessions: {},
  // Schema 嵌入
  schemaembeddings: { schemaId: 'formschemas' },
  // 节点执行日志
  nodeexecutionlogs: { instanceId: 'flowinstances' },
  // 流程消息
  flowmessages: {},
  // 流程模板
  flowtemplates: {},
  // Widget 模板
  widgettemplates: {},
  // AI 检查点
  ai_checkpoints: {},
  ai_checkpoint_writes: {},
  // Agent 指标
  agentmetrics: {},
}

// 不需要迁移 _id 的集合（_id 不是 UUID 格式）
const SKIP_COLLECTIONS = new Set([
  'tenants', // _id 是 '000000'
])

async function migrateCollection(
  db: mongoose.Connection['db'],
  collectionName: string,
  idMapping: Map<string, mongoose.Types.ObjectId>,
) {
  const col = db!.collection(collectionName)
  const docs = await col.find({}).toArray()

  if (docs.length === 0) {
    console.log(`  [跳过] ${collectionName}: 无数据`)
    return
  }

  let migrated = 0
  let skipped = 0

  for (const doc of docs) {
    const oldId = doc._id?.toString?.()

    // 跳过已经是 ObjectId 格式的 _id
    if (!oldId || isValidObjectId(oldId)) {
      skipped++
      continue
    }

    // 生成新的 ObjectId
    const newId = new mongoose.Types.ObjectId()

    // 更新外键引用
    const fkMap = FOREIGN_KEY_MAP[collectionName] || {}
    const updateDoc = { ...doc, _id: newId }

    for (const [field, refCollection] of Object.entries(fkMap)) {
      if (updateDoc[field] && typeof updateDoc[field] === 'string') {
        const mappedId = idMapping.get(updateDoc[field])
        if (mappedId) {
          updateDoc[field] = mappedId
        }
      }
    }

    // 处理数组字段中的外键引用
    // 例如 users.roles 是一个字符串数组，包含角色 ID
    if (collectionName === 'users' && Array.isArray(updateDoc.roles)) {
      updateDoc.roles = updateDoc.roles.map((roleId: string) => {
        const mappedId = idMapping.get(roleId)
        return mappedId ? mappedId.toString() : roleId
      })
    }

    // 删除旧记录，插入新记录
    await col.deleteOne({ _id: oldId })
    await col.insertOne(updateDoc)

    // 记录映射关系
    idMapping.set(oldId, newId)
    migrated++
  }

  console.log(`  [完成] ${collectionName}: 迁移 ${migrated} 条, 跳过 ${skipped} 条`)
}

async function main() {
  console.log('=== MongoDB _id 迁移脚本 ===')
  console.log(`连接: ${MONGODB_URI}`)
  console.log('')

  await mongoose.connect(MONGODB_URI)
  const db = mongoose.connection.db!

  // 获取所有集合
  const collections = await db.listCollections().toArray()
  const collectionNames = collections.map((c) => c.name)

  // 全局 ID 映射：旧 UUID -> 新 ObjectId
  const idMapping = new Map<string, mongoose.Types.ObjectId>()

  // 第一遍：收集所有旧 _id 并生成新 ObjectId
  console.log('第一遍：收集所有字符串 _id...')
  for (const name of collectionNames) {
    if (SKIP_COLLECTIONS.has(name)) continue

    const col = db.collection(name)
    const docs = await col.find({}).toArray()

    for (const doc of docs) {
      const oldId = doc._id?.toString?.()
      if (oldId && !isValidObjectId(oldId)) {
        idMapping.set(oldId, new mongoose.Types.ObjectId())
      }
    }
  }
  console.log(`找到 ${idMapping.size} 个字符串 _id 需要迁移`)

  // 第二遍：按依赖顺序迁移
  // 先迁移没有外键依赖的集合
  const noDeps = ['tenants', 'configs', 'posts', 'microapps', 'clients', 'plugins', 'prompttemplates', 'widgettemplates', 'flowtemplates']
  const hasDeps = collectionNames.filter((n) => !noDeps.includes(n) && !SKIP_COLLECTIONS.has(n))

  console.log('')
  console.log('第二遍：迁移数据...')

  // 先迁移无依赖的集合
  for (const name of noDeps) {
    if (collectionNames.includes(name)) {
      await migrateCollection(db, name, idMapping)
    }
  }

  // 再迁移有依赖的集合
  for (const name of hasDeps) {
    await migrateCollection(db, name, idMapping)
  }

  console.log('')
  console.log('=== 迁移完成 ===')
  console.log(`共迁移 ${idMapping.size} 个 _id`)

  await mongoose.disconnect()
}

main().catch((err) => {
  console.error('迁移失败:', err)
  process.exit(1)
})
