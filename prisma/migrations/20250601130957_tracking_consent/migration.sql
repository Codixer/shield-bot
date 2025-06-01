-- CreateTable
CREATE TABLE `FriendLocationConsent` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ownerVrcUserId` VARCHAR(191) NOT NULL,
    `ownerUserId` INTEGER NULL,
    `grantedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `FriendLocationConsent` ADD CONSTRAINT `FriendLocationConsent_ownerUserId_fkey` FOREIGN KEY (`ownerUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
