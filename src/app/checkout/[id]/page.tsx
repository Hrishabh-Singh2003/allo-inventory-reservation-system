import { db } from "@/lib/db";
import { CheckoutClient } from "@/components/checkout/checkout-client";
import { ArrowLeft, Clock } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

// Always query fresh database status logs for checkout transactions
export const dynamic = "force-dynamic";

interface CheckoutPageProps {
  params: Promise<{ id: string }>;
}

export default async function CheckoutPage({ params }: CheckoutPageProps) {
  // Resolve dynamic URL path parameter asynchronously (Next.js 15+ standard)
  const { id } = await params;

  // Retrieve reservation details directly on server
  const reservationRaw = await db.reservation.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          product: {
            select: { name: true, sku: true, price: true },
          },
          warehouse: {
            select: { name: true, location: true },
          },
        },
      },
    },
  });

  // Serialization mapping
  const reservation = reservationRaw
    ? {
        ...reservationRaw,
        expiresAt: reservationRaw.expiresAt.toISOString(),
        createdAt: reservationRaw.createdAt.toISOString(),
        confirmedAt: reservationRaw.confirmedAt ? reservationRaw.confirmedAt.toISOString() : null,
        items: reservationRaw.items.map((item) => ({
          ...item,
          product: {
            ...item.product,
            price: Number(item.product.price),
          },
        })),
      }
    : null;

  // 404/Empty State: Reservation expired, release, or non-existent
  if (!reservation || reservation.status !== "PENDING") {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
        <div className="mb-4 rounded-full bg-amber-500/10 p-4 text-amber-500">
          <Clock className="h-10 w-10 animate-spin" />
        </div>

        <h2 className="text-foreground text-2xl font-bold tracking-tight sm:text-3xl">
          Reservation Hold Expired
        </h2>

        <p className="text-muted-foreground mt-2 max-w-md text-sm">
          This inventory hold code is either invalid, manually released, or has expired. To prevent
          double booking, the system returned the items back to shelves.
        </p>

        <div className="mt-6 flex gap-4">
          <Link href="/" passHref>
            <Button className="flex items-center gap-1.5">
              <ArrowLeft className="h-4 w-4" />
              Return to Products Catalog
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="border-border flex flex-col gap-1 border-b pb-4">
        <h1 className="text-foreground text-2xl font-extrabold tracking-tight sm:text-3xl">
          Purchase Hold Checkout
        </h1>
        <p className="text-muted-foreground text-xs sm:text-sm">
          Complete payment parameters inside the Stock Lock secure transaction boundary.
        </p>
      </div>

      <CheckoutClient reservation={reservation} />
    </div>
  );
}
