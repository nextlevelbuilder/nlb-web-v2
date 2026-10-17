'use client';

export interface UploadMediaResult {
  success: boolean;
  url: string;
  storageKey: string;
  sizeBytes: number;
  mimeType: string;
  provider: string;
}

/**
 * Upload an image or video file to Cloudflare R2 via /api/v1/media/upload
 */
export async function uploadMediaToR2(
  file: File,
  folder: 'images' | 'videos' | 'logos' | 'screenshots' = 'images'
): Promise<UploadMediaResult> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('folder', folder);

  const res = await fetch('/api/v1/media/upload', {
    method: 'POST',
    body: formData,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to upload media to Cloudflare R2.');
  }

  return data as UploadMediaResult;
}
