import type { Database } from 'bun:sqlite'
import { type Context, Service } from '@deepseek-ai/cordis'
import type { GenerateStoryDraftInput, StoryDraftInput } from '../../domain/schemas'
import { StoriesRepository } from '../../repositories/stories'
import {
  createStoryDraft,
  deleteStoryDraft,
  duplicateStory,
  exportStoryPackage,
  generateStoryDraftFromPrompt,
  importStoryPackage,
  lintStoryDraft,
  publishStory,
  updateStoryDraft,
} from '../../services/storyEditorService'
import type { StoryboundLlmService } from '../infrastructureRuntime'
import type { StoryboundProvidersService } from './providersService'

declare module '@deepseek-ai/cordis' {
  interface Context {
    stories: StoryboundStoriesService
  }
}

export class StoryboundStoriesService extends Service {
  private readonly repository: StoriesRepository

  constructor(
    ctx: Context,
    private readonly database: Database,
    private readonly llm: StoryboundLlmService,
    private readonly providers: StoryboundProvidersService,
  ) {
    super(ctx, 'stories')
    this.repository = new StoriesRepository(database)
  }

  list() {
    return this.repository.list()
  }

  get(storyId: string, includeDraft = false) {
    return this.repository.get(storyId, includeDraft)
  }

  listConversations(storyId: string) {
    return this.repository.listConversations(storyId)
  }

  lint(input: StoryDraftInput) {
    return lintStoryDraft(input)
  }

  create(input: StoryDraftInput) {
    return createStoryDraft(input, this.database)
  }

  generate(input: GenerateStoryDraftInput, signal?: AbortSignal) {
    return generateStoryDraftFromPrompt(input, {
      provider: this.providers.defaultSnapshot(),
      stream: (streamInput) => this.llm.stream(streamInput),
      signal,
      database: this.database,
    })
  }

  update(storyId: string, input: StoryDraftInput) {
    return updateStoryDraft(storyId, input, this.database)
  }

  publish(storyId: string) {
    return publishStory(storyId, this.database)
  }

  duplicate(storyId: string) {
    return duplicateStory(storyId, this.database)
  }

  exportPackage(storyId: string) {
    return exportStoryPackage(storyId, this.database)
  }

  importPackage(input: unknown) {
    return importStoryPackage(input, this.database)
  }

  delete(storyId: string) {
    return deleteStoryDraft(storyId, this.database)
  }
}
