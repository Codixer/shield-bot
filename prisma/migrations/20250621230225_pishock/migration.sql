-- CreateTable
CREATE TABLE `PiShockUser` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `discordId` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NULL,
    `apiKey` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NULL,
    `token` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PiShockUser_discordId_key`(`discordId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PiShockDevice` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `clientId` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `userId` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PiShockShocker` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shockerId` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `isPaused` BOOLEAN NOT NULL,
    `deviceId` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PiShockShare` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shareId` INTEGER NOT NULL,
    `clientId` INTEGER NOT NULL,
    `shockerId` INTEGER NOT NULL,
    `shockerName` VARCHAR(191) NOT NULL,
    `isPaused` BOOLEAN NOT NULL,
    `shareCode` VARCHAR(191) NOT NULL,
    `userId` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PiShockDevice` ADD CONSTRAINT `PiShockDevice_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `PiShockUser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PiShockShocker` ADD CONSTRAINT `PiShockShocker_deviceId_fkey` FOREIGN KEY (`deviceId`) REFERENCES `PiShockDevice`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PiShockShare` ADD CONSTRAINT `PiShockShare_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `PiShockUser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
