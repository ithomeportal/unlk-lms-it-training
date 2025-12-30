import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthCode } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const { email, code } = await request.json();

    if (!email || !code) {
      return NextResponse.json({ error: 'Email and code are required' }, { status: 400 });
    }

    const result = await verifyAuthCode(email, code);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Verify code error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
