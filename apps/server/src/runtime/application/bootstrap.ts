import type { Fiber } from '@deepseek-ai/cordis'
import { disposeStoryboundPlugin, installStoryboundPlugin, startStoryboundRuntime } from '../storyboundRuntime'
import type { StoryboundApplicationService } from './applicationService'
import { defaultApplicationDependencies } from './defaultDependencies'
import { createStoryboundApplicationRuntime } from './factory'

const applicationRuntime = createStoryboundApplicationRuntime(defaultApplicationDependencies)
let applicationFiber: Fiber | null = null
let startTask: Promise<StoryboundApplicationService> | null = null

export function startStoryboundApplication() {
  const active = applicationRuntime.getService()
  if (active?.state === 'active') return Promise.resolve(active)
  if (startTask) return startTask
  startTask = (async () => {
    await startStoryboundRuntime()
    const fiber = await installStoryboundPlugin(applicationRuntime.plugin)
    const service = applicationRuntime.getService()
    if (!service) {
      await disposeStoryboundPlugin(fiber)
      throw new Error('Storybound application service did not start')
    }
    applicationFiber = fiber
    return service
  })()
  return startTask.finally(() => {
    startTask = null
  })
}

export async function stopStoryboundApplication() {
  if (startTask) await startTask.catch(() => undefined)
  const fiber = applicationFiber
  applicationFiber = null
  if (fiber) await disposeStoryboundPlugin(fiber)
}

export function forceStopStoryboundApplication() {
  applicationRuntime.getService()?.forceStop()
}
