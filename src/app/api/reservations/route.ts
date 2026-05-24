import { NextRequest, NextResponse } from "next/server";
import { CreateReservationSchema } from "@/schemas/reservation.schema";
import { ReservationService } from "@/services/reservation.service";
import { InsufficientStockError, InventoryNotFoundError } from "@/lib/errors";
import {
  checkIdempotency,
  storeIdempotencyResponse,
  clearIdempotencyLock,
} from "@/lib/idempotency";

export async function POST(req: NextRequest) {
  // ─── 1. Idempotency Check ────────────────────────────────────────────────────
  // Runs BEFORE parsing the body to short-circuit as early as possible.
  const idempotency = await checkIdempotency(req, "reservations");

  if (idempotency.status === "hit") {
    // Exact same request was already processed successfully.
    // Return the stored response — no DB queries needed.
    return idempotency.response;
  }

  if (idempotency.status === "in_flight") {
    // Another thread is currently processing a request with this key.
    return NextResponse.json(
      {
        error: "Conflict",
        message:
          "A request with this Idempotency-Key is currently being processed. " +
          "Please wait a moment and retry.",
      },
      { status: 409, headers: { "Retry-After": "2" } }
    );
  }

  // ─── 2. Validation Layer ─────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    if (idempotency.status === "miss") {
      await clearIdempotencyLock(idempotency.key);
    }
    return NextResponse.json(
      { error: "Bad Request", message: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  const validation = CreateReservationSchema.safeParse(body);
  if (!validation.success) {
    if (idempotency.status === "miss") {
      // Clear lock so client can correct their payload and retry with the same key
      await clearIdempotencyLock(idempotency.key);
    }
    return NextResponse.json(
      {
        error: "Validation failed",
        details: validation.error.flatten(),
      },
      { status: 400 }
    );
  }

  const { items, ttlMinutes } = validation.data;

  // ─── 3. Business & Transaction Layer ─────────────────────────────────────────
  try {
    const reservation = await ReservationService.createReservation(items, ttlMinutes);

    const responseBody = reservation;
    const statusCode = 201;

    // ── 4. Store idempotent result BEFORE returning ───────────────────────────
    // Only successful (2xx) responses are cached. This ensures clients can safely
    // retry on any non-2xx without permanently consuming their idempotency key.
    if (idempotency.status === "miss") {
      await storeIdempotencyResponse(idempotency.key, statusCode, responseBody);
    }

    return NextResponse.json(responseBody, { status: statusCode });
  } catch (error: any) {
    console.error("API Reservation Error:", error);

    // ── 5. On failure: clear the in-flight lock so the client can retry ────────
    // We do NOT cache error responses. Only idempotent successes are stored.
    if (idempotency.status === "miss") {
      await clearIdempotencyLock(idempotency.key);
    }

    if (error instanceof InsufficientStockError) {
      return NextResponse.json({ error: "Conflict", message: error.message }, { status: 409 });
    }

    if (error instanceof InventoryNotFoundError) {
      return NextResponse.json({ error: "Not Found", message: error.message }, { status: 404 });
    }

    return NextResponse.json(
      {
        error: "Internal Server Error",
        message: error.message || "An unexpected error occurred during reservation.",
      },
      { status: 500 }
    );
  }
}
