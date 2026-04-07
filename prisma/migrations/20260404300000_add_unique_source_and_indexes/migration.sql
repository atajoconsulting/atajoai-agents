-- CreateIndex
CREATE UNIQUE INDEX "indexed_documents_source_sourceType_key" ON "app"."indexed_documents"("source", "sourceType");

-- CreateIndex
CREATE INDEX "indexed_documents_status_idx" ON "app"."indexed_documents"("status");

-- CreateIndex
CREATE INDEX "indexed_documents_createdAt_idx" ON "app"."indexed_documents"("createdAt");
