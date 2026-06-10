'use client';

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

const ACCEPTED = ['video/mp4', 'video/webm', 'video/x-matroska'];
const ACCEPTED_EXT = ['.mp4', '.webm', '.mkv'];

export interface VideoPlayerHandle {
  /** The underlying <video> element (for the room page to drive sync). */
  readonly video: HTMLVideoElement | null;
}

interface VideoPlayerProps {
  isHost: boolean;
  /** Whether the host is allowed to control playback (after countdown). */
  canControl: boolean;
  /** Guest side — the remote MediaStream received over WebRTC. */
  remoteStream: MediaStream | null;
  /** Host side — fires once a local file has been captured as a stream. */
  onStreamReady?: (stream: MediaStream, hasAudio: boolean) => void;
  /** Host side — emit local playback actions to peers. */
  onPlay?: (currentTime: number) => void;
  onPause?: (currentTime: number) => void;
  onSeek?: (currentTime: number) => void;
  onSpeed?: (rate: number) => void;
}

type CaptureCapableVideo = HTMLVideoElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};

export const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(
  function VideoPlayer(
    {
      isHost,
      canControl,
      remoteStream,
      onStreamReady,
      onPlay,
      onPause,
      onSeek,
      onSpeed,
    },
    ref,
  ) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [fileName, setFileName] = useState<string | null>(null);
    const [needsGesture, setNeedsGesture] = useState(false);
    const objectUrlRef = useRef<string | null>(null);
    // Guard so host playback events from remote-applied changes aren't echoed.
    const suppressEvents = useRef(false);

    useImperativeHandle(ref, () => ({
      get video() {
        return videoRef.current;
      },
    }));

    // ── Guest: attach incoming remote stream ────────────────────────────────
    useEffect(() => {
      if (isHost) return;
      const video = videoRef.current;
      if (!video || !remoteStream) return;
      video.srcObject = remoteStream;
      video.play().catch(() => {
        // Autoplay may be blocked until the user interacts.
        setNeedsGesture(true);
      });
    }, [isHost, remoteStream]);

    // ── Host: capture selected file as a MediaStream ────────────────────────
    const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const validType =
        ACCEPTED.includes(file.type) ||
        ACCEPTED_EXT.some((ext) => file.name.toLowerCase().endsWith(ext));
      if (!validType) {
        alert('Please select an MP4, WebM or MKV file.');
        return;
      }

      const video = videoRef.current as CaptureCapableVideo | null;
      if (!video) return;

      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const url = URL.createObjectURL(file);
      objectUrlRef.current = url;
      video.src = url;
      setFileName(file.name);

      video.onloadedmetadata = () => {
        try {
          const capture = video.captureStream ?? video.mozCaptureStream;
          if (!capture) {
            alert('Your browser does not support captureStream().');
            return;
          }
          const stream = capture.call(video);
          const hasAudio = stream.getAudioTracks().length > 0;
          onStreamReady?.(stream, hasAudio);
        } catch (err) {
          console.error('captureStream failed', err);
        }
      };
    };

    // ── Host: forward native control actions to peers ───────────────────────
    useEffect(() => {
      if (!isHost) return;
      const video = videoRef.current;
      if (!video) return;

      const onPlayEv = () => {
        if (suppressEvents.current) return;
        onPlay?.(video.currentTime);
      };
      const onPauseEv = () => {
        if (suppressEvents.current) return;
        onPause?.(video.currentTime);
      };
      const onSeekEv = () => {
        if (suppressEvents.current) return;
        onSeek?.(video.currentTime);
      };
      const onRateEv = () => {
        if (suppressEvents.current) return;
        onSpeed?.(video.playbackRate);
      };

      video.addEventListener('play', onPlayEv);
      video.addEventListener('pause', onPauseEv);
      video.addEventListener('seeked', onSeekEv);
      video.addEventListener('ratechange', onRateEv);
      return () => {
        video.removeEventListener('play', onPlayEv);
        video.removeEventListener('pause', onPauseEv);
        video.removeEventListener('seeked', onSeekEv);
        video.removeEventListener('ratechange', onRateEv);
      };
    }, [isHost, onPlay, onPause, onSeek, onSpeed]);

    useEffect(() => {
      return () => {
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      };
    }, []);

    const startGuestPlayback = () => {
      videoRef.current
        ?.play()
        .then(() => setNeedsGesture(false))
        .catch(() => undefined);
    };

    return (
      <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden border border-slate-800">
        <video
          ref={videoRef}
          className="w-full h-full"
          // Host gets native controls; guest watches a host-driven live stream.
          controls={isHost}
          playsInline
        />

        {/* Host: empty state with file picker */}
        {isHost && !fileName && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-900/90 text-center px-6">
            <p className="text-slate-300">
              Select a movie from your computer to start hosting.
            </p>
            <label className="cursor-pointer rounded-lg bg-brand hover:bg-brand-dark px-5 py-2.5 font-medium transition">
              Choose video file
              <input
                type="file"
                accept=".mp4,.webm,.mkv,video/mp4,video/webm,video/x-matroska"
                className="hidden"
                onChange={handleFile}
              />
            </label>
            <p className="text-xs text-slate-500">
              MP4, WebM or MKV · the file never leaves your browser
            </p>
          </div>
        )}

        {/* Host: control lock until countdown finishes */}
        {isHost && fileName && !canControl && (
          <div className="absolute bottom-3 left-3 text-xs bg-black/60 rounded px-2 py-1 text-slate-300">
            {fileName} · waiting for everyone to be ready
          </div>
        )}

        {/* Guest: waiting for stream */}
        {!isHost && !remoteStream && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/90 text-slate-400 text-center px-6">
            Waiting for the host to share their video…
          </div>
        )}

        {/* Guest: autoplay blocked */}
        {!isHost && remoteStream && needsGesture && (
          <button
            onClick={startGuestPlayback}
            className="absolute inset-0 flex items-center justify-center bg-black/70 text-white text-lg font-medium"
          >
            ▶ Click to start watching
          </button>
        )}
      </div>
    );
  },
);
