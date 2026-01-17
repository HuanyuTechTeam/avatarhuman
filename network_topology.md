
# 项目网络拓扑与交互逻辑分析

本文档旨在详细解析该实时数字人项目的系统架构、网络拓扑以及前后端交互流程。

## 1. 系统概述

该项目是一个基于 WebRTC 的实时数字人解决方案。用户通过浏览器与数字人进行语音或文字互动。系统核心由以下几个部分组成：

1.  **客户端 (Web Frontend)**: 用户交互界面，负责采集用户输入（语音、文字）、播放数字人音视频流。
2.  **Nginx 反向代理**: 作为系统的统一入口，负责 SSL 卸载和请求路由，将来自客户端的请求分发到不同的后端服务。
3.  **数字人核心服务 (`app.py`)**: 项目的主应用，负责处理 WebRTC 连接、管理用户会话、驱动数字人模型生成音视频。
4.  **ASR 语音识别服务**: 一个独立的微服务，将用户的语音输入实时转换为文字。
5.  **LLM 大语言模型服务**: 提供对话能力，可以是外部云服务（如 Coze）或本地部署的服务。
6.  **TTS 文本转语音服务**: 集成在数字人核心服务中，将 LLM 返回的文本转换为语音。

## 2. 网络拓扑图

下面是系统的网络拓扑结构图，清晰地展示了各个组件之间的关系和数据流向。

```mermaid
graph TD
    subgraph "用户浏览器"
        Client[客户端 (cozechat-s.html)]
    end

    subgraph "Nginx 反向代理 (监听 443 端口)"
        Nginx
    end

    subgraph "后端服务 (本地)"
        AvatarService[数字人核心服务 app.py:8010]
        ASRService[ASR 语音识别服务 asr:50000]
        LLMService[本地 LLM 服务 llm:7861]
        TTSService[TTS 文本转语音服务<br>(集成在 AvatarService 中)]
    end

    subgraph "外部云服务"
        CozeLLM[Coze API (api.coze.cn)]
    end

    Client -- HTTPS 请求 --> Nginx

    Nginx -- /avatarhuman/ --> AvatarService
    Nginx -- /asr/ --> ASRService
    Nginx -- /llm/ --> LLMService

    Client -.-> CozeLLM

    AvatarService -- 调用 --> TTSService
    AvatarService -- 可选调用 --> LLMService

    %% 交互流程
    Client -- 1. 语音数据 (录音) --> Nginx
    Nginx -- 2. 转发语音 --> ASRService
    ASRService -- 3. 返回识别文本 --> Nginx
    Nginx -- 4. 转发文本 --> Client
    Client -- 5. 将文本发送给 Coze --> CozeLLM
    CozeLLM -- 6. 返回 LLM 回复文本 --> Client
    Client -- 7. 将回复文本分段发送 --> Nginx
    Nginx -- 8. 转发文本到核心服务 --> AvatarService
    AvatarService -- 9. 文本转语音+视频生成 --> TTSService
    AvatarService -- 10. WebRTC 音视频流 --> Client
```

## 3. 组件详解

### 3.1. 客户端 (`web/cozechat-s.html` & `cozechat-s.js`)

-   **角色**: 用户交互的直接入口。
-   **技术栈**: HTML, CSS, JavaScript。
-   **核心功能**:
    1.  **WebRTC 通信**: 通过 `negotiate()` 函数与后端 `app.py` 的 `/offer` 接口进行信令交换，建立 WebRTC 连接，接收并播放后端的音视频流。
    2.  **语音处理**: 使用 `MediaRecorder` API 录制用户麦克风的音频。它实现了简单的 VAD (Voice Activity Detection) 功能，通过检测音量变化来判断用户是否在说话，从而自动开始和停止录音。
    3.  **API 编排**:
        -   向 `/asr/api/v1/asr` 发送录制的音频，获取语音识别结果。
        -   将识别出的文本或用户输入的文本，直接发送到外部的 **Coze API** (`api.coze.cn`) 获取智能回复。
        -   将从 Coze API 收到的流式文本进行处理，断句后分段发送给 `/avatarhuman/human` 接口，驱动数字人播报。
        -   通过 `/avatarhuman/is_speaking` 接口轮询查询数字人是否正在讲话，以控制交互状态。

### 3.2. Nginx 反向代理

-   **角色**: 整个系统的总入口，负责安全和流量分发。
-   **监听地址**: `10.197.116.13:443` (根据配置)。
-   **核心功能**:
    1.  **SSL 终端**: 处理 HTTPS 加密解密。
    2.  **请求路由 (Reverse Proxy)**:
        -   `location /avatarhuman/`: 所有与数字人核心功能相关的请求（如 WebRTC 信令、文本下发）都被代理到 `http://127.0.0.1:8010`，即 `app.py` 服务。
        -   `location /asr/`: 语音识别请求被代理到 `http://127.0.0.1:50000`，即 ASR 服务。
        -   `location /llm/`: 大模型相关请求被代理到 `http://127.0.0.1:7861`。**注意**：在 `cozechat-s.js` 的工作流中未使用此代理，它被用于其他潜在的工作流（例如 `langchain-s.html` 或后端直接调用）。
    3.  **协议升级**: 配置了 `Upgrade` 和 `Connection` 头，支持 WebSocket 等长连接协议，这对于 WebRTC 的某些信令交互是必要的。

### 3.3. 数字人核心服务 (`app.py`)

-   **角色**: 项目的大脑，驱动数字人模型并管理实时通信。
-   **技术栈**: `AIOHTTP` (异步 Web 框架), `aiortc` (Python WebRTC 库)。
-   **监听地址**: `127.0.0.1:8010`。
-   **核心功能**:
    1.  **静态文件服务**: 托管 `web` 目录下的所有前端文件。
    2.  **会话管理**: 使用 `nerfreals` 字典为每个访问的用户创建一个独立的会话 (`sessionid`) 和数字人实例，支持多用户。
    3.  **WebRTC 服务端**:
        -   实现 `/offer` 接口，接收客户端的 SDP Offer，创建并返回 Answer，完成 WebRTC 连接的建立。
        -   通过 `HumanPlayer` 类，将生成的音频帧和视频帧打包成 `RTCAudioTrack` 和 `RTCVideoTrack`，实时推流给客户端。
    4.  **文本处理与播报**:
        -   `/human` 接口接收前端发来的文本。
        -   调用 **TTS 服务** (通过 `--tts` 参数配置，如 `edgetts`) 将文本转换为 WAV 音频数据。
        -   调用 **数字人模型** (`wav2lip`, `musetalk` 等) 根据音频数据生成同步的口型动画视频帧。
    5.  **状态查询**: `/is_speaking` 接口返回当前数字人是否正在处理播报任务。

### 3.4. ASR 语音识别服务

-   **角色**: 专用的语音转文本微服务。
-   **监听地址**: `127.0.0.1:50000`。
-   **核心功能**: 接收客户端上传的音频文件 (Blob)，返回识别后的 JSON 格式文本结果。

### 3.5. LLM 大语言模型服务

项目中存在两种 LLM 调用模式：

1.  **云端模式 (Coze)**:
    -   由客户端 `cozechat-s.js` 直接调用 `https://api.coze.cn`。这是当前页面的主要交互逻辑。
    -   **优点**: 方便快捷，无需本地部署和维护 LLM。
    -   **缺点**: 依赖外部网络，可能产生费用和数据隐私问题。

2.  **本地/后端模式**:
    -   `app.py` 中的 `/human` 接口定义了 `type=='chat'` 的逻辑，它会调用 `llm_response` 函数。这表明后端可以自己去请求 LLM。
    -   Nginx 的 `/llm/` 代理配置指向 `127.0.0.1:7861`，这很可能就是为这种模式准备的本地 LLM 服务。
    -   这种模式下，交互流程变为：`Client -> app.py -> LLM -> app.py -> Client`。

## 4. 核心交互流程（语音对话）

结合以上所有组件，一次完整的语音对话交互流程如下：

1.  **页面加载与连接**:
    -   用户访问网站，Nginx 将请求转发给 `app.py`，返回 `cozechat-s.html` 页面。
    -   页面加载 JS 后，自动调用 `PullFlowStart` -> `negotiate()`，通过 `/avatarhuman/offer` 与 `app.py` 建立 WebRTC 连接。
    -   `app.py` 开始向客户端推流数字人的静默/待机画面。

2.  **用户提问**:
    -   用户按住按钮或被 VAD 检测到开始说话，JS 开始录音。
    -   用户说完话，JS 停止录音并将音频数据打包。
    -   JS 将音频数据 POST 到 `/asr/api/v1/asr`。
    -   ASR 服务处理音频，返回识别出的文本，例如 "你好"。

3.  **获取回复**:
    -   JS 收到 ASR 返回的文本 "你好"。
    -   JS 将文本 "你好" 作为问题，POST 到 `https://api.coze.cn` 的聊天接口。
    -   Coze API 以流式（Streaming）方式返回回复，例如 "你 好，有 什么 可以 帮 你 的 吗？"。

4.  **数字人播报**:
    -   JS 接收 Coze 的流式回复，并根据标点符号（如逗号、句号）进行断句。
    -   JS 将第一句 "你好" 发送给 `/avatarhuman/human` 接口。
    -   `app.py` 收到文本 "你好"，调用 TTS 模块生成对应音频，并驱动 `wav2lip`/`musetalk` 模型生成视频帧。
    -   生成的音视频帧通过已建立的 WebRTC 连接实时推送到客户端进行播放。
    -   当 Coze 的下一句话 "有什么可以帮你的吗？" 接收完整后，JS 再次调用 `/avatarhuman/human` 接口，重复此过程，直到整个回复播报完毕。

5.  **循环**: 系统回到待机状态，等待用户的下一次提问。 