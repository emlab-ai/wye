import { redirect } from 'next/navigation';
import { listProjects } from '@/lib/projects';
export default function Home() { redirect(`/p/${listProjects()[0].name}`); }
