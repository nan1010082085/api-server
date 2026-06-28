import { ClientModel } from '../models/Client.js'
import { DEFAULT_TENANT_ID } from './initDefaultTenant.js'

const PROD_ORIGIN = process.env.PROD_ORIGIN || 'https://pyflow.icu'

const DEFAULT_CLIENTS = [
  {
    clientId: 'shell',
    name: 'Shell 应用',
    redirectUris: [
      'http://localhost:5050/auth/callback',
      `${PROD_ORIGIN}/auth/callback`,
      'http://localhost:5050/sso/callback',
      'http://localhost:5050/schema-platform/sso/callback',
      `${PROD_ORIGIN}/schema-platform/sso/callback`,
    ],
    type: 'public' as const,
  },
  {
    clientId: 'editor',
    name: '表单设计器',
    redirectUris: [
      'http://localhost:5100/auth/callback',
      'http://localhost:5100/schema-platform/editor/auth/callback',
      `${PROD_ORIGIN}/schema-platform/editor/auth/callback`,
    ],
    type: 'public' as const,
  },
  {
    clientId: 'flow',
    name: '流程设计器',
    redirectUris: [
      'http://localhost:5200/auth/callback',
      'http://localhost:5200/schema-platform/flow/auth/callback',
      `${PROD_ORIGIN}/schema-platform/flow/auth/callback`,
    ],
    type: 'public' as const,
  },
  {
    clientId: 'ai',
    name: 'AI 应用',
    redirectUris: [
      'http://localhost:5300/auth/callback',
      'http://localhost:5300/schema-platform/ai/auth/callback',
      `${PROD_ORIGIN}/schema-platform/ai/auth/callback`,
    ],
    type: 'public' as const,
  },
  // admin SSO client 待新 admin 壳应用完成后重新配置
]

/**
 * 种子 SSO Client 配置
 * 使用 upsert + $setOnInsert 保证幂等：仅在记录不存在时创建，不覆盖用户修改
 */
export async function seedClients(): Promise<void> {
  let created = 0

  for (const client of DEFAULT_CLIENTS) {
    const result = await ClientModel.updateOne(
      { clientId: client.clientId },
      {
        $setOnInsert: {
          ...client,
          secret: '',
          scopes: ['openid', 'profile', 'email'],
          status: 'active',
          tenantId: DEFAULT_TENANT_ID,
        },
      },
      { upsert: true },
    )
    if (result.upsertedCount > 0) created++
  }

  const skipped = DEFAULT_CLIENTS.length - created
  console.log(`[seed] SSO clients: ${created} created, ${skipped} already existed`)
}
