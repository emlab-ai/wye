import { NextResponse } from 'next/server';
import { toolchain } from '@/lib/toolchain';

// op:install.toolchain: GET → { agents: { claude, codex }, wye: { installed, link, onPath, … }, tools: { git, gh, … } };
// ?fresh=1 skips the minute's cache
export async function GET(req: Request) {
  return NextResponse.json(await toolchain(new URL(req.url).searchParams.get('fresh') === '1'));
}
