export default function CheckoutLoading() {
  return (
    <div className="mx-auto grid max-w-6xl gap-8 py-4 lg:grid-cols-12">
      {/* Left: Billing form skeleton */}
      <div className="space-y-6 lg:col-span-7">
        <div className="bg-secondary h-8 w-28 animate-pulse rounded" />

        <div className="border-border bg-card space-y-6 rounded-xl border p-6 shadow-sm">
          <div className="space-y-1">
            <div className="bg-secondary h-6 w-40 animate-pulse rounded" />
            <div className="bg-secondary/60 h-4 w-64 animate-pulse rounded" />
          </div>

          {/* Form fields */}
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="bg-secondary/80 h-4 w-28 animate-pulse rounded" />
              <div className="bg-secondary h-10 w-full animate-pulse rounded-md" />
            </div>
          ))}

          <div className="bg-secondary/60 h-10 w-full animate-pulse rounded-md" />

          <div className="border-border flex gap-4 border-t pt-2">
            <div className="bg-secondary h-10 w-32 animate-pulse rounded-md" />
            <div className="bg-secondary/80 h-10 flex-1 animate-pulse rounded-md" />
          </div>
        </div>
      </div>

      {/* Right: Timer + Summary skeleton */}
      <div className="space-y-6 lg:col-span-5">
        {/* Timer card */}
        <div className="border-border bg-card space-y-3 rounded-xl border p-6 shadow-sm">
          <div className="bg-secondary/80 h-4 w-40 animate-pulse rounded" />
          <div className="flex items-center justify-between">
            <div className="bg-secondary/60 h-3 w-32 animate-pulse rounded" />
            <div className="bg-secondary h-8 w-20 animate-pulse rounded" />
          </div>
          <div className="bg-secondary h-1.5 w-full animate-pulse rounded-full" />
          <div className="bg-secondary/40 h-4 w-full animate-pulse rounded" />
        </div>

        {/* Order summary card */}
        <div className="border-border bg-card space-y-4 rounded-xl border p-6 shadow-sm">
          <div className="bg-secondary h-6 w-44 animate-pulse rounded" />

          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex justify-between py-1">
              <div className="space-y-1">
                <div className="bg-secondary h-4 w-40 animate-pulse rounded" />
                <div className="bg-secondary/60 h-3 w-28 animate-pulse rounded" />
              </div>
              <div className="space-y-1 text-right">
                <div className="bg-secondary h-4 w-16 animate-pulse rounded" />
                <div className="bg-secondary/60 h-3 w-20 animate-pulse rounded" />
              </div>
            </div>
          ))}

          <div className="border-border flex justify-between border-t pt-4">
            <div className="bg-secondary h-5 w-24 animate-pulse rounded" />
            <div className="bg-secondary h-7 w-28 animate-pulse rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}
