import { config } from '../config'

export class GenerationScheduler {
  private activeCount = 0

  constructor(readonly limit: number) {}

  acquire() {
    if (this.activeCount >= this.limit) return null
    this.activeCount += 1
    let released = false
    return () => {
      if (released) return
      released = true
      this.activeCount = Math.max(0, this.activeCount - 1)
    }
  }

  status() {
    return { active: this.activeCount, limit: this.limit }
  }

  reset() {
    this.activeCount = 0
  }
}

const defaultScheduler = new GenerationScheduler(config.llmMaxConcurrency)

export function acquireGenerationPermit() {
  return defaultScheduler.acquire()
}

export function getSchedulerState() {
  return defaultScheduler.status()
}
