-- CreateTable
CREATE TABLE "edit_lock" (
    "resource_type" VARCHAR(40) NOT NULL,
    "resource_id" INTEGER NOT NULL,
    "usuario" VARCHAR(120) NOT NULL,
    "acquired_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_heartbeat" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "edit_lock_pkey" PRIMARY KEY ("resource_type","resource_id")
);

-- CreateIndex
CREATE INDEX "edit_lock_last_heartbeat_idx" ON "edit_lock"("last_heartbeat");
