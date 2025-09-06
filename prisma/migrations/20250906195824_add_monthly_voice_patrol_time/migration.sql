-- CreateTable
CREATE TABLE `VoicePatrolMonthlyTime` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `guildId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `year` INTEGER NOT NULL,
    `month` INTEGER NOT NULL,
    `totalMs` BIGINT NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `VoicePatrolMonthlyTime_guild_year_month_idx`(`guildId`, `year`, `month`),
    UNIQUE INDEX `VoicePatrolMonthlyTime_guild_user_year_month_unique`(`guildId`, `userId`, `year`, `month`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
