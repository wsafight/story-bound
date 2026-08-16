# 代码量统计

记录日期：2026-08-16

## 默认统计

默认 `cloc .` 会包含依赖、构建产物和测试报告，结果为：

```text
文件数: 13,844
代码行: 2,399,434
注释行: 625,611
空行: 177,057
```

## 源码统计

排除 `node_modules`、`dist`、`build`、`playwright-report`、`test-results`、`.git`、`.tanstack` 和 `bun.lock` 后，更接近项目源码量：

```text
文件数: 204
代码行: 19,233
注释行: 19
空行: 1,679
```

复用命令：

```bash
cloc . --exclude-dir=node_modules,dist,build,playwright-report,test-results,.git,.tanstack --not-match-f='(^|/)bun.lock$'
```
