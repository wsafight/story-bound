import { expect, test } from '@playwright/test'

function storyDraft(extra: Record<string, unknown> = {}) {
  return {
    title: '边界测试',
    background: 'a'.repeat(30_000),
    worldRules: 'b'.repeat(5_000),
    characters: [],
    abilities: [],
    scenes: [],
    playerTemplate: { roleName: '', background: '', goals: '', defaultValues: {} },
    ...extra,
  }
}

test.describe('HTTP 请求边界', () => {
  test('接受超过普通 JSON 上限但仍在故事草稿上限内的合法数据', async ({ request }) => {
    const response = await request.post('/api/story-cards/lint', { data: storyDraft() })
    expect(response.status()).toBe(200)
    expect(((await response.json()) as { issues: unknown[] }).issues.length).toBeGreaterThan(0)
  })

  test('把过大的故事草稿映射为 413', async ({ request }) => {
    const response = await request.post('/api/story-cards/lint', {
      data: storyDraft({ description: 'x'.repeat(1_048_576) }),
    })
    expect(response.status()).toBe(413)
    expect(await response.json()).toEqual({
      error: { code: 'REQUEST_BODY_TOO_LARGE', message: '提交的数据超过大小限制' },
    })
  })

  test('把畸形 JSON 映射为 400', async ({ request }) => {
    const response = await request.fetch('/api/story-cards/lint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: '{"title":',
    })
    expect(response.status()).toBe(400)
    expect(await response.json()).toEqual({ error: { code: 'INVALID_JSON', message: '请求正文不是有效的 JSON' } })
  })
})
