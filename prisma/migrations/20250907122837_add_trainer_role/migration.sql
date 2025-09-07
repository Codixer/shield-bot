/*
  Warnings:

  - You are about to drop the column `patrolBotuserRoleId` on the `GuildSettings` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `GuildSettings` DROP COLUMN `patrolBotuserRoleId`,
    ADD COLUMN `trainerRoleId` VARCHAR(191) NULL;
