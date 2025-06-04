-- CreateTable
CREATE TABLE `ActiveAttendanceEvent` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `eventId` INTEGER NOT NULL,

    UNIQUE INDEX `ActiveAttendanceEvent_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ActiveAttendanceEvent` ADD CONSTRAINT `ActiveAttendanceEvent_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActiveAttendanceEvent` ADD CONSTRAINT `ActiveAttendanceEvent_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `AttendanceEvent`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
