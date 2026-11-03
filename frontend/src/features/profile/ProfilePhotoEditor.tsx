import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import type { ProfileAvatar as AvatarValue } from './profile.types';
import { ProfileAvatar } from './ProfileAvatar';
import {
  cropRect,
  panPhoto,
  decodePhoto,
  photoApi,
  PHOTO_SIDE,
  uploadPhoto,
  type PhotoState,
} from './photo-client';
import './profile-photo.css';
export function ProfilePhotoEditor({
  avatar,
  name,
  onSaved,
  onClose,
}: {
  avatar: AvatarValue | null;
  name: string;
  onSaved: (avatar: AvatarValue | null) => void;
  onClose: () => void;
}) {
  const id = useId(),
    dialog = useRef<HTMLDialogElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    fileInput = useRef<HTMLInputElement>(null),
    drag = useRef<{
      id: number;
      left: number;
      top: number;
      x: number;
      y: number;
      side: number;
    } | null>(null),
    imageRef = useRef<ImageBitmap | null>(null),
    controller = useRef<AbortController | null>(null),
    ticket = useRef<string | null>(null),
    alive = useRef(true),
    selection = useRef(0);
  const [source, setSource] = useState<ImageBitmap | null>(null),
    [zoom, setZoom] = useState(1),
    [x, setX] = useState(0),
    [y, setY] = useState(0),
    [state, setState] = useState<PhotoState | null>(null),
    [error, setError] = useState<string | null>(null),
    [phase, setPhase] = useState<'idle' | 'decoding' | 'uploading' | 'finishing' | 'removing'>(
      'idle',
    ),
    [progress, setProgress] = useState(0),
    [retry, setRetry] = useState(0);
  const busy = phase !== 'idle',
    finishing = phase === 'finishing' || phase === 'removing';
  useEffect(() => {
    const element = dialog.current,
      previous = document.activeElement,
      overflow = document.body.style.overflow;
    alive.current = true;
    element?.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      alive.current = false;
      controller.current?.abort();
      imageRef.current?.close();
      if (ticket.current) void photoApi.cancel(ticket.current).catch(() => undefined);
      element?.close();
      document.body.style.overflow = overflow;
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    void photoApi
      .get(abort.signal)
      .then((value) => {
        if (!abort.signal.aborted) setState(value);
      })
      .catch(() => {
        if (!abort.signal.aborted)
          setError('Photo availability could not be checked. Retry before saving.');
      });
    return () => abort.abort();
  }, [retry]);
  useEffect(() => {
    if (!source || !canvas.current) return;
    const context = canvas.current.getContext('2d');
    if (!context) return;
    const crop = cropRect(source.width, source.height, zoom, x, y);
    context.clearRect(0, 0, PHOTO_SIDE, PHOTO_SIDE);
    context.drawImage(source, crop.x, crop.y, crop.side, crop.side, 0, 0, PHOTO_SIDE, PHOTO_SIDE);
  }, [source, zoom, x, y]);
  const select = async (file: File) => {
    const request = ++selection.current;
    imageRef.current?.close();
    imageRef.current = null;
    setSource(null);
    setPhase('decoding');
    setError(null);
    try {
      const image = await decodePhoto(file);
      if (!alive.current || request !== selection.current) {
        image.close();
        return;
      }
      imageRef.current = image;
      setSource(image);
      setZoom(1);
      setX(0);
      setY(0);
    } catch (e) {
      if (alive.current && request === selection.current)
        setError(e instanceof Error ? e.message : 'The image could not be opened.');
    } finally {
      if (alive.current && request === selection.current) setPhase('idle');
    }
  };
  const save = async () => {
    if (busy || !state?.available || !state.version || !source || !canvas.current) return;
    setError(null);
    setPhase('uploading');
    setProgress(0);
    const abort = new AbortController();
    controller.current = abort;
    const timeout = window.setTimeout(() => abort.abort(), 120000);
    try {
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.current!.toBlob(
          (value) =>
            value ? resolve(value) : reject(new Error('The crop could not be prepared.')),
          'image/png',
        ),
      );
      const grant = await photoApi.authorize(blob.size, state.version, abort.signal);
      ticket.current = grant.ticket;
      if (abort.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      await uploadPhoto(grant.uploadUrl, grant.requiredHeaders, blob, abort.signal, (p) => {
        if (alive.current) setProgress(p);
      });
      if (alive.current) setPhase('finishing');
      const result = await photoApi.complete(grant.ticket, abort.signal);
      if (!result.available || result.avatar?.type !== 'photo')
        throw new Error('Photo saving could not be confirmed. Reload your profile.');
      ticket.current = null;
      if (alive.current) {
        onSaved(result.avatar);
        onClose();
      }
    } catch (e) {
      if (ticket.current) void photoApi.cancel(ticket.current).catch(() => undefined);
      ticket.current = null;
      if (alive.current)
        setError(
          abort.signal.aborted
            ? 'The request was interrupted. Reload your profile before retrying.'
            : e instanceof Error
              ? e.message
              : 'Photo saving could not be confirmed. Reload your profile.',
        );
    } finally {
      window.clearTimeout(timeout);
      if (alive.current) setPhase('idle');
    }
  };
  const remove = async () => {
    if (busy || !state?.available || !state.version) return;
    setPhase('removing');
    setError(null);
    const abort = new AbortController();
    controller.current = abort;
    const timeout = window.setTimeout(() => abort.abort(), 30000);
    try {
      const result = await photoApi.remove(state.version, abort.signal);
      if (!result.available || result.avatar?.type === 'photo')
        throw new Error('Removal could not be confirmed. Reload your profile.');
      if (alive.current) {
        onSaved(result.avatar);
        onClose();
      }
    } catch {
      if (alive.current)
        setError('Removal could not be confirmed. Reload your profile before retrying.');
    } finally {
      window.clearTimeout(timeout);
      if (alive.current) setPhase('idle');
    }
  };
  const resetCrop = () => {
    setZoom(1);
    setX(0);
    setY(0);
    drag.current = null;
  };
  const cancel = () => {
    if (finishing) return;
    controller.current?.abort();
    onClose();
  };
  return (
    <dialog
      ref={dialog}
      className="cc-photo-dialog"
      aria-labelledby={id}
      aria-modal="true"
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const controls = [
          ...event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled):not([hidden]), [tabindex="0"]',
          ),
        ].filter((element) => element.getClientRects().length > 0);
        const first = controls[0],
          last = controls.at(-1);
        if (
          (event.shiftKey && document.activeElement === first) ||
          (!event.shiftKey && document.activeElement === last)
        ) {
          event.preventDefault();
          (event.shiftKey ? last : first)?.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        cancel();
      }}
    >
      <header>
        <div>
          <h2 id={id}>Profile photo</h2>
        </div>
        <button
          type="button"
          className="cc-button cc-button--ghost"
          disabled={finishing}
          onClick={cancel}
        >
          Close
        </button>
      </header>
      <div className="cc-photo-main">
        <p className="cc-photo-help">
          JPEG, PNG or WebP &middot; Up to 5 MB. Shown on your profile and beside your name.
        </p>
        {error && (
          <p role="alert" className="sp-error">
            {error}
          </p>
        )}
        {state === null && !error ? (
          <p role="status">Checking photo saving availability...</p>
        ) : state && !state.available ? (
          <p className="cc-photo-gate" role="status">
            Photo saving is not available yet.
          </p>
        ) : null}
        {state === null && error && (
          <button
            type="button"
            className="cc-button cc-button--secondary"
            onClick={() => {
              setError(null);
              setRetry((n) => n + 1);
            }}
          >
            Retry availability
          </button>
        )}
        <div className="cc-photo-workspace">
          <div
            className={'cc-photo-preview' + (source ? ' cc-photo-preview--editable' : '')}
            role="group"
            aria-label="Reposition photo"
            aria-roledescription="photo crop"
            aria-describedby={id + '-position-help ' + id + '-keyboard-help'}
            aria-disabled={!source || busy}
            tabIndex={source && !busy ? 0 : -1}
            onKeyDown={(event) => {
              if (
                !source ||
                busy ||
                !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
              )
                return;
              event.preventDefault();
              drag.current = null;
              const step = event.shiftKey ? 15 : 5;
              if (event.key === 'ArrowLeft') setX((n) => Math.min(100, n + step));
              if (event.key === 'ArrowRight') setX((n) => Math.max(-100, n - step));
              if (event.key === 'ArrowUp') setY((n) => Math.min(100, n + step));
              if (event.key === 'ArrowDown') setY((n) => Math.max(-100, n - step));
            }}
            onPointerDown={(event) => {
              if (!source || busy || !event.isPrimary || event.button !== 0 || drag.current) return;
              event.currentTarget.focus();
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = {
                id: event.pointerId,
                left: event.clientX,
                top: event.clientY,
                x,
                y,
                side: event.currentTarget.getBoundingClientRect().width,
              };
            }}
            onPointerMove={(event) => {
              const origin = drag.current;
              if (!source || busy || !origin || origin.id !== event.pointerId) return;
              const next = panPhoto(
                source.width,
                source.height,
                zoom,
                origin.x,
                origin.y,
                event.clientX - origin.left,
                event.clientY - origin.top,
                origin.side,
              );
              setX(next.x);
              setY(next.y);
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
            onLostPointerCapture={() => {
              drag.current = null;
            }}
          >
            {source ? (
              <canvas
                ref={canvas}
                width={PHOTO_SIDE}
                height={PHOTO_SIDE}
                aria-label="Circular preview of your square photo crop"
              />
            ) : (
              <ProfileAvatar avatar={avatar} fallback={name} />
            )}
          </div>
          <p className="cc-photo-position-help" id={id + '-position-help'}>
            {source
              ? 'Drag to reposition \u00b7 Use arrow keys for precision'
              : 'Choose a photo to preview your new avatar.'}
          </p>
          <span className="cc-photo-sr-only" id={id + '-keyboard-help'}>
            Focus the photo to reposition with arrow keys. Hold Shift for larger movements.
          </span>
          <div className="cc-photo-controls">
            <input
              ref={fileInput}
              hidden
              type="file"
              aria-label="Choose photo file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                if (file) void select(file);
              }}
            />
            {source && (
              <div className="cc-photo-zoom">
                <label htmlFor={id + '-zoom'}>
                  Zoom <output>{Math.round(zoom * 100)}%</output>
                </label>
                <div className="cc-photo-zoom-row">
                  <button
                    type="button"
                    className="cc-button cc-button--secondary"
                    aria-label="Zoom out"
                    disabled={busy || zoom <= 1}
                    onClick={() => {
                      drag.current = null;
                      setZoom((n) => Math.max(1, Math.round((n - 0.1) * 100) / 100));
                    }}
                  >
                    &minus;
                  </button>
                  <input
                    id={id + '-zoom'}
                    aria-label="Zoom"
                    aria-valuetext={Math.round(zoom * 100) + '%'}
                    style={{ '--photo-zoom-fill': ((zoom - 1) / 2) * 100 + '%' } as CSSProperties}
                    type="range"
                    min="1"
                    max="3"
                    step="0.01"
                    value={zoom}
                    disabled={busy}
                    onChange={(e) => {
                      drag.current = null;
                      setZoom(Number(e.target.value));
                    }}
                  />
                  <button
                    type="button"
                    className="cc-button cc-button--secondary"
                    aria-label="Zoom in"
                    disabled={busy || zoom >= 3}
                    onClick={() => {
                      drag.current = null;
                      setZoom((n) => Math.min(3, Math.round((n + 0.1) * 100) / 100));
                    }}
                  >
                    +
                  </button>
                </div>
              </div>
            )}
            <div className="cc-photo-actions">
              <button
                type="button"
                className="cc-button cc-button--secondary cc-photo-select"
                disabled={busy}
                onClick={() => fileInput.current?.click()}
              >
                {source || avatar?.type === 'photo' ? 'Change Photo' : 'Choose Photo'}
              </button>
              {source && (
                <button
                  type="button"
                  className="cc-button cc-button--ghost cc-photo-reset"
                  disabled={busy}
                  onClick={resetCrop}
                >
                  Reset Crop
                </button>
              )}
              {avatar?.type === 'photo' && (
                <button
                  type="button"
                  className="cc-button cc-button--secondary"
                  disabled={busy || !state?.available}
                  onClick={() => void remove()}
                >
                  Remove photo
                </button>
              )}
            </div>
          </div>
        </div>
        {busy && (
          <div role="status" aria-live="polite">
            <p>
              {phase === 'decoding'
                ? 'Opening photo...'
                : phase === 'uploading'
                  ? `Uploading photo: ${progress}%`
                  : phase === 'removing'
                    ? 'Removing photo...'
                    : 'Verifying and saving photo...'}
            </p>
            {phase === 'uploading' && (
              <progress max="100" value={progress} aria-label="Photo upload progress" />
            )}
          </div>
        )}
      </div>
      <footer>
        <button
          type="button"
          className="cc-button cc-button--secondary"
          disabled={finishing}
          onClick={cancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="cc-button cc-button--primary"
          disabled={busy || !source || !state?.available}
          onClick={() => void save()}
        >
          Save photo
        </button>
      </footer>
    </dialog>
  );
}
