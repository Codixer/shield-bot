-- AlterTable
ALTER TABLE `GuildSettings` ADD COLUMN `botPromotionLogsChannelId` VARCHAR(191) NULL,
    ADD COLUMN `vrcGroupId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `GroupRoleMapping` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `guildId` VARCHAR(191) NOT NULL,
    `vrcGroupId` VARCHAR(191) NOT NULL,
    `vrcGroupRoleId` VARCHAR(191) NOT NULL,
    `discordRoleId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `GroupRoleMapping_guildId_idx`(`guildId`),
    INDEX `GroupRoleMapping_vrcGroupId_idx`(`vrcGroupId`),
    UNIQUE INDEX `GroupRoleMapping_guildId_vrcGroupRoleId_key`(`guildId`, `vrcGroupRoleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
