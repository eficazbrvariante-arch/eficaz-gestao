-- CreateEnum
CREATE TYPE "OrderOrigin" AS ENUM ('CHECKOUT', 'WHATSAPP');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "origin" "OrderOrigin" NOT NULL DEFAULT 'CHECKOUT',
ALTER COLUMN "fulfillment" DROP NOT NULL,
ALTER COLUMN "paymentMethod" DROP NOT NULL;
