import { NextRequest, NextResponse } from "next/server";
import { ReservationService } from "@/services/reservation.service";
import { ReservationExpiredError } from "@/lib/errors";
import {
  checkIdempotency,
  storeIdempotencyResponse,
  clearIdempotencyLock,
} from "@/lib/idempotency";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Resolve dynamic path parameters asynchronously (Next.js 15+ standard)
  const { id } = await params;

  // ─── 1. Idempotency Check ────────────────────────────────────────────────────
  // Namespace is scoped per reservation ID so key "abc" on /confirm/R1 and
  // key "abc" on /confirm/R2 are stored separately in Redis.
  const idempotency = await checkIdempotency(req, `confirm:${id}`);

  if (idempotency.status === "hit") {
    return idempotency.response;
  }

  if (idempotency.status === "in_flight") {
    return NextResponse.json(
      {
        error: "Conflict",
        message: "This confirmation is already being processed. Please wait and retry.",
      },
      { status: 409, headers: { "Retry-After": "2" } }
    );
  }

  // ─── 2. Business Transaction Layer ───────────────────────────────────────────
  try {
    const reservation = await ReservationService.confirmReservation(id);

    const responseBody = reservation;
    const statusCode = 200;

    // Store confirmed response — idempotent replays of /confirm return the
    // already-confirmed reservation without re-entering the transaction.
    if (idempotency.status === "miss") {
      await storeIdempotencyResponse(idempotency.key, statusCode, responseBody);
    }

    return NextResponse.json(responseBody, { status: statusCode });
  } catch (error: any) {
    console.error("Confirm Reservation API Error:", error);

    // Clear lock on any error: confirmation failures are always retryable
    // (unless the reservation genuinely expired — see below).
    if (idempotency.status === "miss") {
      await clearIdempotencyLock(idempotency.key);
    }

    if (error instanceof ReservationExpiredError) {
      return NextResponse.json({ error: "Conflict", message: error.message }, { status: 409 });
    }

    return NextResponse.json(
      { error: "Internal Server Error", message: error.message },
      { status: 500 }
    );
  }
}
