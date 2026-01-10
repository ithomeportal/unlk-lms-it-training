import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import fs from 'fs';
import path from 'path';

// Base path for course files (outside of app directory)
const COURSES_BASE_PATH = path.join(process.cwd(), '..', 'courses');

// Allowed file extensions
const ALLOWED_EXTENSIONS = ['.pdf', '.zip', '.qvf'];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    // Require authentication
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { path: pathSegments } = await params;

    if (!pathSegments || pathSegments.length === 0) {
      return NextResponse.json({ error: 'File path required' }, { status: 400 });
    }

    // Construct the file path
    const requestedPath = pathSegments.join('/');
    const filePath = path.join(COURSES_BASE_PATH, requestedPath);

    // Security: Ensure the path doesn't escape the courses directory
    const normalizedPath = path.normalize(filePath);
    if (!normalizedPath.startsWith(COURSES_BASE_PATH)) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 403 });
    }

    // Check file extension
    const ext = path.extname(filePath).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json({ error: 'File type not allowed' }, { status: 403 });
    }

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Get file stats
    const stats = fs.statSync(filePath);
    const fileName = path.basename(filePath);

    // Determine content type
    const contentType = ext === '.pdf'
      ? 'application/pdf'
      : ext === '.zip'
        ? 'application/zip'
        : 'application/octet-stream';

    // Read file and return as response
    const fileBuffer = fs.readFileSync(filePath);

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': stats.size.toString(),
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    console.error('File download error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
