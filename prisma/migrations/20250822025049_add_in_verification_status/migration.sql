/*
  Warnings:

  - You are about to drop the `PendingAlert` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE `VRChatAccount` MODIFY `accountType` ENUM('MAIN', 'ALT', 'UNVERIFIED', 'IN_VERIFICATION') NOT NULL DEFAULT 'IN_VERIFICATION';

-- DropTable
DROP TABLE `PendingAlert`;
