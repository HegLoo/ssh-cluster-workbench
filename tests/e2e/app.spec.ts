import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, test, _electron as electron } from '@playwright/test'

test('opens the workspace gate on first launch', async () => {
  const userData = await mkdtemp(join(tmpdir(), 'workbench-e2e-'))
  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      WORKBENCH_USER_DATA: userData
    }
  })

  try {
    const window = await app.firstWindow()
    await expect(window.getByText('SSH Cluster Workbench')).toBeVisible()
    await expect(window.getByText('选择工作目录')).toBeVisible()
  } finally {
    await app.close()
    await rm(userData, { recursive: true, force: true })
  }
})
