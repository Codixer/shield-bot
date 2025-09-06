-- CreateIndex
CREATE INDEX `VoicePatrolMonthlyTime_user_idx` ON `VoicePatrolMonthlyTime`(`userId`);

-- CreateIndex
CREATE INDEX `VoicePatrolTime_user_idx` ON `VoicePatrolTime`(`userId`);

-- AddForeignKey
ALTER TABLE `VoicePatrolTime` ADD CONSTRAINT `VoicePatrolTime_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`discordId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VoicePatrolMonthlyTime` ADD CONSTRAINT `VoicePatrolMonthlyTime_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`discordId`) ON DELETE RESTRICT ON UPDATE CASCADE;
