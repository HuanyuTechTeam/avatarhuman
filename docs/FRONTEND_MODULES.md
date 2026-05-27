# 前端模块化说明

## 当前入口

- `web/cozechat-s.html`
    - 页面入口脚本改为 `web/entries/cozechat-s.mjs`
- `web/langchain-s.html`
    - 页面入口脚本改为 `web/entries/langchain-s.mjs`

这两个入口现在只负责：

- 检测当前是否运行在 `/avatarhuman` 前缀下
- 加载各自配置文件
- 创建对应的 AI provider
- 启动共享页面装配逻辑

## 模块结构

### `web/modules/core/`

- `paths.mjs`
    - 统一处理根路径与 `/avatarhuman` 兼容前缀
- `avatar-api.mjs`
    - 封装 `/offer`、`/human`、`/is_speaking` 与静态 JSON 读取
- `webrtc-client.mjs`
    - 封装浏览器侧 WebRTC offer/answer 流程
- `streaming.mjs`
    - 处理 SSE/流式文本解析和按标点断句
- `config-loader.mjs`
    - 统一读取配置文件并提供回退值
- `avatar-page.mjs`
    - 负责页面装配：提示词、消息列表、录音、VAD、状态轮询、文本提交流程

### `web/modules/providers/`

- `coze-provider.mjs`
    - Coze 会话创建、流式回复解析
- `langchain-provider.mjs`
    - LangChain/知识库接口调用与流式回复解析
- `index.mjs`
    - provider 导出聚合

## 后端契约对接

前端共享模块默认优先根据当前页面路径自动选择接口前缀：

- 页面在 `/cozechat-s.html`、`/langchain-s.html` 下访问时，调用根路径接口
- 页面在 `/avatarhuman/cozechat-s.html`、`/avatarhuman/langchain-s.html` 下访问时，调用 `/avatarhuman/*` 接口

因此无需在页面脚本里硬编码两套地址。

## 当前保留的外部接口

以下接口仍按原部署方式保留，不跟随后端前缀自动切换：

- `/asr/api/v1/asr`
- `/llm/chat/kb_chat`
- `https://api.coze.cn/*`

原因是它们分别属于独立 ASR 服务、独立 LLM 代理或外部云服务。

如果部署环境不是上述默认地址，可以在页面配置中覆盖：

- `config.asr.endpoint`
- `config.langchain.endpoint`

## 测试

新增前端模块测试：

- `tests/frontend_modules.test.mjs`

覆盖内容：

- 后端前缀检测
- API 路径拼接
- JSON 资产解析
- Coze SSE 事件解析
- 文本按标点切句
- Coze / LangChain provider 基础行为
