/*
  Warnings:

  - You are about to drop the column `description` on the `whitelist_roles` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `whitelist_roles` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[guildId,discordRoleId]` on the table `whitelist_roles` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX `whitelist_roles_discordRoleId_key` ON `whitelist_roles`;

-- DropIndex
DROP INDEX `whitelist_roles_name_key` ON `whitelist_roles`;

-- AlterTable
ALTER TABLE `whitelist_roles` DROP COLUMN `description`,
    DROP COLUMN `name`,
    ADD COLUMN `guildId` VARCHAR(191) NOT NULL DEFAULT '813926536457224212',
    ADD COLUMN `permissions` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `whitelist_roles_guildId_idx` ON `whitelist_roles`(`guildId`);

-- CreateIndex
CREATE UNIQUE INDEX `whitelist_roles_guildId_discordRoleId_key` ON `whitelist_roles`(`guildId`, `discordRoleId`);
