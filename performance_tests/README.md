# performance_tests 套件说明

该目录包含一组轻量级的前端性能测试工具页面，用于快速评估以下指标：
- 启动时间（粗略）
- 输入延迟（粗略）
- 滚动流畅度（FPS 与掉帧估计）
- 内存占用（浏览器环境支持时）

使用方式：
1. 启动 Vite 开发服务器：`npm run dev`
2. 访问 `http://localhost:5173/performance_tests/index.html`
3. 选择数据集与规模，点击对应的按钮运行测试或执行“运行全部”。

注意：
- 该页为轻量模拟，不加载完整 React 组件树，结果用于相对比较与趋势观察；要获得精确的端到端指标，请在应用中增加 Performance.mark/measure 埋点，并在真实的 Preview/VirtualPreview 上运行。
- 建议在 macOS/Windows 的低配与中配机器各跑一遍，采集 P50/P95 指标，纳入回归基线。
