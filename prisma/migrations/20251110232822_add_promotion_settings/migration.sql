-- AlterTable
ALTER TABLE `GuildSettings` ADD COLUMN `promotionChannelId` VARCHAR(191) NULL,
    ADD COLUMN `promotionMinHours` DOUBLE NULL DEFAULT 4,
    ADD COLUMN `promotionMinPatrols` INTEGER NULL DEFAULT 2,
    ADD COLUMN `promotionRecruitRoleId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `VoicePatrolSession` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `guildId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `channelId` VARCHAR(191) NOT NULL,
    `startedAt` DATETIME(3) NOT NULL,
    `endedAt` DATETIME(3) NOT NULL,
    `durationMs` BIGINT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `VoicePatrolSession_guild_user_idx`(`guildId`, `userId`),
    INDEX `VoicePatrolSession_guild_idx`(`guildId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
