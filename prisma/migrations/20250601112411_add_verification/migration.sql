/*
  Warnings:

  - You are about to drop the column `maxLinkedAccounts` on the `GuildSettings` table. All the data in the column will be lost.
  - You are about to drop the column `patrolCategoryId` on the `GuildSettings` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `GuildSettings` DROP COLUMN `maxLinkedAccounts`,
    DROP COLUMN `patrolCategoryId`;

-- AlterTable
ALTER TABLE `VRChatAccount` ADD COLUMN `verificationCode` VARCHAR(191) NULL,
    ADD COLUMN `verified` BOOLEAN NOT NULL DEFAULT false;
