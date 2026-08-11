/*
  Warnings:

  - You are about to drop the column `area` on the `Event` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Calendar" ADD COLUMN     "accentColor" TEXT NOT NULL DEFAULT '#0F172A';

-- AlterTable
ALTER TABLE "Event" DROP COLUMN "area",
ADD COLUMN     "colorOverride" TEXT,
ADD COLUMN     "labelId" TEXT,
ALTER COLUMN "googleEventId" DROP NOT NULL;

-- DropEnum
DROP TYPE "Area";

-- CreateTable
CREATE TABLE "Label" (
    "id" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,

    CONSTRAINT "Label_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Label_calendarId_name_key" ON "Label"("calendarId", "name");

-- AddForeignKey
ALTER TABLE "Label" ADD CONSTRAINT "Label_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "Calendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "Label"("id") ON DELETE SET NULL ON UPDATE CASCADE;
