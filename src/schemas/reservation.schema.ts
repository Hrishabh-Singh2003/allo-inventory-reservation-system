import { z } from "zod";

export const ReservationItemInputSchema = z.object({
  productId: z.string().uuid("Invalid Product ID format. Must be a valid UUID."),
  warehouseId: z.string().uuid("Invalid Warehouse ID format. Must be a valid UUID."),
  quantity: z
    .number()
    .int("Quantity must be a whole integer.")
    .positive("Quantity must be greater than zero.")
    .max(1000, "Maximum allocation per item is 1,000 units."),
});

export const CreateReservationSchema = z.object({
  items: z
    .array(ReservationItemInputSchema)
    .min(1, "At least one item must be provided for a reservation."),
  ttlMinutes: z
    .number()
    .int()
    .positive()
    .max(120, "Maximum reservation hold duration is 120 minutes.")
    .optional(),
});

export type CreateReservationInput = z.infer<typeof CreateReservationSchema>;
export type ReservationItemInput = z.infer<typeof ReservationItemInputSchema>;
