import type { Server } from 'node:http'
import { type Context, Service } from '@deepseek-ai/cordis'
import type { ApplicationRuntimeDependencies } from './types'

declare module '@deepseek-ai/cordis' {
  interface Context {
    http: StoryboundHttpService
  }
}

export class StoryboundHttpService extends Service {
  private currentServer: Server | null = null

  constructor(
    ctx: Context,
    private readonly dependencies: ApplicationRuntimeDependencies,
  ) {
    super(ctx, 'http')
  }

  get server() {
    return this.currentServer
  }

  async start() {
    if (this.currentServer) return this.currentServer
    this.currentServer = await this.dependencies.startHttpServer(this.ctx)
    return this.currentServer
  }

  async stop() {
    const server = this.currentServer
    if (!server) return
    this.currentServer = null
    await this.dependencies.stopHttpServer(server)
  }

  forceStop() {
    const server = this.currentServer
    if (!server) return
    this.currentServer = null
    this.dependencies.forceStopHttpServer(server)
  }
}
