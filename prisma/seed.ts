import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting database seeding...");

  // 1. Clean existing records in strict dependency order (children first)
  console.log("🧹 Clearing existing database records...");
  await prisma.reservationItem.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.product.deleteMany();
  await prisma.warehouse.deleteMany();
  console.log("✨ Database cleared.");

  // 2. Insert 3 Warehouses (Global Logistical Hubs)
  console.log("🏢 Seeding warehouses...");
  const warehouses = await Promise.all([
    prisma.warehouse.create({
      data: {
        code: "WH-US-EAST",
        name: "North America East Hub",
        location: "New York City, NY, USA",
      },
    }),
    prisma.warehouse.create({
      data: {
        code: "WH-US-WEST",
        name: "North America West Hub",
        location: "San Francisco, CA, USA",
      },
    }),
    prisma.warehouse.create({
      data: {
        code: "WH-EU-CENTRAL",
        name: "European Distribution Center",
        location: "Frankfurt, Germany",
      },
    }),
  ]);
  console.log(`✅ Seeded ${warehouses.length} warehouses.`);

  // 3. Insert 5 Realistic Premium Consumer Electronics Products
  console.log("📦 Seeding catalog products...");
  const products = await Promise.all([
    prisma.product.create({
      data: {
        sku: "APL-MBP14-M3",
        name: "Apple MacBook Pro 14\" M3 Max",
        description: "14-inch liquid retina display, Apple M3 Max chip with 14‑core CPU and 30‑core GPU, 36GB Unified Memory, 1TB SSD, Space Black.",
        price: 3199.00,
      },
    }),
    prisma.product.create({
      data: {
        sku: "SNY-WH1000XM5-B",
        name: "Sony WH-1000XM5 ANC Headphones",
        description: "Premium wireless over-ear noise-canceling headphones with auto NC optimizer, 30-hour battery life, crystal clear hands-free calling, black finish.",
        price: 398.00,
      },
    }),
    prisma.product.create({
      data: {
        sku: "KNC-Q1PRO-W-RED",
        name: "Keychron Q1 Pro Mechanical Keyboard",
        description: "Full aluminum QMK/VIA wireless mechanical keyboard, layout ANSI layout, Gateron Pro Red linear switches, fully hot-swappable switches, shell white.",
        price: 199.50,
      },
    }),
    prisma.product.create({
      data: {
        sku: "DEL-U3425WE-C",
        name: "Dell UltraSharp 34\" Curved Monitor",
        description: "34-inch ultra-wide curved WQHD monitor, IPS Black technology, 120Hz refresh rate, 90W USB-C hub connectivity, built-in RJ45 ethernet port.",
        price: 949.99,
      },
    }),
    prisma.product.create({
      data: {
        sku: "APL-IPH15PM-256-NT",
        name: "Apple iPhone 15 Pro Max 256GB",
        description: "6.7-inch Super Retina XDR display, aerospace-grade titanium design, A17 Pro chip, customizable Action button, advanced 5x telephoto camera, Natural Titanium.",
        price: 1199.00,
      },
    }),
  ]);
  console.log(`✅ Seeded ${products.length} catalog products.`);

  // 4. Seeding Inventory Quantities (Product-Warehouse matrix)
  console.log("📊 Seeding warehouse inventory levels...");
  const inventoryMatrix = [
    // --- Apple MacBook Pro ---
    { productIdx: 0, warehouseIdx: 0, total: 24 }, // US-East: Plenty of stock
    { productIdx: 0, warehouseIdx: 1, total: 8 },  // US-West: Scarcity
    { productIdx: 0, warehouseIdx: 2, total: 15 }, // EU-Central: Good stock

    // --- Sony Headphones ---
    { productIdx: 1, warehouseIdx: 0, total: 80 }, // US-East
    { productIdx: 1, warehouseIdx: 1, total: 45 }, // US-West
    { productIdx: 1, warehouseIdx: 2, total: 95 }, // EU-Central

    // --- Keychron Keyboard ---
    { productIdx: 2, warehouseIdx: 0, total: 15 }, // US-East
    { productIdx: 2, warehouseIdx: 1, total: 30 }, // US-West
    { productIdx: 2, warehouseIdx: 2, total: 0 },  // EU-Central: Out of Stock!

    // --- Dell Curved Monitor ---
    { productIdx: 3, warehouseIdx: 0, total: 8 },  // US-East: Low quantity
    { productIdx: 3, warehouseIdx: 1, total: 18 }, // US-West
    { productIdx: 3, warehouseIdx: 2, total: 5 },  // EU-Central: Critical stock

    // --- Apple iPhone 15 Pro Max ---
    { productIdx: 4, warehouseIdx: 0, total: 50 }, // US-East
    { productIdx: 4, warehouseIdx: 1, total: 12 }, // US-West: Low stock
    { productIdx: 4, warehouseIdx: 2, total: 40 }, // EU-Central
  ];

  for (const record of inventoryMatrix) {
    const product = products[record.productIdx];
    const warehouse = warehouses[record.warehouseIdx];

    await prisma.inventory.create({
      data: {
        productId: product.id,
        warehouseId: warehouse.id,
        totalQuantity: record.total,
        reservedQuantity: 0,
      },
    });
  }

  console.log("✅ Seeded inventory matrix combinations.");
  console.log("🌱 Database seeding script executed successfully!");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("❌ Seeding failed with error:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
