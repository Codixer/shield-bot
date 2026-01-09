/*
  Warnings:

  - You are about to drop the `FriendLocation` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `FriendLocationConsent` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `FriendLocationConsent` DROP FOREIGN KEY `FriendLocationConsent_ownerUserId_fkey`;

-- DropTable
DROP TABLE `FriendLocation`;

-- DropTable
DROP TABLE `FriendLocationConsent`;
