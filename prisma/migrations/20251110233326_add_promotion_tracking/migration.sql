-- CreateTable
CREATE TABLE `VoicePatrolPromotion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `guildId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `sessionCount` INTEGER NOT NULL,
    `totalHours` DOUBLE NOT NULL,
    `notifiedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `VoicePatrolPromotion_guild_idx`(`guildId`),
    UNIQUE INDEX `VoicePatrolPromotion_guild_user_unique`(`guildId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
