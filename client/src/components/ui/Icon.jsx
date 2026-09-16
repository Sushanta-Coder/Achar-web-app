/**
 * Icons.
 *
 * Inline SVG paths rather than an icon package. The whole app uses about twenty icons;
 * `lucide-react` would be a dependency and a bundle chunk for something this file does
 * in a few kilobytes, and the brief asked to avoid libraries where a small amount of
 * code suffices.
 *
 * Every icon is `aria-hidden` - the accessible name belongs on the button that contains
 * it, not on the decoration inside it.
 */

const PATHS = {
  cart: 'M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4H6ZM3 6h18M16 10a4 4 0 0 1-8 0',
  heart:
    'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z',
  user: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  search: 'm21 21-4.34-4.34M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'M18 6 6 18M6 6l12 12',
  chevronDown: 'm6 9 6 6 6-6',
  chevronRight: 'm9 18 6-6-6-6',
  chevronLeft: 'm15 18-6-6 6-6',
  arrowRight: 'M5 12h14m-7-7 7 7-7 7',
  arrowLeft: 'M19 12H5m7 7-7-7 7-7',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  trash: 'M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m-6 5v6m4-6v6',
  check: 'M20 6 9 17l-5-5',
  checkCircle: 'M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3',
  alert: 'M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z',
  info: 'M12 16v-4m0-4h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
  star: 'm12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01L12 2Z',
  truck: 'M14 17V5a1 1 0 0 0-1-1H2v13h12Zm0-8h5l3 4v4h-8M7.5 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm11 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  package:
    'm7.5 4.27 9 5.15M21 8v8a2 2 0 0 1-1 1.73l-7 4a2 2 0 0 1-2 0l-7-4A2 2 0 0 1 3 16V8a2 2 0 0 1 1-1.73l7-4a2 2 0 0 1 2 0l7 4A2 2 0 0 1 21 8Zm-9 5.5L3.3 7.4m8.7 6.1 8.7-6.1M12 13.5V22',
  box: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z',
  dashboard: 'M3 3h8v8H3V3Zm10 0h8v5h-8V3ZM3 13h8v8H3v-8Zm10-3h8v11h-8V10Z',
  tag: 'M12.59 2.59A2 2 0 0 0 11.17 2H4a2 2 0 0 0-2 2v7.17a2 2 0 0 0 .59 1.42l8.82 8.82a2 2 0 0 0 2.82 0l7.18-7.18a2 2 0 0 0 0-2.82ZM7 7h.01',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm14 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  chart: 'M3 3v18h18M7 16v-5m5 5V8m5 8v-3',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2-1.2l-.4-2.6h-4l-.4 2.6a7.5 7.5 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7.5 7.5 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.07-.4.1-.8.1-1.2Z',
  image: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5Zm5 4a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm13 6-5-5L5 21',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4m4-6 5-5 5 5m-5-5v12',
  edit: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7m-2.5-9.5a2.12 2.12 0 0 1 3 3L12 18l-4 1 1-4Z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14 5-5-5-5m5 5H9',
  phone:
    'M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.2 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.1 9.9a16 16 0 0 0 6 6l1.26-1.26a2 2 0 0 1 2.11-.45c.9.33 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z',
  mail: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm18 2-10 7L2 6',
  pin: 'M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0Zm-9 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-16v6l4 2',
  filter: 'M22 3H2l8 9.46V19l4 2v-8.54L22 3Z',
  sort: 'M11 5h10M11 9h7M11 13h4M3 17l3 3 3-3M6 4v16',
  external: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6m4-3h6v6m-11 5L21 3',
  leaf: 'M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Zm0 0a3 3 0 0 1-3-3c0-3 3-6 8-8',
  flame: 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.5-3.5 2-5 .5 2.5 2 3.94 4 5.5 2 1.56 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.2-2.2.6-3.15',
  refresh: 'M3 12a9 9 0 0 1 9-9 9 9 0 0 1 6.36 2.64L21 8M21 3v5h-5M21 12a9 9 0 0 1-9 9 9 9 0 0 1-6.36-2.64L3 16m0 5v-5h5',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4m-1-6 5 5 5-5m-5 5V3',
  copy: 'M8 4V2a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-2M3 6h11a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z',
  note: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 0v6h6M9 13h6m-6 4h4',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  wallet: 'M20 12V8H6a2 2 0 0 1 0-4h12v4m2 4v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6m16 6h-4a2 2 0 0 0 0 4h4',
  whatsapp:
    'M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.4A10 10 0 1 0 12 2Zm4.5 13.3c-.3.8-1.6 1.5-2.3 1.5-.6 0-1.4-.2-3.1-1.2a11 11 0 0 1-3.4-3.5c-.9-1.5-1-2.4-.9-3 .1-.5.6-1.2 1-1.4.3-.2.7-.2 1 0 .2.1.4.7.7 1.4.2.5.1.7-.1 1l-.4.5c-.1.2-.1.3 0 .5.5.9 1.7 2 2.5 2.4.2.1.4.1.5 0l.6-.6c.2-.2.4-.2.7-.1.6.2 1.3.6 1.4.8.1.2.1.6-.2 1.3Z',
  facebook: 'M14 9h3V5h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V9a1 1 0 0 1 1 0Z',
  instagram:
    'M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Zm5 6a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm5.5-1.5h.01',
};

export default function Icon({ name, className = 'size-5', strokeWidth = 2, fill = 'none', ...rest }) {
  const path = PATHS[name];
  if (!path) return null;
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <path d={path} />
    </svg>
  );
}

/**
 * Star rating. Half stars are done with a clip rather than a second icon set, so a 4.3
 * average renders honestly instead of rounding to 4.
 */
export function Stars({ value = 0, count, className = 'size-4', showValue = false }) {
  const rating = Math.max(0, Math.min(5, Number(value) || 0));

  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-flex" role="img" aria-label={`Rated ${rating.toFixed(1)} out of 5`}>
        {[0, 1, 2, 3, 4].map((index) => {
          const filled = Math.max(0, Math.min(1, rating - index));
          return (
            <span key={index} className="relative inline-block">
              <Icon name="star" className={`${className} text-cream-400`} fill="currentColor" strokeWidth={0} />
              {filled > 0 ? (
                <span
                  className="absolute inset-0 overflow-hidden"
                  style={{ width: `${filled * 100}%` }}
                >
                  <Icon
                    name="star"
                    className={`${className} text-mustard-400`}
                    fill="currentColor"
                    strokeWidth={0}
                  />
                </span>
              ) : null}
            </span>
          );
        })}
      </span>
      {showValue ? <span className="text-ink-600 text-sm font-medium">{rating.toFixed(1)}</span> : null}
      {count != null ? <span className="text-ink-400 text-xs">({count})</span> : null}
    </span>
  );
}
