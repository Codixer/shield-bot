-- CreateTable
CREATE TABLE `FriendLocationConsent` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ownerVrcUserId` VARCHAR(191) NOT NULL,
    `allowedVrcUserId` VARCHAR(191) NOT NULL,
    `grantedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `FriendLocationConsent_ownerVrcUserId_allowedVrcUserId_key`(`ownerVrcUserId`, `allowedVrcUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
