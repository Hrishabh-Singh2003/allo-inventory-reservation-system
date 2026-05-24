import { Product, Warehouse, Inventory, Reservation, ReservationItem } from "@prisma/client";

export type InventoryWithCalculatedAvailability = Inventory & {
  availableQuantity: number;
  warehouse?: Warehouse;
  product?: Product;
};

export type ProductWithInventory = Product & {
  inventories: InventoryWithCalculatedAvailability[];
};

export type ReservationItemWithDetails = ReservationItem & {
  product: Product;
  warehouse: Warehouse;
};

export type ReservationWithDetails = Reservation & {
  items: ReservationItemWithDetails[];
};

export type APIErrorResponse = {
  error: string;
  details?: any;
};
