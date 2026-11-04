import { ALL_FORMATS, BufferSource, BufferTarget, Conversion, Input, Mp4OutputFormat, Output } from 'mediabunny'

// 两个输入、封装输出和中间缓冲都驻留在 Worker 内存中，限制大小以留出并发余量。
export const MAX_MUX_VIDEO_BYTES = 16 * 1024 * 1024
export const MAX_MUX_AUDIO_BYTES = 4 * 1024 * 1024

export async function muxAudio(videoBytes: Uint8Array, audioBytes: Uint8Array): Promise<Uint8Array> {
  if (!videoBytes.byteLength || videoBytes.byteLength > MAX_MUX_VIDEO_BYTES || !audioBytes.byteLength || audioBytes.byteLength > MAX_MUX_AUDIO_BYTES) {
    throw new Error('音视频文件为空或超过合成大小限制')
  }
  const video = new Input({ source: new BufferSource(videoBytes), formats: ALL_FORMATS })
  const audio = new Input({ source: new BufferSource(audioBytes), formats: ALL_FORMATS })
  try {
    const videoTrack = await video.getPrimaryVideoTrack()
    const audioTrack = await audio.getPrimaryAudioTrack()
    if (!videoTrack || !audioTrack) throw new Error('成片缺少视频轨道或音频文件缺少音轨')
    const videoDuration = await videoTrack.computeDuration()
    const audioDuration = await audioTrack.computeDuration()
    if (!Number.isFinite(videoDuration) || videoDuration <= 0 || audioDuration + 0.05 < videoDuration) {
      throw new Error('音轨短于生成的视频')
    }
    const target = new BufferTarget()
    const output = new Output({ target, format: new Mp4OutputFormat() })
    // 只复制编码数据；不依赖 Worker 中不可用的视频与音频编解码器。
    const videoConversion = await Conversion.init({ input: video, output, tracks: 'primary', audio: { discard: true }, composable: true, copy: { mode: 'forced' } })
    const audioConversion = await Conversion.init({ input: audio, output, tracks: 'primary', video: { discard: true }, trim: { end: videoDuration }, composable: true, copy: { mode: 'forced' } })
    if (!videoConversion.isValid || !audioConversion.isValid || !videoConversion.utilizedTracks.includes(videoTrack) || !audioConversion.utilizedTracks.includes(audioTrack)) {
      throw new Error('音视频编码不支持直接封装为 MP4')
    }
    await output.start()
    await Promise.all([videoConversion.execute(), audioConversion.execute()])
    await output.finalize()
    if (!target.buffer) throw new Error('音视频合成未产生输出')
    return new Uint8Array(target.buffer)
  } finally {
    video.dispose()
    audio.dispose()
  }
}
