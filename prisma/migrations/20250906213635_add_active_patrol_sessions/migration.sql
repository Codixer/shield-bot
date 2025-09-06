/*
  Warnings:

  - You are about to drop the `VoicePatrolSettings` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE `VoicePatrolSettings`;

-- CreateTable
CREATE TABLE `ActiveVoicePatrolSession` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `guildId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `channelId` VARCHAR(191) NOT NULL,
    `startedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ActiveVoicePatrolSession_guild_idx`(`guildId`),
    UNIQUE INDEX `ActiveVoicePatrolSession_guild_user_unique`(`guildId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
