/*
  Warnings:

  - You are about to drop the column `promotionMinPatrols` on the `GuildSettings` table. All the data in the column will be lost.
  - You are about to drop the column `sessionCount` on the `VoicePatrolPromotion` table. All the data in the column will be lost.
  - You are about to drop the `VoicePatrolSession` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE `GuildSettings` DROP COLUMN `promotionMinPatrols`;

-- AlterTable
ALTER TABLE `VoicePatrolPromotion` DROP COLUMN `sessionCount`;

-- DropTable
DROP TABLE `VoicePatrolSession`;
