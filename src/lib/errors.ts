export class InsufficientStockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InsufficientStockError";
    // Ensure correct prototype chain representation
    Object.setPrototypeOf(this, InsufficientStockError.prototype);
  }
}

export class InventoryNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InventoryNotFoundError";
    Object.setPrototypeOf(this, InventoryNotFoundError.prototype);
  }
}

export class ReservationExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReservationExpiredError";
    Object.setPrototypeOf(this, ReservationExpiredError.prototype);
  }
}
