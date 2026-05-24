import Link from "next/link";
import { Layers, Database, History } from "lucide-react";

export function Navbar() {
  return (
    <header className="border-border bg-background/80 sticky top-0 z-50 w-full border-b backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo and branding */}
        <div className="flex items-center gap-2">
          <Layers className="text-primary h-6 w-6" />
          <span className="text-xl font-bold tracking-tight">StockLock</span>
          <span className="bg-primary/10 text-primary rounded-full px-2.5 py-0.5 text-xs font-semibold">
            v1.0
          </span>
        </div>

        {/* Navigation links */}
        <nav className="flex items-center gap-6">
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm font-medium transition-colors"
          >
            <Database className="h-4 w-4" />
            Products & Stock
          </Link>
          <Link
            href="/reservations"
            className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm font-medium transition-colors"
          >
            <History className="h-4 w-4" />
            Reservations
          </Link>
        </nav>

        {/* Server Connection Status Indicator */}
        <div className="border-border bg-card flex items-center gap-2 rounded-full border px-3 py-1 text-xs">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
          </span>
          <span className="text-muted-foreground font-medium">Connected to Neon DB</span>
        </div>
      </div>
    </header>
  );
}
