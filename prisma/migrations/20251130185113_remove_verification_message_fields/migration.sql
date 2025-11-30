/*
  Warnings:

  - You are about to drop the column `verificationChannelId` on the `VRChatAccount` table. All the data in the column will be lost.
  - You are about to drop the column `verificationMessageId` on the `VRChatAccount` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `VRChatAccount` DROP COLUMN `verificationChannelId`,
    DROP COLUMN `verificationMessageId`;
