-- AlterTable
ALTER TABLE `GuildSettings` ADD COLUMN `whitelistGitHubAppId` VARCHAR(191) NULL,
    ADD COLUMN `whitelistGitHubAppPrivateKey` VARCHAR(191) NULL,
    ADD COLUMN `whitelistGitHubInstallationId` VARCHAR(191) NULL;
