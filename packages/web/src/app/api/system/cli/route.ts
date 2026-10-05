import { NextResponse } from 'next/server';
import { toolchain, wyeHome } from '@/lib/toolchain';

// op:install.cli: the wye command and the Claude Code skills, installed from the app (what `wye setup` and install.sh do;
// the app also does it at startup when the command is missing). GET → { installed, link, onPath, blocked }; POST → links
// the command into ~/.local/bin and the skills into ~/.claude/skills.
export async function GET() { return NextResponse.json(wyeHome().cliStatus()); }

export async function POST() {
  try { const h = wyeHome(); const cli = h.linkCli(); const skills = h.linkSkills().length; void toolchain(true); return NextResponse.json({ ...cli, skills }); }
  catch (e) { return NextResponse.json({ error: 'install-failed', message: (e as Error).message }, { status: 409 }); }
}
