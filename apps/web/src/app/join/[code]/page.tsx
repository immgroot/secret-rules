import { JoinRoomPage } from "../../../components/lobby/room-entry.tsx";

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <JoinRoomPage code={code} />;
}
