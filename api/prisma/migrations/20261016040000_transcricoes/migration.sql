-- AlterTable
ALTER TABLE `clients` ADD COLUMN `minutes_prompt` TEXT NULL,
    ADD COLUMN `transcription_enabled` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `token_issues` ADD COLUMN `user_name` VARCHAR(120) NULL;

-- CreateTable
CREATE TABLE `transcripts` (
    `id` VARCHAR(191) NOT NULL,
    `recording_id` VARCHAR(191) NOT NULL,
    `client_id` VARCHAR(191) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    `language` VARCHAR(10) NOT NULL DEFAULT 'pt',
    `text` LONGTEXT NULL,
    `segments` JSON NULL,
    `duration_sec` INTEGER NULL,
    `minutes` LONGTEXT NULL,
    `minutes_model` VARCHAR(80) NULL,
    `error` VARCHAR(500) NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `transcripts_recording_id_key`(`recording_id`),
    INDEX `transcripts_status_idx`(`status`),
    INDEX `transcripts_client_id_created_at_idx`(`client_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `token_issues_room_name_created_at_idx` ON `token_issues`(`room_name`, `created_at`);

-- AddForeignKey
ALTER TABLE `transcripts` ADD CONSTRAINT `transcripts_client_id_fkey` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

