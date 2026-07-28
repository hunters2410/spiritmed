/**
 * PageLoader — skeleton shimmer shown as the Suspense fallback
 * while a lazy-loaded page chunk is being downloaded.
 *
 * Provides a structured placeholder that matches the typical
 * page layout (header bar + content cards) so the UI doesn't
 * feel like a blank flash between navigations.
 */
export function PageLoader() {
  return (
    <div className="animate-pulse space-y-5 p-2">
      {/* Page title bar */}
      <div className="flex items-center justify-between">
        <div className="h-7 w-48 bg-gray-200 dark:bg-gray-700 rounded-lg" />
        <div className="h-9 w-28 bg-gray-200 dark:bg-gray-700 rounded-lg" />
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3"
          >
            <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-8 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        ))}
      </div>

      {/* Filter / search bar */}
      <div className="flex gap-3">
        <div className="h-9 flex-1 bg-gray-200 dark:bg-gray-700 rounded-lg" />
        <div className="h-9 w-32 bg-gray-200 dark:bg-gray-700 rounded-lg" />
        <div className="h-9 w-24 bg-gray-200 dark:bg-gray-700 rounded-lg" />
      </div>

      {/* Table skeleton */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-5 gap-4 px-5 py-3 border-b border-gray-200 dark:border-gray-700">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-4 bg-gray-200 dark:bg-gray-700 rounded" />
          ))}
        </div>

        {/* Table rows */}
        {[...Array(8)].map((_, row) => (
          <div
            key={row}
            className="grid grid-cols-5 gap-4 px-5 py-4 border-b border-gray-100 dark:border-gray-700/50"
          >
            {[...Array(5)].map((_, col) => (
              <div
                key={col}
                className={`h-4 bg-gray-100 dark:bg-gray-700 rounded ${col === 0 ? 'w-3/4' : ''}`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
