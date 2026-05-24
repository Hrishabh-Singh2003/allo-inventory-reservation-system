import { db } from "@/lib/db";
import { ReservationStatus } from "@prisma/client";
import {
  InsufficientStockError,
  InventoryNotFoundError,
  ReservationExpiredError,
} from "@/lib/errors";

export type CreateReservationItemInput = {
  productId: string;
  warehouseId: string;
  quantity: number;
};

export class ReservationService {
  /**
   * Concurrency-safe multi-item reservation creation.
   * Leverages Pessimistic Row-Level Locking (`SELECT FOR UPDATE`) and
   * deterministic key sorting to completely eliminate database deadlocks.
   */
  static async createReservation(items: CreateReservationItemInput[], ttlMinutes: number = 15) {
    if (items.length === 0) {
      throw new Error("Cannot create a reservation with zero items.");
    }

    // Validate quantities are positive
    for (const item of items) {
      if (item.quantity <= 0) {
        throw new Error("Quantity for each item must be greater than zero.");
      }
    }

    // 1. Deadlock Prevention: Sort items deterministically by compound key (productId_warehouseId)
    // If two concurrent threads request locks on items A and B, sorting ensures they both lock A
    // then B (sequentially), preventing circular wait deadlocks.
    const sortedItems = [...items].sort((a, b) => {
      const keyA = `${a.productId}_${a.warehouseId}`;
      const keyB = `${b.productId}_${b.warehouseId}`;
      return keyA.localeCompare(keyB);
    });

    return await db.$transaction(async (tx) => {
      // 2. Just-In-Time (JIT) passive expiry: Release any expired pending reservations
      // for these specific product-warehouse intersections before calculating availability.
      for (const item of sortedItems) {
        await this.cleanupExpiredForStock(tx, item.productId, item.warehouseId);
      }

      // 3. Row Locking: Lock each unique Inventory row in sorted order.
      // This forces any concurrent checkouts for these exact items to queue at the database level.
      const inventoryList: any[] = [];
      for (const item of sortedItems) {
        const inventories = await tx.$queryRaw<any[]>`
          SELECT * FROM "Inventory"
          WHERE "productId" = ${item.productId} AND "warehouseId" = ${item.warehouseId}
          FOR UPDATE
        `;

        if (inventories.length === 0) {
          throw new InventoryNotFoundError(
            `Inventory record not found for product ${item.productId} in warehouse ${item.warehouseId}.`
          );
        }
        inventoryList.push(inventories[0]);
      }

      // 4. Availability Check: Verify stock boundaries for each requested item
      for (let i = 0; i < sortedItems.length; i++) {
        const reqItem = sortedItems[i];
        const stock = inventoryList[i];
        const availableQuantity = stock.totalQuantity - stock.reservedQuantity;

        if (availableQuantity < reqItem.quantity) {
          throw new InsufficientStockError(
            `Insufficient stock for product. Requested: ${reqItem.quantity}, Available: ${availableQuantity}`
          );
        }
      }

      // 5. Allocation Update: Increment reservedQuantity for each inventory row
      for (let i = 0; i < sortedItems.length; i++) {
        const reqItem = sortedItems[i];
        const stock = inventoryList[i];

        await tx.inventory.update({
          where: { id: stock.id },
          data: {
            reservedQuantity: {
              increment: reqItem.quantity,
            },
          },
        });
      }

      // 6. Reservation Persistence: Create the parent Reservation record
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + ttlMinutes);

      const reservation = await tx.reservation.create({
        data: {
          status: ReservationStatus.PENDING,
          expiresAt,
          items: {
            create: sortedItems.map((item) => ({
              productId: item.productId,
              warehouseId: item.warehouseId,
              quantity: item.quantity,
            })),
          },
        },
        include: {
          items: {
            include: {
              product: true,
              warehouse: true,
            },
          },
        },
      });

      return reservation;
    });
  }

  /**
   * Confirms a pending multi-item reservation, converting allocation into a physical stock deduction.
   */
  static async confirmReservation(reservationId: string) {
    return await db.$transaction(async (tx) => {
      // 1. Fetch and validate reservation status
      const reservation = await tx.reservation.findUnique({
        where: { id: reservationId },
        include: { items: true },
      });

      if (!reservation) {
        throw new Error("Reservation not found.");
      }

      if (reservation.status !== ReservationStatus.PENDING) {
        throw new Error(`Cannot confirm reservation with status: ${reservation.status}`);
      }

      if (new Date() > reservation.expiresAt) {
        throw new ReservationExpiredError(
          "This reservation has already expired and cannot be confirmed."
        );
      }

      // Sort items deterministically before locking to prevent deadlocks
      const sortedItems = [...reservation.items].sort((a, b) => {
        const keyA = `${a.productId}_${a.warehouseId}`;
        const keyB = `${b.productId}_${b.warehouseId}`;
        return keyA.localeCompare(keyB);
      });

      // 2. Lock Inventory rows
      for (const item of sortedItems) {
        await tx.$queryRaw`
          SELECT * FROM "Inventory"
          WHERE "productId" = ${item.productId} AND "warehouseId" = ${item.warehouseId}
          FOR UPDATE
        `;

        // 3. Deduct totalQuantity and reservedQuantity
        await tx.inventory.update({
          where: {
            productId_warehouseId: {
              productId: item.productId,
              warehouseId: item.warehouseId,
            },
          },
          data: {
            totalQuantity: { decrement: item.quantity },
            reservedQuantity: { decrement: item.quantity },
          },
        });
      }

      // 4. Mark Reservation as confirmed
      return await tx.reservation.update({
        where: { id: reservationId },
        data: {
          status: ReservationStatus.CONFIRMED,
          confirmedAt: new Date(),
        },
        include: {
          items: {
            include: {
              product: true,
              warehouse: true,
            },
          },
        },
      });
    });
  }

  /**
   * Manually cancels/releases a pending reservation, returning stock to the available pool.
   */
  static async releaseReservation(reservationId: string) {
    return await db.$transaction(async (tx) => {
      // 1. Fetch reservation
      const reservation = await tx.reservation.findUnique({
        where: { id: reservationId },
        include: { items: true },
      });

      if (!reservation) {
        throw new Error("Reservation not found.");
      }

      if (reservation.status !== ReservationStatus.PENDING) {
        throw new Error(`Cannot release reservation with status: ${reservation.status}`);
      }

      // Sort items for deadlock prevention
      const sortedItems = [...reservation.items].sort((a, b) => {
        const keyA = `${a.productId}_${a.warehouseId}`;
        const keyB = `${b.productId}_${b.warehouseId}`;
        return keyA.localeCompare(keyB);
      });

      // 2. Lock and release reserved allocations
      for (const item of sortedItems) {
        await tx.$queryRaw`
          SELECT * FROM "Inventory"
          WHERE "productId" = ${item.productId} AND "warehouseId" = ${item.warehouseId}
          FOR UPDATE
        `;

        await tx.inventory.update({
          where: {
            productId_warehouseId: {
              productId: item.productId,
              warehouseId: item.warehouseId,
            },
          },
          data: {
            reservedQuantity: { decrement: item.quantity },
          },
        });
      }

      // 3. Set status to RELEASED
      return await tx.reservation.update({
        where: { id: reservationId },
        data: {
          status: ReservationStatus.RELEASED,
        },
        include: {
          items: {
            include: {
              product: true,
              warehouse: true,
            },
          },
        },
      });
    });
  }

  /**
   * System-wide cleanup: Finds and releases all expired pending reservations.
   * Processes sequentially inside separate mini-transactions to minimize row lock duration.
   */
  static async cleanupExpiredGlobal() {
    const now = new Date();

    const expiredReservations = await db.reservation.findMany({
      where: {
        status: ReservationStatus.PENDING,
        expiresAt: { lt: now },
      },
      include: { items: true },
    });

    if (expiredReservations.length === 0) {
      return { count: 0 };
    }

    let successCount = 0;

    for (const res of expiredReservations) {
      try {
        await db.$transaction(async (tx) => {
          // 1. Lock/fetch the current reservation row to prevent concurrent release race conditions
          const currentRes = await tx.reservation.findUnique({
            where: { id: res.id },
          });

          // Skip if the reservation was already confirmed, released, or expired by another thread
          if (!currentRes || currentRes.status !== ReservationStatus.PENDING) {
            return;
          }

          // Sort items for deadlock prevention
          const sortedItems = [...res.items].sort((a, b) => {
            const keyA = `${a.productId}_${a.warehouseId}`;
            const keyB = `${b.productId}_${b.warehouseId}`;
            return keyA.localeCompare(keyB);
          });

          // Lock and restore allocations
          for (const item of sortedItems) {
            const inventories = await tx.$queryRaw<any[]>`
              SELECT * FROM "Inventory"
              WHERE "productId" = ${item.productId} AND "warehouseId" = ${item.warehouseId}
              FOR UPDATE
            `;

            if (inventories.length > 0) {
              const stock = inventories[0];
              const decrementAmount = Math.min(item.quantity, stock.reservedQuantity);

              await tx.inventory.update({
                where: { id: stock.id },
                data: {
                  reservedQuantity: { decrement: decrementAmount },
                },
              });
            }
          }

          // Mark status as EXPIRED
          await tx.reservation.update({
            where: { id: res.id },
            data: {
              status: ReservationStatus.EXPIRED,
            },
          });

          successCount++;
        });
      } catch (err) {
        console.error(`Failed to expire reservation ${res.id} due to transactional conflict:`, err);
      }
    }

    return { count: successCount };
  }

  /**
   * Scoped JIT clean up helper running inside an active transaction block.
   */
  private static async cleanupExpiredForStock(tx: any, productId: string, warehouseId: string) {
    const now = new Date();

    // Query active items belonging to pending reservations that have passed their TTL
    const expiredItems = await tx.reservationItem.findMany({
      where: {
        productId,
        warehouseId,
        reservation: {
          status: ReservationStatus.PENDING,
          expiresAt: { lt: now },
        },
      },
      include: { reservation: true },
    });

    if (expiredItems.length === 0) return;

    // Compile distinct parent reservations to update
    const reservationIdsToExpire = Array.from(
      new Set(expiredItems.map((item: any) => item.reservationId))
    );

    // 1. Mark parent reservations as EXPIRED
    await tx.reservation.updateMany({
      where: {
        id: { in: reservationIdsToExpire },
      },
      data: {
        status: ReservationStatus.EXPIRED,
      },
    });

    // 2. Decrement allocations for this specific inventory row
    const totalQtyToRelease = expiredItems.reduce(
      (sum: number, item: any) => sum + item.quantity,
      0
    );

    const inventoryRow = await tx.inventory.findUnique({
      where: { productId_warehouseId: { productId, warehouseId } },
    });

    if (inventoryRow) {
      const decrementAmount = Math.min(totalQtyToRelease, inventoryRow.reservedQuantity);
      await tx.inventory.update({
        where: { id: inventoryRow.id },
        data: {
          reservedQuantity: { decrement: decrementAmount },
        },
      });
    }
  }
}
