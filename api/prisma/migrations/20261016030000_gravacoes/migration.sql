-- AlterTable
ALTER TABLE `clients` ADD COLUMN `recording_retention_days` INTEGER NOT NULL DEFAULT 30,
    ADD COLUMN `webhook_secret` VARCHAR(80) NULL;

-- CreateTable
CREATE TABLE `recordings` (
    `id` VARCHAR(191) NOT NULL,
    `client_id` VARCHAR(191) NOT NULL,
    `room_name` VARCHAR(64) NOT NULL,
    `storage_key` VARCHAR(300) NOT NULL,
    `content_type` VARCHAR(60) NOT NULL DEFAULT 'video/mp4',
    `size_bytes` BIGINT NOT NULL DEFAULT 0,
    `duration_sec` INTEGER NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'READY',
    `webhook_status` VARCHAR(20) NOT NULL DEFAULT 'NONE',
    `webhook_attempts` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expires_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `recordings_client_id_created_at_idx`(`client_id`, `created_at`),
    INDEX `recordings_status_expires_at_idx`(`status`, `expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `recordings` ADD CONSTRAINT `recordings_client_id_fkey` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

