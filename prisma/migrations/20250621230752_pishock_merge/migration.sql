/*
  Warnings:

  - You are about to drop the `PiShockUser` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `PiShockDevice` DROP FOREIGN KEY `PiShockDevice_userId_fkey`;

-- DropForeignKey
ALTER TABLE `PiShockShare` DROP FOREIGN KEY `PiShockShare_userId_fkey`;

-- DropIndex
DROP INDEX `PiShockDevice_userId_fkey` ON `PiShockDevice`;

-- DropIndex
DROP INDEX `PiShockShare_userId_fkey` ON `PiShockShare`;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `pishockApiKey` VARCHAR(191) NULL,
    ADD COLUMN `pishockToken` VARCHAR(191) NULL,
    ADD COLUMN `pishockUserId` VARCHAR(191) NULL;

-- DropTable
DROP TABLE `PiShockUser`;

-- AddForeignKey
ALTER TABLE `PiShockDevice` ADD CONSTRAINT `PiShockDevice_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PiShockShare` ADD CONSTRAINT `PiShockShare_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
