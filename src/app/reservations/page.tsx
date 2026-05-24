import { db } from "@/lib/db";
import { ReservationsClient } from "@/components/reservation/reservations-client";

// Force Dynamic rendering to query fresh status logs
export const dynamic = "force-dynamic";

export default async function ReservationsPage() {
  // Query all reservations sorted by creation time
  const reservationsRaw = await db.reservation.findMany({
    include: {
      items: {
        include: {
          product: {
            select: { name: true, sku: true },
          },
          warehouse: {
            select: { name: true, code: true },
          },
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  // Serialization mapping
  const reservations = reservationsRaw.map((res) => ({
    ...res,
    expiresAt: res.expiresAt.toISOString(),
    createdAt: res.createdAt.toISOString(),
    updatedAt: res.updatedAt.toISOString(),
    confirmedAt: res.confirmedAt ? res.confirmedAt.toISOString() : null,
    items: res.items.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-foreground text-3xl font-extrabold tracking-tight sm:text-4xl">
          System Bookings Log
        </h1>
        <p className="text-muted-foreground text-sm sm:text-base">
          Audit and manage inventory allocation cycles in real-time.
        </p>
      </div>

      <ReservationsClient initialReservations={reservations} />
    </div>
  );
}
