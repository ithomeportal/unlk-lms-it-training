import { createUploadthing, type FileRouter } from 'uploadthing/next';
import { getCurrentUser, isAdmin } from './auth';

const f = createUploadthing();

export const ourFileRouter = {
  // For course thumbnails
  thumbnailUploader: f({ image: { maxFileSize: '4MB', maxFileCount: 1 } })
    .middleware(async () => {
      const user = await getCurrentUser();
      if (!user || !isAdmin(user)) throw new Error('Unauthorized');
      return { userId: user.id };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      console.log('Thumbnail uploaded by:', metadata.userId);
      return { url: file.ufsUrl };
    }),

  // For lesson attachments (PDFs, ZIPs, etc.)
  attachmentUploader: f({
    pdf: { maxFileSize: '32MB', maxFileCount: 10 },
    'application/zip': { maxFileSize: '256MB', maxFileCount: 5 },
    'application/x-zip-compressed': { maxFileSize: '256MB', maxFileCount: 5 },
  })
    .middleware(async () => {
      const user = await getCurrentUser();
      if (!user || !isAdmin(user)) throw new Error('Unauthorized');
      return { userId: user.id };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      console.log('Attachment uploaded by:', metadata.userId);
      return { url: file.ufsUrl, name: file.name, size: file.size };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
