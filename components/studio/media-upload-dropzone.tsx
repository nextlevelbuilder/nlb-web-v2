'use client';

import React, { useState, useRef, useId } from 'react';
import { Button } from '@/components/ui/button';
import {
  UploadCloud,
  Image as ImageIcon,
  Video as VideoIcon,
  Loader2,
  X,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Link as LinkIcon,
} from 'lucide-react';
import { uploadMediaToR2 } from '@/lib/media/upload-client';

export interface MediaUploadDropzoneProps {
  value?: string;
  onChange: (url: string) => void;
  accept?: 'image' | 'video' | 'both';
  label?: string;
  folder?: 'images' | 'videos' | 'logos' | 'screenshots';
  placeholder?: string;
  className?: string;
}

export default function MediaUploadDropzone({
  value,
  onChange,
  accept = 'image',
  label,
  folder = 'images',
  placeholder = 'Upload image to Cloudflare R2...',
  className = '',
}: MediaUploadDropzoneProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [customUrl, setCustomUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fieldId = useId();
  const labelId = `${fieldId}-label`;
  const urlInputId = `${fieldId}-url`;

  const acceptedMime =
    accept === 'video'
      ? 'video/mp4,video/webm,video/quicktime'
      : accept === 'both'
      ? 'image/png,image/jpeg,image/webp,image/svg+xml,image/gif,video/mp4,video/webm'
      : 'image/png,image/jpeg,image/webp,image/svg+xml,image/gif';

  const handleFile = async (file: File) => {
    setError(null);
    setIsUploading(true);

    try {
      const res = await uploadMediaToR2(file, folder);
      onChange(res.url);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Failed to upload media to Cloudflare R2.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const isVideoUrl = (url?: string) => {
    if (!url) return false;
    return url.match(/\.(mp4|webm|mov)(\?.*)?$/i) || accept === 'video';
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {label && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label id={labelId} htmlFor={showUrlInput ? urlInputId : undefined} className="mono-label flex items-center gap-1.5 text-ink-3">
            {accept === 'video' ? <VideoIcon aria-hidden className="w-3.5 h-3.5 text-primary" /> : <ImageIcon aria-hidden className="w-3.5 h-3.5 text-primary" />}
            {label}
          </label>

          <button
            type="button"
            onClick={() => setShowUrlInput(!showUrlInput)}
            aria-pressed={showUrlInput}
            className="inline-flex min-h-10 items-center gap-1 rounded-sm text-step-xs text-ink-2 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <LinkIcon aria-hidden className="w-3 h-3" />
            {showUrlInput ? 'Switch to file upload' : 'Paste external URL'}
          </button>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div role="alert" className="p-2.5 rounded-sm bg-destructive/10 border border-destructive/40 text-destructive text-step-xs flex items-center gap-2">
          <AlertCircle aria-hidden className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Mode A: Direct URL Input */}
      {showUrlInput ? (
        <div className="flex items-center gap-2">
          <input
            id={urlInputId}
            aria-label={label ? undefined : 'Media URL'}
            type="url"
            placeholder="https://cdn.example.com/asset.png"
            value={value || customUrl}
            onChange={(e) => {
              setCustomUrl(e.target.value);
              onChange(e.target.value);
            }}
            className="h-10 min-w-0 flex-1 rounded-sm border border-input bg-surface px-3 font-mono text-step-xs text-foreground placeholder:text-ink-3 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onChange('')}
              aria-label="Clear media URL"
              className="hover:text-destructive"
            >
              <X aria-hidden className="w-4 h-4" />
            </Button>
          )}
        </div>
      ) : value ? (
        /* Mode B: Preview of Existing Asset */
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-line bg-canvas-deep p-3 transition-colors hover:border-line-strong">
          <div className="flex items-center gap-3 overflow-hidden">
            {/* Visual Thumbnail */}
            <div className="w-12 h-12 rounded-sm bg-surface-raised border border-line flex items-center justify-center overflow-hidden shrink-0">
              {isVideoUrl(value) ? (
                <video src={value} className="w-full h-full object-cover" muted playsInline />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- user-supplied R2/external URL; next/image would need every host allow-listed.
                <img src={value} alt="" className="w-full h-full object-cover" />
              )}
            </div>

            <div className="min-w-0 truncate text-step-xs space-y-0.5">
              <div className="font-semibold text-foreground truncate">{value.split('/').pop() || 'Uploaded Asset'}</div>
              <div className="flex items-center gap-1 font-mono text-step-xs text-success">
                <CheckCircle2 aria-hidden className="w-3 h-3" />
                Media ready
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              asChild
            >
              <a href={value} target="_blank" rel="noopener noreferrer" aria-label="Open asset in a new tab">
                <ExternalLink aria-hidden className="w-3.5 h-3.5" />
              </a>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              Change
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onChange('')}
              aria-label="Remove media"
              className="hover:text-destructive"
            >
              <X aria-hidden className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      ) : (
        /* Mode C: Dropzone to Upload */
        <button
          type="button"
          aria-labelledby={label ? labelId : undefined}
          aria-label={label ? undefined : placeholder}
          aria-busy={isUploading}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => !isUploading && fileInputRef.current?.click()}
          className={`block w-full p-4 rounded-sm border-2 border-dashed transition-colors cursor-pointer text-center space-y-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            isDragging
              ? 'border-primary bg-primary/10'
              : 'border-line bg-surface hover:border-line-strong hover:bg-surface-raised'
          }`}
        >
          {isUploading ? (
            <span className="py-3 flex flex-col items-center justify-center gap-2">
              <Loader2 aria-hidden className="w-5 h-5 text-primary animate-spin" />
              <span role="status" className="font-mono text-step-xs text-ink-2">Uploading to Cloudflare R2...</span>
            </span>
          ) : (
            <span className="py-2 flex flex-col items-center justify-center gap-1.5">
              <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-sm border border-line text-primary">
                <UploadCloud className="w-4 h-4" />
              </span>
              <span className="block text-step-xs font-medium text-foreground">
                <span className="font-semibold text-primary">Click to upload</span> or drag and drop
              </span>
              <span className="block font-mono text-step-xs text-ink-3">
                {accept === 'video'
                  ? 'MP4, WebM up to 100MB'
                  : accept === 'both'
                  ? 'Images up to 10MB • Videos up to 100MB'
                  : 'PNG, JPG, WebP, SVG up to 10MB'}
              </span>
            </span>
          )}
        </button>
      )}

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={acceptedMime}
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleFile(e.target.files[0]);
            e.target.value = '';
          }
        }}
        className="hidden"
      />
    </div>
  );
}
