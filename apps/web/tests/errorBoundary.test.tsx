import { describe, expect, it } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { ErrorFallback } from '../src/components/ErrorBoundary'

describe('错误兜底界面', () => {
  it('隐藏普通渲染异常详情，只展示稳定错误 ID', () => {
    const html = renderToStaticMarkup(<ErrorFallback error={new Error('secret-token-in-render')} errorId="ui-test" />)

    expect(html).toContain('ui-test')
    expect(html).toContain('页面渲染或加载时发生异常')
    expect(html).not.toContain('secret-token-in-render')
  })

  it('允许展示服务端返回的受控 API 错误', () => {
    const html = renderToStaticMarkup(
      <ErrorFallback
        error={{ status: 404, code: 'STORY_NOT_FOUND', message: '没有找到这张故事卡', requestId: 'api-request-id' }}
        errorId="ui-api"
      />,
    )

    expect(html).toContain('api-request-id')
    expect(html).not.toContain('ui-api')
    expect(html).toContain('STORY_NOT_FOUND')
    expect(html).toContain('没有找到这张故事卡')
  })
})
