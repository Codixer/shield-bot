-- CreateTable
CREATE TABLE `FriendLocation` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `vrcUserId` VARCHAR(191) NOT NULL,
    `location` VARCHAR(191) NOT NULL,
    `worldId` VARCHAR(191) NULL,
    `travelingTo` VARCHAR(191) NULL,
    `eventTime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
