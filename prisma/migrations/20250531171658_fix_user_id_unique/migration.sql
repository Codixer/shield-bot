/*
  Warnings:

  - A unique constraint covering the columns `[vrcUserId]` on the table `FriendLocation` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX `FriendLocation_vrcUserId_key` ON `FriendLocation`(`vrcUserId`);
