-- AlterTable
ALTER TABLE `GuildSettings` ADD COLUMN `loaNotificationChannelId` VARCHAR(191) NULL,
    ADD COLUMN `loaRoleId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `leave_of_absences` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `guildId` VARCHAR(191) NOT NULL,
    `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `startDate` DATETIME(3) NOT NULL,
    `endDate` DATETIME(3) NOT NULL,
    `reason` TEXT NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'DENIED', 'ACTIVE', 'ENDED_EARLY', 'EXPIRED') NOT NULL DEFAULT 'PENDING',
    `approvedBy` VARCHAR(191) NULL,
    `deniedBy` VARCHAR(191) NULL,
    `denialReason` TEXT NULL,
    `endedEarlyAt` DATETIME(3) NULL,
    `notificationsPaused` BOOLEAN NOT NULL DEFAULT false,
    `cooldownEndDate` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `leave_of_absences_guildId_idx`(`guildId`),
    INDEX `leave_of_absences_userId_idx`(`userId`),
    INDEX `leave_of_absences_status_idx`(`status`),
    INDEX `leave_of_absences_endDate_idx`(`endDate`),
    INDEX `leave_of_absences_guildId_userId_status_idx`(`guildId`, `userId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `leave_of_absences` ADD CONSTRAINT `leave_of_absences_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
