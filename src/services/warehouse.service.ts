import { db } from "@/lib/db";

export class WarehouseService {
  /**
   * Lists all available warehouses.
   */
  static async listWarehouses() {
    return await db.warehouse.findMany({
      orderBy: { name: "asc" },
    });
  }

  /**
   * Creates a new warehouse.
   */
  static async createWarehouse(code: string, name: string, location: string) {
    return await db.warehouse.create({
      data: {
        code: code.toUpperCase().trim(),
        name: name.trim(),
        location: location.trim(),
      },
    });
  }
}
