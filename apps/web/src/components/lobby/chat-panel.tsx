"use client";

import { useEffect, useRef, useState } from "react";
import { EVENTS, type ChatMessage } from "@secret-rules/shared";
import { useMultiplayer } from "../../multiplayer/provider.tsx";
import { GameButton, GameCard, PlayerBadge } from "../ui/index.ts";
import { GameIcon } from "../icons/game-icon.tsx";

/** Plain React text nodes only: no HTML, Markdown, link previews or embedded content. */
export function ChatMessages({ messages, mutedIds }: { messages: ChatMessage[]; mutedIds: string[] }) {
  return <>{messages.filter((message) => !mutedIds.includes(message.authorId)).map((message) => <div key={message.messageId} className="chat-message"><div className="chat-message__author"><PlayerBadge name={message.displayName} avatarId={message.avatarId} tone={message.playerColor ?? "spectator"} compact />{message.role === "spectator" && <span className="you-label role-label">SPECTATOR</span>}<time dateTime={new Date(message.sentAt).toISOString()}>{new Date(message.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></div><p>{message.text}</p></div>)}</>;
}
export function ChatPanel() {
  const { room, client, pending, connection, mutedPlayerIds } = useMultiplayer();
  const [draft, setDraft] = useState("");
  const log = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const messages = room?.chatMessages;
  useEffect(() => { if (following.current && log.current) log.current.scrollTop = log.current.scrollHeight; }, [messages, mutedPlayerIds]);
  const disabled = pending || connection !== "connected";
  async function send() {
    if (disabled || !draft.trim()) return;
    if (await client.send(EVENTS.chat, { text: draft })) { setDraft(""); following.current = true; }
  }
  return <GameCard className="lobby-chat"><div className="lobby-section-heading"><GameIcon name="players" size={18} /><h2>ROOM CHAT</h2><span className="eyebrow">KEEP IT FRIENDLY. ISH.</span></div>
    <div ref={log} className="chat-log" role="log" aria-label="Room chat messages" aria-live="polite" aria-relevant="additions" onScroll={(event) => { const element = event.currentTarget; following.current = element.scrollHeight - element.scrollTop - element.clientHeight < 60; }}>
      {messages?.length ? <ChatMessages messages={messages} mutedIds={mutedPlayerIds} /> : <p className="chat-empty">A suspiciously quiet room. Say hello.</p>}
    </div>
    {mutedPlayerIds.length > 0 && <div className="chat-muted"><span>{mutedPlayerIds.length} muted · only for you</span><button onClick={client.clearMutes}>UNMUTE ALL</button></div>}
    <form onSubmit={(event) => { event.preventDefault(); void send(); }}><label className="lobby-field">YOUR MESSAGE<textarea rows={2} maxLength={280} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Make a questionable first impression…" disabled={disabled} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} /></label><div className="chat-compose-footer"><span>Enter to send · Shift + Enter for a new line<br />{draft.length} / 280 · recent messages only</span><GameButton type="submit" size="small" disabled={disabled || !draft.trim()}>SEND <GameIcon name="arrow" size={15} /></GameButton></div></form>
  </GameCard>;
}
