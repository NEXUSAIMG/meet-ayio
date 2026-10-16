-- AlterTable
ALTER TABLE `clients` ADD COLUMN `quota_recorded_minutes` INTEGER NULL,
    ADD COLUMN `quota_storage_mb` INTEGER NULL,
    ADD COLUMN `quota_transcribed_minutes` INTEGER NULL;

-- CreateIndex
CREATE INDEX `recordings_webhook_status_created_at_idx` ON `recordings`(`webhook_status`, `created_at`);
