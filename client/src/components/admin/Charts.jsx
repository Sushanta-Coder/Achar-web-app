/**
 * Charts.
 *
 * Hand-drawn SVG rather than Recharts or Chart.js. The spec asked to avoid heavy
 * libraries where a small amount of code suffices, and the whole admin needs exactly two
 * chart types: a revenue line and a horizontal bar list. Recharts alone is ~120 kB
 * gzipped, which is more than this entire application's own JavaScript.
 *
 * Both accept a plain `points` array and scale to their container, so a range change from
 * 7 days to 12 months needs no configuration.
 */
import { formatPriceCompact, formatNumber } from '../../lib/format';

/**
 * Revenue over time. Draws a filled area plus the line, with a zero baseline so a quiet
 * week reads as low rather than as an empty chart.
 *
 * `points` is `[{ key, revenue, orders }]` from `GET /admin/dashboard` - already
 * gap-filled server-side in Nepal Time, so every bucket between the endpoints exists and
 * there is nothing to interpolate here.
 */
export function SalesChart({ points = [], height = 200, valueKey = 'revenue' }) {
  if (points.length < 2) {
    return (
      <p className="text-ink-400 grid h-40 place-items-center text-sm">
        Not enough data to draw a chart yet.
      </p>
    );
  }

  const width = 600;
  const padding = { top: 12, right: 8, bottom: 22, left: 8 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const values = points.map((point) => point[valueKey] ?? 0);
  // Never scale to the max alone: with a single non-zero bucket the line would touch the
  // top and read as "at capacity". A 10% headroom keeps the shape honest.
  const peak = Math.max(...values, 1) * 1.1;

  const stepX = innerWidth / (points.length - 1);
  const xAt = (index) => padding.left + index * stepX;
  const yAt = (value) => padding.top + innerHeight - (value / peak) * innerHeight;

  const line = points.map((point, index) => `${xAt(index)},${yAt(point[valueKey] ?? 0)}`).join(' ');
  const area = `${padding.left},${padding.top + innerHeight} ${line} ${xAt(points.length - 1)},${
    padding.top + innerHeight
  }`;

  // Label density: a 30-day range would otherwise print 30 overlapping dates.
  const labelEvery = Math.ceil(points.length / 6);

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label={`${valueKey === 'revenue' ? 'Revenue' : 'Orders'} for the selected period`}
        preserveAspectRatio="none"
      >
        {/* Gridlines at quarters. Drawn behind everything, deliberately faint. */}
        {[0.25, 0.5, 0.75, 1].map((fraction) => (
          <line
            key={fraction}
            x1={padding.left}
            x2={width - padding.right}
            y1={yAt(peak * fraction)}
            y2={yAt(peak * fraction)}
            stroke="currentColor"
            strokeWidth="1"
            className="text-cream-300"
          />
        ))}

        <polygon points={area} className="fill-brand-700/10" />
        <polyline
          points={line}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          className="text-brand-700"
          vectorEffect="non-scaling-stroke"
        />

        {points.map((point, index) => (
          <circle
            key={point.key}
            cx={xAt(index)}
            cy={yAt(point[valueKey] ?? 0)}
            r="2.5"
            className="fill-brand-700"
          />
        ))}
      </svg>

      <div className="text-ink-400 mt-1 flex justify-between text-[0.6875rem]">
        {points
          .filter((_, index) => index % labelEvery === 0 || index === points.length - 1)
          .map((point) => (
            <span key={point.key}>{point.key.slice(5)}</span>
          ))}
      </div>

      {/*
        A chart is not accessible on its own, so the same numbers are available as a
        table to anyone using a screen reader - and to anyone who wants the exact figure
        rather than a pixel position.
      */}
      <details className="mt-2">
        <summary className="text-ink-500 cursor-pointer text-xs">View as a table</summary>
        <table className="admin-table mt-2 text-xs">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col" className="text-right">
                Revenue
              </th>
              <th scope="col" className="text-right">
                Orders
              </th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr key={point.key}>
                <td>{point.key}</td>
                <td className="tnum text-right">{formatPriceCompact(point.revenue)}</td>
                <td className="tnum text-right">{formatNumber(point.orders)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

/**
 * Horizontal bars for a ranked list - best sellers, sales by category, sales by district.
 * The bar is a background on the row rather than a separate element, so the label stays
 * readable at any length.
 */
export function BarList({ items = [], valueKey = 'revenue', labelKey = 'name', format }) {
  if (!items.length) {
    return <p className="text-ink-400 py-6 text-center text-sm">Nothing to show yet.</p>;
  }

  const peak = Math.max(...items.map((item) => item[valueKey] ?? 0), 1);
  const render = format ?? formatPriceCompact;

  return (
    <ul className="space-y-1.5">
      {items.map((item, index) => {
        const value = item[valueKey] ?? 0;
        return (
          <li key={item._id ?? item[labelKey] ?? index} className="relative">
            <div
              className="bg-brand-100 absolute inset-y-0 left-0 rounded"
              style={{ width: `${Math.max(2, (value / peak) * 100)}%` }}
              aria-hidden="true"
            />
            <div className="relative flex items-center justify-between gap-3 px-2 py-1.5">
              <span className="text-ink-800 min-w-0 truncate text-sm">
                {item[labelKey] ?? 'Unknown'}
              </span>
              <span className="tnum text-ink-700 shrink-0 text-sm font-semibold">
                {render(value)}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default SalesChart;
