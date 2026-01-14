-- AlterTable
ALTER TABLE `GuildSettings` ADD COLUMN `leaveOfAbsenceCooldownDays` INTEGER NULL DEFAULT 14;

-- AlterTable
ALTER TABLE `leave_of_absences` MODIFY `reason` VARCHAR(191) NOT NULL,
    MODIFY `denialReason` VARCHAR(191) NULL;
