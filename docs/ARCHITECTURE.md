# LiveTalking 项目架构设计文档 (Wav2Lip 模型)

## 1. 系统概述

LiveTalking 是一个基于 WebRTC 的实时数字人/虚拟主播系统。使用 wav2lip 模型实现口型同步，支持多用户并发访问和 可与多种 TTS 引擎和 和 LLM 服务集成。

### 1.1 技术栈

| 层级 | 技术 |
|------|------|
| 后端框架 | aiohttp (异步 Web 框架) |
| 实时通信 | aiortc (Python WebRTC 实现) |
| 深度学习 | PyTorch, Wav2Lip |
| 音频处理 | librosa, scipy |
| TTS | edge-tts (默认), 多种可选 |
| 前端 | 原生 JavaScript, WebRTC API |

### 1.2 系统架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              用户浏览器                                    │
│  ┌───────────┐    ┌───────────┐    ┌───────────┐    ┌───────────┐        │
│  │  WebRTC   │    │   录音    │    │   播放    │    │  Coze API  │        │
│  │  Client   │    │   (VAD)   │    │  音视频   │    │  (可选)   │        │
│  └───────────┘    └───────────┘    └───────────┘    └───────────┘        │
└───────────────────────────┬─────────────────────────────────────────────────┘
                            │
                            ▼ HTTP/WebRTC
┌───────────────────────────┴─────────────────────────────────────────────────┐
│                         app.py (主服务)                                    │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                     aiohttp Web Server                               │ │
│  │  端点: /offer, /human, /is_speaking, /humanaudio, /record              │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                     WebRTC Connection Manager                          │ │
│  │  - RTCPeerConnection 管理                                              │ │
│  │  - 会话管理 (nerfreals dict)                                           │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
└───────────────────────────┬─────────────────────────────────────────────────┘
                            │
                            ▼ 创建实例
┌───────────────────────────┴─────────────────────────────────────────────────┐
│                      LipReal (数字人实例)                                  │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐                  │
│  │   BaseReal    │  │    LipASR     │  │    EdgeTTS    │                  │
│  │   (基类)      │  │  (音频处理)   │  │   (语音合成)   │                  │
│  └───────────────┘  └───────────────┘  └───────────────┘                  │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐                  │
│  │ Wav2Lip Model │  │ Avatar Data  │  │ HumanPlayer   │                  │
│  │  (推理模型)    │  │ (头像数据)   │  │ (WebRTC推流) │                  │
│  └───────────────┘  └───────────────┘  └───────────────┘                  │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 核心模块详解

### 2.1 主服务 (app.py)

**职责**: 整个系统的入口，负责 HTTP 服务、WebRTC 连接管理、会话生命周期管理。

#### 关键数据结构

```python
nerfreals: Dict[int, BaseReal] = {}  # sessionid -> LipReal 实例映射
pcs: set()                                  # 活跃的 RTCPeerConnection 集合
opt: argparse.Namespace                     # 全局配置
model: Wav2Lip                              # 预加载的模型实例
avatar: tuple                                # 预加载的头像数据
```

#### API 端点

| 端点 | 方法 | 功能 |
|------|------|------|
| `/offer` | POST | WebRTC SDP 协商，建立连接 |
| `/human` | POST | 发送文本让数字人播报 |
| `/humanaudio` | POST | 上传音频文件 |
| `/is_speaking` | POST | 查询数字人是否在播报 |
| `/record` | POST | 开始/停止录制 |
| `/set_audiotype` | POST | 设置自定义音频/视频状态 |

#### 启动流程

```python
1. 解析命令行参数 (argparse)
2. 加载模型: load_model("./models/wav2lip.pth")
3. 加载头像: load_avatar(opt.avatar_id)
4. 预热模型: warm_up(batch_size, model, 256)
5. 创建 aiohttp 应用
6. 配置 CORS
7. 启动 TCP 服务 (0.0.0.0:listenport)
```

---

### 2.2 数字人基类 (basereal.py - BaseReal)

**职责**: 数字人实例的基类，管理 TTS、音频帧队列、录制功能、自定义视频/音频。

#### 核心属性

```python
class BaseReal:
    opt: argparse.Namespace      # 配置
    sample_rate: int = 16000     # 音频采样率
    chunk: int = 320             # 每帧样本数 (20ms * 16000Hz / 1000)
    sessionid: int               # 会话 ID
    tts: BaseTTS                 # TTS 实例
    speaking: bool               # 是否正在播报
    recording: bool              # 是否正在录制
    curr_state: int              # 当前状态 (0=正常, >1=自定义)
    custom_img_cycle: dict       # 自定义视频帧
    custom_audio_cycle: dict     # 自定义音频
```

#### 关键方法

| 方法 | 功能 |
|------|------|
| `put_msg_txt(msg)` | 将文本送入 TTS 队列 |
| `put_audio_frame(chunk)` | 将音频帧送入 ASR 队列 |
| `flush_talk()` | 清空当前播报队列 |
| `is_speaking()` | 返回是否正在播报 |
| `start_recording()` | 开始录制视频 |
| `stop_recording()` | 停止录制并合成视频 |
| `mirror_index(size, index)` | 计算循环索引（正向-反向循环） |

---

### 2.3 Wav2Lip 实现 (lipreal.py - LipReal)

**职责**: Wav2Lip 模型的具体实现，继承自 BaseReal。

#### 类结构

```python
class LipReal(BaseReal):
    fps: int                    # 音频帧率 (50)
    batch_size: int             # 推理批次大小
    res_frame_queue: Queue      # 结果帧队列
    model: Wav2Lip              # Wav2Lip 模型
    frame_list_cycle: list      # 完整帧图像列表
    face_list_cycle: list       # 人脸区域图像列表
    coord_list_cycle: list      # 人脸坐标列表
    asr: LipASR                 # 音频处理实例
    render_event: Event         # 渲染事件
```

#### 推理流程

```
┌─────────────────────────────────────────────────────────────────┐
│                        render() 主循环                          │
│  while not quit_event:                                         │
│      asr.run_step()  # 处理音频，提取 mel 频谱特征             │
│      sleep(adaptive)  # 根据队列深度自适应休眠                  │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│              inference() 独立线程                               │
│  while not quit_event:                                         │
│      1. 从 feat_queue 获取 mel 批次                            │
│      2. 从 output_queue 获取音频帧                             │
│      3. 如果全是静音：                                         │
│         - 直接使用原始帧                                        │
│      4. 如果有语音：                                           │
│         - 准备 img_batch (人脸图像)                            │
│         - 准备 mel_batch (mel 频谱)                            │
│         - model(mel_batch, img_batch) -> pred                  │
│      5. 将结果放入 res_frame_queue                             │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│            process_frames() 独立线程                            │
│  while not quit_event:                                         │
│      1. 从 res_frame_queue 获取帧                              │
│      2. 如果是静音帧：                                         │
│         - 使用原始帧或自定义帧                                  │
│      3. 如果是说话帧：                                         │
│         - 将 pred 帧融合到原始帧                                │
│      4. 创建 VideoFrame/AudioFrame                             │
│      5. 放入 WebRTC track 队列                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 模型输入输出

```
输入:
  - img_batch: [batch_size, 6, 256, 256]  # 6通道 (masked + original)
  - mel_batch: [batch_size, 1, 80, 16]    # mel 频谱

输出:
  - pred: [batch_size, 3, 256, 256]  # RGB 人脸图像
```

---

### 2.4 音频处理 (lipasr.py - LipASR)

**职责**: 处理音频流，提取 mel 频谱特征。

#### 继承关系

```python
class LipASR(BaseASR):
    # 继承自 BaseASR
```

#### 核心处理流程

```python
def run_step():
    # 1. 获取 batch_size * 2 个音频帧
    for _ in range(batch_size * 2):
        frame, type, eventpoint = self.get_audio_frame()
        self.frames.append(frame)
        self.output_queue.put((frame, type, eventpoint))

    # 2. 检查是否有足够的上下文
    if len(frames) <= stride_left_size + stride_right_size:
        return

    # 3. 拼接帧并计算 mel 频谱
    inputs = np.concatenate(frames)
    mel = audio.melspectrogram(inputs)  # [80, T]

    # 4. 切割 mel 为固定大小的块
    mel_step_size = 16
    mel_chunks = [...]  # 每块 [80, 16]

    # 5. 放入特征队列
    self.feat_queue.put(mel_chunks)

    # 6. 保留边缘帧用于下一次处理
    self.frames = frames[-(stride_left_size + stride_right_size):]
```

#### 关键参数

| 参数 | 值 | 说明 |
|------|-----|------|
| fps | 50 | 每秒帧数 |
| sample_rate | 16000 | 音频采样率 |
| chunk | 320 | 每帧样本数 (20ms) |
| stride_left_size | 10 | 左侧上下文帧数 |
| stride_right_size | 10 | 右侧上下文帧数 |
| batch_size | 16 | 批次大小 |

---

### 2.5 TTS 语音合成 (ttsreal.py - EdgeTTS)

**职责**: 将文本转换为语音音频流。

#### EdgeTTS 类

```python
class EdgeTTS(BaseTTS):
    fps: int = 50
    sample_rate: int = 16000
    chunk: int = 320
    input_stream: BytesIO
    msgqueue: Queue
    state: State  # RUNNING / PAUSE
```

#### 处理流程

```
┌─────────────────────────────────────────────────────────────────┐
│              process_tts() 后台线程                             │
│  while not quit_event:                                         │
│      msg = msgqueue.get()  # 获取文本                          │
│      txt_to_audio(msg)     # 转换为音频                        │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│              txt_to_audio() 文本转语音                          │
│  1. asyncio.run(edge_tts.Communicate(text, voicename))         │
│  2. 将音频流写入 input_stream                                   │
│  3. 读取并重采样到 16kHz                                        │
│  4. 按 320 样本分块                                             │
│  5. parent.put_audio_frame(chunk, eventpoint)                  │
└─────────────────────────────────────────────────────────────────┘
```

#### 支持的 TTS 引擎

| 引擎 | 配置 | 说明 |
|------|------|------|
| edgetts | `--tts edgetts` | Microsoft Edge TTS (免费) |
| gpt-sovits | `--tts gpt-sovits --TTS_SERVER url` | GPT-SoVITS 服务 |
| xtts | `--tts xtts --TTS_SERVER url` | XTTS 服务 |
| cosyvoice | `--tts cosyvoice --TTS_SERVER url` | CosyVoice 服务 |
| fishtts | `--tts fishtts --TTS_SERVER url` | Fish Speech 服务 |
| tencent | `--tts tencent` | 腾讯云 TTS |
| index_tts | `--tts index_tts --TTS_SERVER url` | 自定义 TTS 服务 |

---

### 2.6 WebRTC 推流 (webrtc.py - HumanPlayer)

**职责**: 管理 WebRTC 音视频轨道，向客户端推送帧。

#### 类结构

```python
class PlayerStreamTrack(MediaStreamTrack):
    kind: str              # 'audio' 或 'video'
    _queue: asyncio.Queue  # 帧队列
    _timestamp: int        # 当前时间戳
    _start: float          # 起始时间

class HumanPlayer:
    __audio: PlayerStreamTrack
    __video: PlayerStreamTrack
    __container: BaseReal   # LipReal 实例
```

#### 时序控制

```
音频:
  - AUDIO_PTIME = 0.020 (20ms)
  - SAMPLE_RATE = 16000
  - 每帧样本数 = 320

视频:
  - VIDEO_PTIME = 0.040 (40ms, 25fps)
  - VIDEO_CLOCK_RATE = 90000
```

#### recv() 流程

```python
async def recv():
    frame, eventpoint = await self._queue.get()
    pts, time_base = await self.next_timestamp()
    frame.pts = pts
    frame.time_base = time_base
    # 根据 PTIME 计算等待时间
    return frame
```

---

### 2.7 音频特征提取 (wav2lip/audio.py)

**职责**: 将原始音频转换为 mel 频谱。

#### 关键函数

```python
def melspectrogram(wav):
    """
    输入: wav - 原始音频波形
    输出: mel 频谱 [80, T]
    """
    D = _stft(preemphasis(wav))       # 短时傅里叶变换
    S = _amp_to_db(_linear_to_mel(np.abs(D))) - ref_level_db
    return _normalize(S)
```

#### Mel 频谱参数

```python
hparams:
    num_mels = 80           # mel 滤波器组数量
    n_fft = 800             # FFT 窗口大小
    hop_size = 200          # 跳跃长度 (12.5ms @ 16kHz)
    win_size = 800          # 窗口大小 (50ms)
    sample_rate = 16000     # 采样率
    fmin = 55               # 最低频率
    fmax = 7600             # 最高频率
```

---

## 3. 数据流详解

### 3.1 完整数据流

```
用户输入文本
     │
     ▼
┌─────────────────┐
│  POST /human    │
│  type: 'echo'   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ LipReal         │
│ put_msg_txt()   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ EdgeTTS         │
│ msgqueue.put()  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ process_tts()   │  后台线程
│ txt_to_audio()  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ edge_tts        │  生成音频
│ Communicate     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ put_audio_frame │  320 samples/chunk
│ (16kHz, 20ms)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ LipASR          │
│ queue.put()     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ run_step()      │  主循环调用
│ melspectrogram  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ feat_queue      │  mel chunks
│ output_queue    │  audio frames
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ inference()     │  推理线程
│ Wav2Lip model   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ res_frame_queue │  推理结果
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ process_frames()│  处理线程
│ 帧融合          │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ VideoFrame      │
│ AudioFrame      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ HumanPlayer     │
│ track._queue    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ WebRTC recv()   │
│ 发送到客户端    │
└─────────────────┘
```

### 3.2 队列数据流

```
                    ┌─────────────────┐
                    │   TTS 音频流    │
                    └────────┬────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│                        LipASR                                │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐   │
│  │   queue     │────▶│   frames    │────▶│ output_queue│   │
│  │ (音频帧)    │     │  (缓冲区)   │     │ (音频帧)    │   │
│  └─────────────┘     └─────────────┘     └─────────────┘   │
│                             │                                │
│                             ▼                                │
│                      ┌─────────────┐                        │
│                      │  mel 频谱   │                        │
│                      └─────────────┘                        │
│                             │                                │
│                             ▼                                │
│                      ┌─────────────┐                        │
│                      │ feat_queue  │                        │
│                      │ (mel chunks)│                        │
│                      └─────────────┘                        │
└──────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│                      inference() 线程                        │
│  ┌─────────────┐     ┌─────────────┐                        │
│  │ feat_queue  │────▶│  Wav2Lip   │                        │
│  │             │     │   Model    │                        │
│  └─────────────┘     └─────────────┘                        │
│  ┌─────────────┐            │                               │
│  │output_queue │────────────┤                               │
│  │ (音频帧)    │            ▼                               │
│  └─────────────┘     ┌─────────────┐                        │
│                      │res_frame_q │                        │
│                      │(视频+音频) │                        │
│                      └─────────────┘                        │
└──────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│                   process_frames() 线程                      │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐   │
│  │res_frame_q  │────▶│  帧融合    │────▶│ VideoFrame  │   │
│  │             │     │  (combining)│     │ AudioFrame  │   │
│  └─────────────┘     └─────────────┘     └─────────────┘   │
│                                                 │            │
│                                                 ▼            │
│                                          ┌─────────────┐    │
│                                          │ track.queue │    │
│                                          └─────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

---

## 4. 头像数据结构

### 4.1 目录结构

```
data/avatars/<avatar_id>/
├── full_imgs/              # 完整帧图像
│   ├── 00000000.png       # 按帧序号命名
│   ├── 00000001.png
│   └── ...
├── face_imgs/              # 裁剪的人脸图像 (96x96)
│   ├── 00000000.png
│   ├── 00000001.png
│   └── ...
└── coords.pkl              # 人脸坐标列表 [(y1, y2, x1, x2), ...]
```

### 4.2 数据加载

```python
def load_avatar(avatar_id):
    avatar_path = f"./data/avatars/{avatar_id}"

    # 1. 加载坐标
    with open(f"{avatar_path}/coords.pkl", 'rb') as f:
        coord_list_cycle = pickle.load(f)  # [(y1, y2, x1, x2), ...]

    # 2. 加载完整帧
    full_imgs = sorted(glob(f"{avatar_path}/full_imgs/*.png"))
    frame_list_cycle = read_imgs(full_imgs)  # [H, W, 3] 列表

    # 3. 加载人脸图像
    face_imgs = sorted(glob(f"{avatar_path}/face_imgs/*.png"))
    face_list_cycle = read_imgs(face_imgs)  # [96, 96, 3] 列表

    return frame_list_cycle, face_list_cycle, coord_list_cycle
```

### 4.3 头像生成

```bash
python genavatar.py --video_path <video.mp4> --avatar_id <new_id>
```

处理流程:
1. 视频解帧到 `full_imgs/`
2. 人脸检测 (SFD)
3. 裁剪人脸到 96x96 保存到 `face_imgs/`
4. 保存坐标到 `coords.pkl`

---

## 5. 多线程架构

### 5.1 线程模型

```
┌───────────────────────────────────────────────────────────────┐
│                        主进程                                 │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                  aiohttp Event Loop                     │ │
│  │  - HTTP 请求处理                                        │ │
│  │  - WebRTC 连接管理                                      │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │  render 线程    │  │ inference 线程  │  │process_frames│ │
│  │  (主循环)       │  │ (模型推理)      │  │   线程       │ │
│  │                 │  │                 │  │              │ │
│  │  asr.run_step() │  │  model()        │  │  帧融合     │ │
│  │                 │  │                 │  │  WebRTC推送  │ │
│  └─────────────────┘  └─────────────────┘  └──────────────┘ │
│                                                               │
│  ┌─────────────────┐                                         │
│  │  TTS 线程       │                                         │
│  │  process_tts()  │                                         │
│  │  文本->音频     │                                         │
│  └─────────────────┘                                         │
└───────────────────────────────────────────────────────────────┘
```

### 5.2 线程间通信

```python
# 队列定义
msgqueue = Queue()           # TTS: 文本队列
queue = Queue()              # ASR: 音频帧队列
feat_queue = mp.Queue(2)     # ASR: mel 特征队列
output_queue = mp.Queue()    # ASR: 音频输出队列
res_frame_queue = Queue()    # Inference: 结果帧队列
track._queue = asyncio.Queue() # WebRTC: 帧队列
```

---

## 6. 配置参数

### 6.1 命令行参数

```bash
python app.py \
    --model wav2lip \              # 模型类型
    --avatar_id avator_1 \         # 头像ID
    --tts edgetts \                # TTS引擎
    --REF_FILE zh-CN-YunxiaNeural \ # 语音(EdgeTTS)或参考音频
    --listenport 8010 \            # 监听端口
    --max_session 8 \              # 最大会话数
    --batch_size 16 \              # 推理批次
    --fps 50 \                     # 音频帧率 (固定50)
    -l 10 \                        # 左侧上下文
    -m 8 \                         # 中间帧数
    -r 10                          # 右侧上下文
```

### 6.2 关键参数说明

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--fps` | 50 | 音频帧率，必须是50 |
| `-l` | 10 | 滑动窗口左侧长度 (单位: 20ms) |
| `-m` | 8 | 滑动窗口中间长度 |
| `-r` | 10 | 滑动窗口右侧长度 |
| `--batch_size` | 16 | 推理批次大小，影响延迟和吞吐量 |
| `--max_session` | 8 | 最大并发会话数 |

---

## 7. 前端交互

### 7.1 WebRTC 连接建立

```javascript
// 1. 创建 RTCPeerConnection
pc = new RTCPeerConnection(config);

// 2. 添加收发器
pc.addTransceiver('video', { direction: 'recvonly' });
pc.addTransceiver('audio', { direction: 'recvonly' });

// 3. 创建 Offer
offer = await pc.createOffer();
await pc.setLocalDescription(offer);

// 4. 发送到服务器
response = await fetch('/offer', {
    method: 'POST',
    body: JSON.stringify({ sdp: offer.sdp, type: offer.type })
});

// 5. 设置远程描述
answer = await response.json();
await pc.setRemoteDescription(answer);
```

### 7.2 发送文本播报

```javascript
fetch('/human', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        text: message,
        type: 'echo',        // 或 'chat' (调用LLM)
        interrupt: true,     // 是否打断当前播报
        sessionid: sessionid,
        voice_id: voice_id   // 可选，切换语音
    })
});
```

### 7.3 查询播报状态

```javascript
// 轮询检查数字人是否在播报
setInterval(() => {
    fetch('/is_speaking', {
        method: 'POST',
        body: JSON.stringify({ sessionid: sessionid })
    }).then(r => r.json())
      .then(data => { window.is_speaking = data.data; });
}, 1000);
```

---

## 8. 性能考量

### 8.1 延迟分析

```
总延迟 ≈ TTS延迟 + 音频缓冲 + 模型推理 + WebRTC传输

TTS延迟:      EdgeTTS ~500ms-2s (网络依赖)
音频缓冲:     (l + m + r) * 20ms = 560ms
模型推理:     batch_size / FPS ~ 320ms (GPU)
WebRTC:       ~50-100ms

典型总延迟:   1-3 秒
```

### 8.2 优化建议

1. **减少音频缓冲**: 减小 `-l`, `-r` 参数 (可能影响质量)
2. **使用更快的 TTS**: 使用本地 TTS 服务 (gpt-sovits, cosyvoice)
3. **GPU 加速**: 确保 CUDA 可用
4. **批次优化**: 根据延迟需求调整 `--batch_size`

---

## 9. 扩展点

### 9.1 添加新的 TTS 引擎

```python
# 在 ttsreal.py 中添加新类
class NewTTS(BaseTTS):
    def txt_to_audio(self, msg):
        text, eventpoint = msg
        # 实现文本到音频的转换
        for audio_chunk in generate_audio(text):
            stream = process_chunk(audio_chunk)
            for i in range(0, len(stream), self.chunk):
                self.parent.put_audio_frame(stream[i:i+self.chunk], eventpoint)
```

### 9.2 添加新的模型

```python
# 1. 创建新文件 newreal.py
class NewReal(BaseReal):
    def __init__(self, opt, model, avatar):
        super().__init__(opt)
        # 初始化模型特定属性

    def render(self, quit_event, loop, audio_track, video_track):
        # 实现渲染循环

# 2. 在 app.py 中添加加载逻辑
if opt.model == 'newmodel':
    from newreal import NewReal, load_model, load_avatar
    model = load_model()
    avatar = load_avatar(opt.avatar_id)
```

---

## 10. 文件清单

| 文件 | 职责 |
|------|------|
| `app.py` | 主服务入口，HTTP/WebRTC 管理 |
| `basereal.py` | 数字人基类 |
| `lipreal.py` | Wav2Lip 模型实现 |
| `lipasr.py` | Wav2Lip 音频处理 |
| `baseasr.py` | 音频处理基类 |
| `ttsreal.py` | TTS 实现 (多种引擎) |
| `llm.py` | LLM 集成 (DashScope/Qwen) |
| `webrtc.py` | WebRTC 轨道管理 |
| `genavatar.py` | 头像数据生成 |
| `logger.py` | 日志配置 |
| `wav2lip/audio.py` | Mel 频谱提取 |
| `wav2lip/hparams.py` | 音频处理参数 |
| `wav2lip/face_detection/` | 人脸检测模块 |
| `web/` | 前端文件 |
