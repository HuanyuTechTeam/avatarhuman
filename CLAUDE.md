# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LiveTalking is a real-time digital human/avatar system that enables interactive conversations with AI-powered avatars. It uses WebRTC for low-latency audio/video streaming and supports multiple lip-sync models and TTS engines.

## Commands

### Running the Server

```bash
# Basic usage with wav2lip model (default)
python app.py --model wav2lip --avatar_id <avatar_id>

# With musetalk model (higher quality, requires musetalk dependencies)
python app.py --model musetalk --avatar_id <avatar_id>

# With ultralight model (fastest)
python app.py --model ultralight --avatar_id <avatar_id>
```

### Key CLI Arguments

| Argument | Default | Description |
|----------|---------|-------------|
| `--model` | wav2lip | Model type: wav2lip, musetalk, ultralight |
| `--avatar_id` | avator_1 | Avatar ID in data/avatars/ |
| `--tts` | edgetts | TTS engine: edgetts, gpt-sovits, xtts, cosyvoice, fishtts, tencent, index_tts |
| `--REF_FILE` | zh-CN-YunxiaNeural | Voice reference (voice name for edgetts, file path for others) |
| `--TTS_SERVER` | http://127.0.0.1:9880 | TTS server URL (for non-edgetts engines) |
| `--listenport` | 8010 | Web server port |
| `--max_session` | 8 | Maximum concurrent sessions |
| `--batch_size` | 16 | Inference batch size |
| `--transport` | webrtc | Transport: webrtc, rtmp, rtcpush |

### Generating Avatar Data

```bash
# From video file (wav2lip)
python genavatar.py --video_path <video.mp4> --avatar_id <new_avatar_id>

# Or using wav2lip's generator
python wav2lip/genavatar.py --video_path <video.mp4> --avatar_id <new_avatar_id>
```

## Architecture

### Core Components

```
app.py                    # Main entry point, aiohttp server, WebRTC handling
├── basereal.py           # BaseReal - base class for avatar rendering
├── webrtc.py             # HumanPlayer - WebRTC audio/video track management
├── ttsreal.py            # TTS implementations (EdgeTTS, SovitsTTS, etc.)
├── llm.py                # LLM integration (DashScope/Qwen)
├── baseasr.py            # BaseASR - audio processing base class
│
├── Model implementations:
│   ├── lipreal.py        # Wav2Lip model (LipReal class)
│   ├── lipasr.py         # Wav2Lip audio processing
│   ├── musereal.py       # MuseTalk model (MuseReal class)
│   ├── museasr.py        # MuseTalk audio processing
│   └── lightreal.py      # Ultralight model (LightReal class)
│
└── genavatar.py          # Avatar data generation from video
```

### Data Flow

1. **Client connects** via WebRTC (`/offer` endpoint)
2. **Session created** - `BaseReal` subclass instance per session
3. **Text input** received via `/human` endpoint
4. **TTS processing** - text converted to audio chunks
5. **ASR processing** - audio features extracted (mel-spectrogram or whisper)
6. **Model inference** - lip-sync video frames generated from audio
7. **WebRTC streaming** - audio/video frames pushed to client

### Avatar Data Structure

```
data/avatars/<avatar_id>/
├── full_imgs/           # Full frame images (00000000.png, ...)
├── face_imgs/           # Cropped face images (for wav2lip)
├── coords.pkl           # Face bounding box coordinates
├── latents.pt           # VAE latents (for musetalk only)
├── mask/                # Blending masks (for musetalk only)
└── mask_coords.pkl      # Mask coordinates (for musetalk only)
```

### TTS Engine Selection

- **edgetts**: Microsoft Edge TTS (free, no server needed, voice name in REF_FILE)
- **gpt-sovits**: GPT-SoVITS server (requires TTS_SERVER)
- **xtts**: XTTS server (requires TTS_SERVER)
- **cosyvoice**: CosyVoice server (requires TTS_SERVER)
- **fishtts**: Fish Speech server (requires TTS_SERVER)
- **tencent**: Tencent Cloud TTS (requires TENCENT_APPID, TENCENT_SECRET_ID, TENCENT_SECRET_KEY env vars)
- **index_tts**: Custom index TTS server (requires TTS_SERVER)

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/offer` | POST | WebRTC SDP offer/answer exchange |
| `/human` | POST | Send text for avatar to speak (type: echo/chat) |
| `/humanaudio` | POST | Upload audio file for avatar |
| `/is_speaking` | POST | Check if avatar is currently speaking |
| `/set_audiotype` | POST | Set custom audio/video state |
| `/record` | POST | Start/stop recording |

### Environment Variables

- `DASHSCOPE_API_KEY`: For LLM (Qwen) when using type='chat'
- `TENCENT_APPID`, `TENCENT_SECRET_ID`, `TENCENT_SECRET_KEY`: For Tencent TTS

## Dependencies

- **Required**: PyTorch, aiohttp, aiortc, opencv-python, edge_tts
- **Model-specific**:
  - wav2lip: models/wav2lip.pth
  - musetalk: musetalk/ package (external)
- **External services**: ASR service (port 50000), optional LLM/TTS servers

## Frontend

Web interface files in `web/`:
- `webrtcapi.html` - Basic WebRTC client
- `cozechat-s.html` - Coze API integration client
- `langchain-s.html` - LangChain integration client
