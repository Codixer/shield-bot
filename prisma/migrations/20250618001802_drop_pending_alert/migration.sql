-- CreateTable
CREATE TABLE `PendingAlert` (
    `id` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `discordMsgId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `status` VARCHAR(191) NOT NULL,
    `squad` VARCHAR(191) NULL,
    `situation` VARCHAR(191) NULL,
    `world` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NOT NULL,
    `lastAlert` DATETIME(3) NULL,
    `acknowledgedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
