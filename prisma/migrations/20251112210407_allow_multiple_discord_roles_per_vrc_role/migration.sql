/*
  Warnings:

  - A unique constraint covering the columns `[guildId,discordRoleId,vrcGroupRoleId]` on the table `GroupRoleMapping` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX `GroupRoleMapping_guildId_vrcGroupRoleId_key` ON `GroupRoleMapping`;

-- CreateIndex
CREATE INDEX `GroupRoleMapping_guildId_vrcGroupRoleId_idx` ON `GroupRoleMapping`(`guildId`, `vrcGroupRoleId`);

-- CreateIndex
CREATE UNIQUE INDEX `GroupRoleMapping_guildId_discordRoleId_vrcGroupRoleId_key` ON `GroupRoleMapping`(`guildId`, `discordRoleId`, `vrcGroupRoleId`);
