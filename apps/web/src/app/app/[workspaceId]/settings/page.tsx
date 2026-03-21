import { redirect } from 'next/navigation';

export default async function SettingsIndexPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  redirect(`/app/${workspaceId}/settings/execution`);
}