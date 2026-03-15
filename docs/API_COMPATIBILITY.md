# API 与前端兼容契约

## 路径前缀

当前后端同时支持两套访问方式，便于兼容现有静态页面和 Nginx 代理：

- 根路径：`/offer`、`/human`、`/humanaudio`、`/set_audiotype`、`/record`、`/is_speaking`
- 兼容前缀：`/avatarhuman/offer`、`/avatarhuman/human`、`/avatarhuman/humanaudio`、`/avatarhuman/set_audiotype`、`/avatarhuman/record`、`/avatarhuman/is_speaking`

静态资源也同时支持：

- `/`
- `/avatarhuman/`

这意味着旧页面里使用根路径或 `/avatarhuman/*` 前缀都可以继续访问。

## 会话约定

- 通过 `POST /offer` 或 `POST /avatarhuman/offer` 建立 WebRTC 会话。
- 返回值中包含 `sessionid`，后续所有播报、录音、状态查询请求都必须带上该值。
- 服务端会为每个 `sessionid` 创建独立的运行时配置副本，不再共享可变全局 `opt`。

## 文本播报

`POST /human` 请求体字段：

- `sessionid`：会话 ID
- `type`：`echo` 或 `chat`
- `text`：要播报或送入 LLM 的文本
- `interrupt`：可选，若为真则先中断当前播报
- `voice_id`：可选，仅覆盖当前会话的语音配置，不回写全局默认值

## 音频上传

`POST /humanaudio` 使用表单上传：

- `sessionid`
- `file`

## 自定义状态与录制

- `POST /set_audiotype`
  - `sessionid`
  - `audiotype`
  - `reinit`
- `POST /record`
  - `sessionid`
  - `type`: `start_record` 或 `end_record`

## 状态查询

- `POST /is_speaking`
  - `sessionid`
- 响应中 `data` 字段表示当前数字人是否正在播报

## 头像数据目录契约

运行时与生成脚本统一使用：

- `data/avatars/<avatar_id>`

后续若继续拆分前后端工程，应保持这一契约不变，避免文档、生成脚本和运行时再次出现路径分叉。
