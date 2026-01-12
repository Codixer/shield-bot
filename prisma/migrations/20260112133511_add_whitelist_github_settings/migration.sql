-- AlterTable
ALTER TABLE `GuildSettings` ADD COLUMN `whitelistGitHubBranch` VARCHAR(191) NULL,
    ADD COLUMN `whitelistGitHubDecodedPath` VARCHAR(191) NULL,
    ADD COLUMN `whitelistGitHubEncodedPath` VARCHAR(191) NULL,
    ADD COLUMN `whitelistGitHubOwner` VARCHAR(191) NULL,
    ADD COLUMN `whitelistGitHubRepo` VARCHAR(191) NULL,
    ADD COLUMN `whitelistGitHubToken` VARCHAR(191) NULL,
    ADD COLUMN `whitelistXorKey` VARCHAR(191) NULL;
