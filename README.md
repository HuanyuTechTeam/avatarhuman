# AvatarHuman

## Current Notes

The Wav2Lip runtime currently uses the CPU image-list batching path from commit `f273ac0`.
The later GPU-resident avatar tensor path introduced in `777d48e` caused severe first-session
and first-speech stalls in local testing, including frozen video/audio and frame flashing.

## TODO

- Revisit the GPU-resident `face_tensor_cycle` optimization behind a feature flag instead of enabling it by default.
- Add timing logs around `/offer`, session runtime creation, ASR feature generation, Wav2Lip inference, and WebRTC queueing before changing the media pipeline again.
- Benchmark the old CPU batch path against any new GPU preload path with first-session and first-speech latency as explicit metrics.
- Avoid blocking the media render loop on experimental inference queues; any real-time dropping/backpressure policy must preserve audio/video sync.
- Add a reproducible startup/session smoke test that verifies no `LipASR feat_queue` stalls, no repeated playback-clock rebases, and stable 25fps output during the first answer.
