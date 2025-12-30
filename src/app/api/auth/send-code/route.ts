import { NextRequest, NextResponse } from 'next/server';
import { sendAuthCode } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const result = await sendAuthCode(email);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Send code error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
