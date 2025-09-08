/*
  Warnings:

  - You are about to drop the column `devGuardRoleId` on the `GuildSettings` table. All the data in the column will be lost.
  - You are about to drop the column `hostAttendanceRoleId` on the `GuildSettings` table. All the data in the column will be lost.
  - You are about to drop the column `shieldMemberRoleId` on the `GuildSettings` table. All the data in the column will be lost.
  - You are about to drop the column `staffRoleId` on the `GuildSettings` table. All the data in the column will be lost.
  - You are about to drop the column `trainerRoleId` on the `GuildSettings` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `GuildSettings` DROP COLUMN `devGuardRoleId`,
    DROP COLUMN `hostAttendanceRoleId`,
    DROP COLUMN `shieldMemberRoleId`,
    DROP COLUMN `staffRoleId`,
    DROP COLUMN `trainerRoleId`,
    ADD COLUMN `devGuardRoleIds` JSON NULL,
    ADD COLUMN `hostAttendanceRoleIds` JSON NULL,
    ADD COLUMN `shieldMemberRoleIds` JSON NULL,
    ADD COLUMN `staffRoleIds` JSON NULL,
    ADD COLUMN `trainerRoleIds` JSON NULL;
