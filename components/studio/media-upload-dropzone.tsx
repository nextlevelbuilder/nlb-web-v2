'use client';

import React, { useState, useRef } from 'react';
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
    } catch (err: any) {
      setError(err.message || 'Failed to upload media to Cloudflare R2.');
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
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            {accept === 'video' ? <VideoIcon className="w-3.5 h-3.5 text-primary" /> : <ImageIcon className="w-3.5 h-3.5 text-primary" />}
            {label}
          </label>

          <button
            type="button"
            onClick={() => setShowUrlInput(!showUrlInput)}
            className="text-[11px] text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
          >
            <LinkIcon className="w-3 h-3" />
            {showUrlInput ? 'Switch to file upload' : 'Paste external URL'}
          </button>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Mode A: Direct URL Input */}
      {showUrlInput ? (
        <div className="flex items-center gap-2">
          <input
            type="url"
            placeholder="https://cdn.example.com/asset.png"
            value={value || customUrl}
            onChange={(e) => {
              setCustomUrl(e.target.value);
              onChange(e.target.value);
            }}
            className="flex-1 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary font-mono"
          />
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange('')}
              className="h-8 w-8 p-0 text-muted-foreground hover:text-rose-400"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      ) : value ? (
        /* Mode B: Preview of Existing Asset */
        <div className="p-3 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-between gap-3 group hover:border-white/20 transition-all">
          <div className="flex items-center gap-3 overflow-hidden">
            {/* Visual Thumbnail */}
            <div className="w-12 h-12 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
              {isVideoUrl(value) ? (
                <video src={value} className="w-full h-full object-cover" muted playsInline />
              ) : (
                <img src={value} alt="Preview" className="w-full h-full object-cover" />
              )}
            </div>

            <div className="truncate text-xs space-y-0.5">
              <div className="font-semibold text-foreground truncate">{value.split('/').pop() || 'Uploaded Asset'}</div>
              <div className="text-[10px] text-emerald-400 flex items-center gap-1 font-mono">
                <CheckCircle2 className="w-2.5 h-2.5" />
                Cloudflare R2 CDN Ready
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              asChild
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <a href={value} target="_blank" rel="noreferrer" title="Open asset in new tab">
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground border border-white/10 rounded-lg"
            >
              Change
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange('')}
              className="h-7 w-7 p-0 text-muted-foreground hover:text-rose-400 rounded-lg"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      ) : (
        /* Mode C: Dropzone to Upload */
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => !isUploading && fileInputRef.current?.click()}
          className={`p-4 rounded-2xl border-2 border-dashed transition-all cursor-pointer text-center space-y-2 ${
            isDragging
              ? 'border-primary bg-primary/10 shadow-lg shadow-primary/20'
              : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'
          }`}
        >
          {isUploading ? (
            <div className="py-3 flex flex-col items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
              <span className="text-xs text-muted-foreground font-mono">Uploading to Cloudflare R2...</span>
            </div>
          ) : (
            <div className="py-2 flex flex-col items-center justify-center gap-1.5">
              <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                <UploadCloud className="w-4 h-4" />
              </div>
              <div className="text-xs font-medium text-foreground">
                <span className="text-primary font-bold">Click to upload</span> or drag and drop
              </div>
              <div className="text-[10px] text-muted-foreground font-mono">
                {accept === 'video'
                  ? 'MP4, WebM up to 100MB'
                  : accept === 'both'
                  ? 'Images up to 10MB • Videos up to 100MB'
                  : 'PNG, JPG, WebP, SVG up to 10MB'}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={acceptedMime}
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
