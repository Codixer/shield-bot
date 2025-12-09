-- CreateTable
CREATE TABLE `DiscordEventSync` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `guildId` VARCHAR(191) NOT NULL,
    `discordEventId` VARCHAR(191) NOT NULL,
    `vrchatEventId` VARCHAR(191) NULL,
    `vrchatGroupId` VARCHAR(191) NOT NULL,
    `lastSyncedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `DiscordEventSync_discordEventId_key`(`discordEventId`),
    INDEX `DiscordEventSync_guildId_idx`(`guildId`),
    INDEX `DiscordEventSync_discordEventId_idx`(`discordEventId`),
    INDEX `DiscordEventSync_vrchatGroupId_idx`(`vrchatGroupId`),
    INDEX `DiscordEventSync_guildId_discordEventId_idx`(`guildId`, `discordEventId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
