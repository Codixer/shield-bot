-- AlterTable
ALTER TABLE `GuildSettings` MODIFY `whitelistGitHubAppPrivateKey` TEXT NULL;

-- AlterTable
ALTER TABLE `whitelist_roles` ALTER COLUMN `guildId` DROP DEFAULT;
