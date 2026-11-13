-- CreateTable
CREATE TABLE "ShareLinkFolder" (
    "shareId" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ShareLinkFolder_pkey" PRIMARY KEY ("shareId","folderId")
);

-- CreateIndex
CREATE INDEX "ShareLinkFolder_folderId_idx" ON "ShareLinkFolder"("folderId");

-- AddForeignKey
ALTER TABLE "ShareLinkFolder" ADD CONSTRAINT "ShareLinkFolder_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "ShareLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareLinkFolder" ADD CONSTRAINT "ShareLinkFolder_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

