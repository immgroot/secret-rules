import { LobbyPage } from "../../../components/lobby/lobby-page.tsx";

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <LobbyPage code={code} />;
}
