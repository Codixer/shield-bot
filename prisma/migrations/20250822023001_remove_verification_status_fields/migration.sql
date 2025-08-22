/*
  Warnings:

  - You are about to drop the column `verificationStatus` on the `VRChatAccount` table. All the data in the column will be lost.
  - You are about to drop the column `verified` on the `VRChatAccount` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `VRChatAccount` DROP COLUMN `verificationStatus`,
    DROP COLUMN `verified`,
    MODIFY `accountType` ENUM('MAIN', 'ALT', 'UNVERIFIED') NOT NULL DEFAULT 'UNVERIFIED';
