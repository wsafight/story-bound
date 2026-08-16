import { expect, test } from '@playwright/test'

test('创建存档、固定记忆并开始下一章', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '走进一个故事' })).toBeVisible()

  await page.getByRole('link', { name: '打开雨夜终站' }).click()
  await expect(page.getByRole('heading', { name: '雨夜终站', exact: true })).toBeVisible()
  await page.getByRole('link', { name: '新建存档' }).click()

  await expect(page.getByRole('heading', { name: '设置你的进入方式' })).toBeVisible()
  await expect(page.getByLabel('你的名字')).toHaveValue('林舟')
  await page.getByLabel('叙事视角').selectOption('third_character')
  await page.getByLabel('视角人物').selectOption('char-station-master')
  await page.getByLabel('叙事时态').selectOption('past')
  await page.getByLabel('回复篇幅').selectOption('expanded')
  await page.getByLabel('对白密度').selectOption('high')
  await page.getByRole('button', { name: '进入故事' }).click()

  await expect(page).toHaveURL(/\/conversations\/[\w-]+$/)
  await expect(page.getByText('你比时刻表晚了三年', { exact: false })).toBeVisible()

  await page.getByRole('button', { name: '管理当前故事 MOD' }).click()
  const modPanel = page.getByRole('dialog', { name: '当前故事 MOD' })
  const narrativeMod = modPanel.locator('section').filter({ hasText: '叙事方式' })
  await expect(narrativeMod.getByRole('checkbox')).toBeChecked()
  await expect(narrativeMod.getByLabel('叙事视角')).toHaveValue('third_character')
  await expect(narrativeMod.getByLabel('视角人物')).toHaveValue('char-station-master')
  await expect(narrativeMod.getByLabel('叙事时态')).toHaveValue('past')
  await expect(narrativeMod.getByLabel('回复篇幅')).toHaveValue('expanded')
  await expect(narrativeMod.getByLabel('对白密度')).toHaveValue('high')
  await modPanel.getByRole('button', { name: '关闭' }).click()

  await page.getByRole('button', { name: '记忆', exact: true }).click()
  await expect(page.getByRole('button', { name: '已记忆' })).toBeVisible()

  await page.getByRole('button', { name: '结束本章' }).click()
  await page.getByLabel('章节标题').fill('雨夜抵达')
  await page.getByRole('button', { name: '保存并开始下一章' }).click()
  await expect(page.getByText('第 2 章', { exact: true }).first()).toBeVisible()
})
