import { useRef, useState } from 'react';
import Icon from '../ui/Icon';
import Spinner from '../ui/Spinner';
import { api } from '../../lib/apiClient';
import { useFetch } from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';

/**
 * Product/banner/blog image picker.
 *
 * Uploads go straight to `POST /uploads/images`, which streams them to Cloudinary and
 * returns `{url, publicId}`. Only that pair is stored on the document - never the binary,
 * which keeps MongoDB documents small and lets Cloudinary handle resizing and format.
 *
 * Picking from the device always works. `GET /uploads/status` reports which driver is
 * behind it - Cloudinary when the server has keys, the server's own disk otherwise -
 * and the only thing that changes in the UI is a one-line note about durability, since
 * disk-stored files do not survive a redeploy on a free host.
 *
 * Alt text is a required field on every image, matching `imageInput` on the server. An
 * image with no alt text is an accessibility bug and an SEO one, so the form makes you
 * write it rather than letting a 422 tell you later.
 *
 * Pasting a URL is still available behind a toggle, for a photo that already lives on
 * a CDN and does not need re-uploading.
 */
export default function ImageUploader({ images = [], onChange, folder = 'products', max = 10 }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [urlDraft, setUrlDraft] = useState('');
  const [showUrlField, setShowUrlField] = useState(false);
  const [dragging, setDragging] = useState(false);
  const toast = useToast();

  const { data: status } = useFetch('/uploads/status');
  // Default to enabled: a slow status call should not disable the button that works.
  const uploadsEnabled = status?.enabled ?? true;
  const ephemeral = status ? status.persistent === false : false;
  const maxMb = status?.maxBytes ? Math.round(status.maxBytes / (1024 * 1024)) : 5;
  const room = Math.max(0, max - images.length);

  const uploadFiles = async (picked) => {
    const files = [...picked].slice(0, room);
    if (!files.length) return;

    const oversized = files.filter((file) => status?.maxBytes && file.size > status.maxBytes);
    if (oversized.length) {
      toast.error(`${oversized[0].name} is larger than ${maxMb}MB`);
      return;
    }

    const body = new FormData();
    files.forEach((file) => body.append('images', file));
    body.append('folder', folder);

    setUploading(true);
    try {
      // FormData needs the browser to set its own multipart boundary, so this one call
      // bypasses the JSON `post()` helper and uses the axios instance directly.
      const response = await api.post('/uploads/images', body);
      const uploaded = response.data?.data?.images ?? [];
      const failed = response.data?.data?.failed ?? [];

      onChange([
        ...images,
        // Alt text starts empty on purpose - a filename is not alt text, and
        // prefilling one would let it ship as if it had been written.
        ...uploaded.map((image) => ({ url: image.url, publicId: image.publicId, alt: '' })),
      ]);

      // The server explains per file why one was rejected ("not a valid PNG"), which
      // is the difference between an admin fixing the file and retrying the same one.
      if (failed.length) {
        const [first] = failed;
        toast.warning(
          failed.length === 1
            ? `${first.filename}: ${first.reason}`
            : `${failed.length} images could not be uploaded - ${first.reason}`
        );
      } else toast.success(response.data?.message ?? 'Images uploaded');
    } catch (error) {
      toast.error(error?.normalised?.message ?? 'Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const pickFiles = (event) => uploadFiles(event.target.files ?? []);

  /** Drag-and-drop from a file manager, filtered to images so a stray PDF is ignored. */
  const onDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    if (uploading || !room) return;
    const files = [...(event.dataTransfer?.files ?? [])].filter((file) =>
      file.type.startsWith('image/')
    );
    if (!files.length) {
      toast.error('Drop a JPEG, PNG, WebP or AVIF image');
      return;
    }
    uploadFiles(files);
  };

  const addUrl = () => {
    const url = urlDraft.trim();
    if (!url) return;
    onChange([...images, { url, alt: '' }]);
    setUrlDraft('');
  };

  const update = (index, patch) =>
    onChange(images.map((image, position) => (position === index ? { ...image, ...patch } : image)));

  const removeAt = (index) => onChange(images.filter((_, position) => position !== index));

  /** Reordering matters: image[0] is the thumbnail everywhere on the storefront. */
  const move = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {images.length ? (
        <ul className="space-y-2">
          {images.map((image, index) => (
            <li
              key={`${image.url}-${index}`}
              className="border-cream-300 bg-cream-50 flex items-start gap-3 rounded-xl border p-2.5"
            >
              <img
                src={image.url}
                alt=""
                loading="lazy"
                className="bg-cream-200 size-16 shrink-0 rounded-lg object-cover"
              />

              <div className="min-w-0 flex-1">
                <label className="sr-only" htmlFor={`alt-${index}`}>
                  Alt text for image {index + 1}
                </label>
                <input
                  id={`alt-${index}`}
                  type="text"
                  maxLength={160}
                  value={image.alt ?? ''}
                  onChange={(event) => update(index, { alt: event.target.value })}
                  placeholder="Describe the photo, e.g. Jar of mula ko achar with sesame"
                  aria-invalid={image.alt ? undefined : 'true'}
                  className="field-input min-h-9 text-sm"
                />
                <p className={image.alt ? 'field-hint' : 'field-error'}>
                  {index === 0 ? 'Main image · used as the thumbnail. ' : ''}
                  {image.alt ? 'Alt text set' : 'Alt text is required'}
                </p>
              </div>

              <div className="flex shrink-0 flex-col gap-0.5">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  className="btn-ghost btn-sm size-8 px-0"
                  aria-label={`Move image ${index + 1} up`}
                >
                  <Icon name="arrowRight" className="size-4 -rotate-90" />
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === images.length - 1}
                  className="btn-ghost btn-sm size-8 px-0"
                  aria-label={`Move image ${index + 1} down`}
                >
                  <Icon name="arrowRight" className="size-4 rotate-90" />
                </button>
                <button
                  type="button"
                  onClick={() => removeAt(index)}
                  className="btn-ghost btn-sm size-8 px-0 text-red-600"
                  aria-label={`Remove image ${index + 1}`}
                >
                  <Icon name="trash" className="size-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="border-cream-300 text-ink-400 rounded-xl border border-dashed px-4 py-6 text-center text-sm">
          No images yet. At least one is required.
        </p>
      )}

      {room === 0 ? (
        <p className="text-ink-400 text-xs">Maximum of {max} images reached.</p>
      ) : (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            multiple
            onChange={pickFiles}
            className="hidden"
            id="image-upload-input"
          />

          {/**
           * The drop zone is a plain div, not a button: the visible button inside it is
           * the keyboard and screen-reader path to the same file dialog, so making the
           * container focusable too would just add a duplicate stop in the tab order.
           */}
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`rounded-xl border border-dashed p-4 text-center transition-colors ${
              dragging ? 'border-leaf-500 bg-leaf-50' : 'border-cream-300 bg-cream-50'
            }`}
          >
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading || !uploadsEnabled}
              className="btn-outline btn-sm"
            >
              {uploading ? <Spinner className="size-4" /> : <Icon name="upload" className="size-4" />}
              {uploading ? 'Uploading…' : `Choose image${room === 1 ? '' : 's'} from your device`}
            </button>
            <p className="text-ink-400 mt-2 text-xs">
              or drag and drop here · JPEG, PNG, WebP or AVIF · up to {maxMb}MB · {room} slot
              {room === 1 ? '' : 's'} left
            </p>
          </div>

          {/**
           * Only shown for the local-disk driver. It is a real caveat - a redeploy on a
           * free host takes the files with it - but it does not stop the upload working
           * today, so it reads as a note rather than an error.
           */}
          {ephemeral ? (
            <p className="text-mustard-800 bg-mustard-50 border-mustard-200 flex items-start gap-1.5 rounded-lg border px-2.5 py-2 text-xs">
              <Icon name="info" className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Images are being saved on this server. They work now, but a redeploy will clear
                them - set the Cloudinary keys before going live so they are stored permanently.
              </span>
            </p>
          ) : null}

          {showUrlField ? (
            <div className="flex gap-2">
              <label className="sr-only" htmlFor="image-url">
                Image URL
              </label>
              <input
                id="image-url"
                type="url"
                value={urlDraft}
                onChange={(event) => setUrlDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return;
                  // The uploader is embedded in a form; Enter here means "add this URL",
                  // not "submit the product".
                  event.preventDefault();
                  addUrl();
                }}
                placeholder="https://…"
                className="field-input min-h-9 text-sm"
              />
              <button type="button" onClick={addUrl} className="btn-outline btn-sm shrink-0">
                Add
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowUrlField(true)}
              className="text-ink-400 hover:text-ink-600 text-xs underline"
            >
              Or paste an image URL instead
            </button>
          )}
        </>
      )}
    </div>
  );
}
