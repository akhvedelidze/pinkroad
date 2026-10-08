import { expect, test } from '@playwright/test'

test('a team finishes the route on a phone screen in debug mode', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('?debug=1')

  await page.getByRole('button', { name: 'თამაში' }).click()
  await page.getByRole('textbox', { name: 'გუნდის კოდი' }).fill('ROSE')
  await page.getByRole('textbox', { name: 'გუნდის სახელი' }).fill('ვარდისფერი')
  await page.getByRole('button', { name: 'შესვლა' }).click()

  const status = page.locator('.play-status')
  await expect(status).toContainText('1/')
  const total = Number((await status.innerText()).match(/\/(\d+)/)?.[1])
  expect(total).toBeGreaterThan(10)

  await page.getByRole('button', { name: '+5 ქულა' }).click()
  await expect(status).toContainText('5 ქულა')

  for (let order = 1; order <= total; order += 1) {
    await expect(status).toContainText(`${order}/${total}`)
    await page.getByRole('button', { name: 'გამოტოვე პუნქტი' }).click()
  }

  await expect(page.getByText('მარშრუტი დასრულდა.')).toBeVisible()
  await expect(page.getByText('ვარდისფერი')).toBeVisible()
  await expect(page.locator('.result-score')).toHaveText('5')
  await expect(page.locator('.result-attempt')).toHaveText('1')
  await expect(page.locator('.finish-code')).toHaveText(/^ROSE\.1\.\d+\.5\.[0-9a-f]{8}$/)
  await expect(page.getByRole('button', { name: 'გამოტოვე პუნქტი' })).toHaveCount(0)

  await page.getByRole('button', { name: 'სცადე ხელახლა' }).click()
  await expect(status).toContainText('1/')
  await expect(status).toContainText('ცდა 2')
  await expect(status).toContainText('0 ქულა')
})
