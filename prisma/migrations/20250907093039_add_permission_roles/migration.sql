-- AlterTable
ALTER TABLE `GuildSettings` ADD COLUMN `devGuardRoleId` VARCHAR(191) NULL,
    ADD COLUMN `hostAttendanceRoleId` VARCHAR(191) NULL,
    ADD COLUMN `shieldMemberRoleId` VARCHAR(191) NULL,
    ADD COLUMN `staffRoleId` VARCHAR(191) NULL;
