import { db } from "@/lib/db";

export class StockService {
  /**
   * Fetches the complete list of products along with their inventories and calculated availability.
   */
  static async getProductStockDetails() {
    const products = await db.product.findMany({
      include: {
        inventories: {
          include: {
            warehouse: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });

    // Dynamically calculate availableQuantity (totalQuantity - reservedQuantity)
    return products.map((product) => ({
      ...product,
      inventories: product.inventories.map((inv) => ({
        ...inv,
        availableQuantity: inv.totalQuantity - inv.reservedQuantity,
      })),
    }));
  }

  /**
   * Fetches stock levels specifically for a single warehouse.
   */
  static async getWarehouseStocks(warehouseId: string) {
    const inventories = await db.inventory.findMany({
      where: { warehouseId },
      include: {
        product: true,
        warehouse: true,
      },
      orderBy: { product: { name: "asc" } },
    });

    return inventories.map((inv) => ({
      ...inv,
      availableQuantity: inv.totalQuantity - inv.reservedQuantity,
    }));
  }

  /**
   * Restocks a product inside a warehouse.
   * Creates or updates a totalQuantity row.
   */
  static async restockPhysicalInventory(productId: string, warehouseId: string, quantity: number) {
    if (quantity < 0) {
      throw new Error("Restock quantity must be a non-negative value.");
    }

    return await db.inventory.upsert({
      where: {
        productId_warehouseId: { productId, warehouseId },
      },
      update: {
        totalQuantity: {
          increment: quantity,
        },
      },
      create: {
        productId,
        warehouseId,
        totalQuantity: quantity,
        reservedQuantity: 0,
      },
      include: {
        product: true,
        warehouse: true,
      },
    });
  }
}
