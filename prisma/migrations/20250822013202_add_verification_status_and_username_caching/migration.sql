-- AlterTable
ALTER TABLE `VRChatAccount` ADD COLUMN `usernameUpdatedAt` DATETIME(3) NULL,
    ADD COLUMN `verificationStatus` ENUM('UNVERIFIED_BOUND', 'VERIFIED') NOT NULL DEFAULT 'UNVERIFIED_BOUND',
    ADD COLUMN `vrchatUsername` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `VRChatAccount_vrcUserId_idx` ON `VRChatAccount`(`vrcUserId`);
