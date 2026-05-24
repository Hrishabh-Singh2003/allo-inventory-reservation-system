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
      // 2. Just-In-Time (JIT) passive expiry: Release all expired pending reservations globally
      await this.cleanupExpiredReservations(tx);

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
      // Just-In-Time (JIT) passive expiry: Release all expired pending reservations globally
      await this.cleanupExpiredReservations(tx);

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
   * Reusable lazy cleanup utility for expired pending reservations.
   * Finds all expired pending reservations, releases their inventory,
   * and updates their status to RELEASED.
   */
  static async cleanupExpiredReservations(tx?: any) {
    const now = new Date();

    const executeCleanup = async (transactionClient: any) => {
      const expiredReservations = await transactionClient.reservation.findMany({
        where: {
          status: ReservationStatus.PENDING,
          expiresAt: { lt: now },
        },
        include: { items: true },
      });

      if (expiredReservations.length === 0) return { count: 0 };

      let count = 0;
      for (const res of expiredReservations) {
        // Fetch and lock reservation to prevent concurrent double-releases
        const currentRes = await transactionClient.reservation.findUnique({
          where: { id: res.id },
        });

        if (!currentRes || currentRes.status !== ReservationStatus.PENDING) {
          continue;
        }

        // Sort items for deadlock prevention
        const sortedItems = [...res.items].sort((a, b) => {
          const keyA = `${a.productId}_${a.warehouseId}`;
          const keyB = `${b.productId}_${b.warehouseId}`;
          return keyA.localeCompare(keyB);
        });

        // Lock inventory rows and decrement reservedQuantity
        for (const item of sortedItems) {
          const inventories = await transactionClient.$queryRaw<any[]>`
            SELECT id, "reservedQuantity" FROM "Inventory"
            WHERE "productId" = ${item.productId} AND "warehouseId" = ${item.warehouseId}
            FOR UPDATE
          `;

          if (inventories.length > 0) {
            const stock = inventories[0];
            const decrementAmount = Math.min(item.quantity, stock.reservedQuantity);

            await transactionClient.inventory.update({
              where: { id: stock.id },
              data: {
                reservedQuantity: { decrement: decrementAmount },
              },
            });
          }
        }

        // Mark reservation as RELEASED
        await transactionClient.reservation.update({
          where: { id: res.id },
          data: {
            status: ReservationStatus.RELEASED,
          },
        });
        count++;
      }
      return { count };
    };

    if (tx) {
      return await executeCleanup(tx);
    } else {
      return await db.$transaction(async (newTx) => {
        return await executeCleanup(newTx);
      });
    }
  }

  /**
   * System-wide cleanup: Finds and releases all expired pending reservations.
   * Redirects to the reusable lazyCleanupExpired method.
   */
  static async cleanupExpiredGlobal() {
    try {
      return await this.cleanupExpiredReservations();
    } catch (err) {
      console.error("Failed to run global cleanup:", err);
      return { count: 0 };
    }
  }
}
