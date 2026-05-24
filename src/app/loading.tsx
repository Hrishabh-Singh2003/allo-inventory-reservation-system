export default function Loading() {
  return (
    <div className="space-y-6">
      {/* Header Skeleton */}
      <div className="space-y-2">
        <div className="bg-secondary h-8 w-64 animate-pulse rounded-md" />
        <div className="bg-secondary/80 h-4 w-96 animate-pulse rounded-md" />
      </div>

      {/* Intro Banner Skeleton */}
      <div className="border-border bg-card space-y-3 rounded-xl border p-6 shadow-sm">
        <div className="bg-secondary h-6 w-80 animate-pulse rounded" />
        <div className="bg-secondary/60 h-4 w-full animate-pulse rounded" />
        <div className="bg-secondary/60 h-4 w-3/4 animate-pulse rounded" />
      </div>

      {/* Products Grid Skeletons */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="border-border bg-card flex flex-col justify-between space-y-6 rounded-xl border p-6 shadow-sm"
          >
            {/* SKU and Price */}
            <div className="flex items-center justify-between">
              <div className="bg-secondary h-5 w-24 animate-pulse rounded-full" />
              <div className="bg-secondary h-6 w-16 animate-pulse rounded" />
            </div>

            {/* Title & Description */}
            <div className="space-y-2">
              <div className="bg-secondary h-6 w-3/4 animate-pulse rounded" />
              <div className="bg-secondary/60 h-4 w-full animate-pulse rounded" />
              <div className="bg-secondary/60 h-4 w-2/3 animate-pulse rounded" />
            </div>

            {/* Warehouse Stocks List */}
            <div className="space-y-4">
              <div className="bg-secondary/80 h-4 w-32 animate-pulse rounded" />
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, wIndex) => (
                  <div key={wIndex} className="space-y-1.5">
                    <div className="flex justify-between">
                      <div className="bg-secondary/60 h-3 w-28 animate-pulse rounded" />
                      <div className="bg-secondary/80 h-3.5 w-16 animate-pulse rounded" />
                    </div>
                    <div className="bg-secondary h-2 w-full animate-pulse rounded-full" />
                  </div>
                ))}
              </div>
            </div>

            {/* Button Skeleton */}
            <div className="bg-secondary/80 h-10 w-full animate-pulse rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
