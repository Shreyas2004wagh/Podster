/**
 * Placeholder for media processing pipeline (normalization, muxing, loudness).
 * Wire this into object storage events once uploads are completed.
 */
export class FfmpegService {
  async enqueueProcessing(objectKey: string) {
    // TODO: Persist a job record and trigger ffmpeg worker
    return { jobId: `job-${objectKey}`, status: "queued" as const };
  }
}
