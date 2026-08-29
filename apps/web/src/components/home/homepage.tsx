"use client";

import { useEffect, useState } from "react";
import Link from "next/link.js";
import { FullLogo, MonochromeLogo } from "../brand/logo.tsx";
import { GameIcon } from "../icons/game-icon.tsx";
import { GameButton, SectionTitle, StatusBadge } from "../ui/index.ts";
import { usePreferences, useSound } from "../../preferences/provider.tsx";
import { useMultiplayer } from "../../multiplayer/provider.tsx";
import { RoomEntryModal } from "../lobby/room-entry.tsx";
import { SecretCardScene } from "./secret-card-scene.tsx";
import { ButtonDemo } from "./demo/button-demo.tsx";
import { HowToPlay } from "./how-to-play.tsx";
import { SettingsPanel } from "./settings-panel.tsx";
import { logoClickCount } from "./interaction-state.ts";

const steps = [
  { title: "JOIN YOUR FRIENDS", text: "Gather 4–10 people. Preferably ones who used to trust you." },
  { title: "GET YOUR SECRET RULE", text: "Same challenge for everyone. A different agenda for you." },
  { title: "ARGUE ABOUT WHAT TO DO", text: "Make your case. Hide your motives. Act suspiciously." },
  { title: "FIND OUT WHO SCREWED EVERYONE", text: "The results are in. The accusations are just beginning." },
];

function HomepageContent() {
  const [overlay, setOverlay] = useState<"settings" | "tutorial" | "create" | "join" | null>(null);
  const { client, resumeRoomCode, connection } = useMultiplayer();
  const [logoClicks, setLogoClicks] = useState(0);
  const [classified, setClassified] = useState(false);
  const { reducedMotion } = usePreferences();
  const sound = useSound();
  useEffect(() => {
    if (!classified) return;
    const timeout = window.setTimeout(() => setClassified(false), 4500);
    return () => window.clearTimeout(timeout);
  }, [classified]);

  function logoClicked() {
    // The logo link gives the mark a generous target and includes keyboard users.
    if (logoClicks >= 5) return;
    const next = logoClickCount(logoClicks);
    setLogoClicks(next);
    if (next === 5) { setClassified(true); sound.play("secretReveal"); }
  }
  function roomAction(mode: "create" | "join") {
    client.clearError();
    setOverlay(mode);
  }

  return <div className="site-frame" data-reduce-motion={reducedMotion} onPointerDownCapture={sound.unlock} onKeyDownCapture={sound.unlock}>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="site-header content-width">
      <div className="brand-group"><a className={`brand-link ${classified ? "brand-link--classified" : ""}`} href="#" aria-label="SECRET RULES home" onClick={logoClicked}><FullLogo /></a><div className="classified-region" role="status">{classified && <span className="classified-note">YOU’RE NOT SUPPOSED TO KNOW THAT.</span>}</div></div>
      <nav aria-label="Main navigation"><GameButton className="nav-link" variant="ghost" onClick={() => setOverlay("tutorial")}>HOW TO PLAY</GameButton><span className="nav-divider" aria-hidden="true" /><GameButton variant="ghost" size="icon" aria-label="Open settings" onClick={() => setOverlay("settings")}><GameIcon name="settings" /></GameButton></nav>
    </header>
    <main id="main" tabIndex={-1}>
      <section className="hero content-width" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="hero-kicker"><span className="kicker-dot" /> SAME GAME. DIFFERENT RULES.</p>
          <div className="hero-title-wrap"><h1 id="hero-title">SECRET<br /><span>RULES<span className="title-period">.</span></span></h1><span className="trust-stamp" aria-hidden="true">FRIENDSHIP<br />NOT GUARANTEED</span></div>
          <p className="hero-subtitle">Same challenge. Different rules.<br /><span>Trust nobody’s instructions.</span></p>
          <div className="hero-actions"><GameButton icon={<GameIcon name="create" />} onClick={() => roomAction("create")} aria-describedby="room-preview-note">CREATE ROOM<GameIcon name="arrow" size={19} /></GameButton><GameButton variant="secondary" icon={<GameIcon name="join" />} onClick={() => roomAction("join")} aria-describedby="room-preview-note">JOIN ROOM</GameButton></div>
          <p className="action-note" id="room-preview-note">{resumeRoomCode ? <Link href={`/room/${resumeRoomCode}`}>RETURN TO YOUR ROOM: {resumeRoomCode} →</Link> : "THE BUTTON IS LIVE. BRING 4–10 FRIENDS."}</p>
          <div className="hero-meta"><span><GameIcon name="players" size={18} /> 4–10 PLAYERS</span><span className="meta-divider" /><span>RIGHT IN YOUR BROWSER</span></div>
          <GameButton className="how-link" variant="ghost" onClick={() => setOverlay("tutorial")}><span className="play-outline"><GameIcon name="play" size={12} /></span> HOW TO PLAY <GameIcon name="arrow" size={15} /></GameButton>
        </div>
        <SecretCardScene />
      </section>
      <section className="how-section content-width section-enter" id="how-to-play" aria-labelledby="how-title">
        <div className="section-heading-row"><SectionTitle eyebrow="THE RULES BEFORE THE RULES" id="how-title">FOUR STEPS. ZERO TRUST.</SectionTitle><p>Easy to learn.<br /><span>Hard to explain yourself.</span></p></div>
        <ol className="steps-list">{steps.map((step, index) => <li key={step.title}><span className="step-number" aria-hidden="true">0{index + 1}</span><div><h3>{step.title}</h3><p>{step.text}</p></div></li>)}</ol>
      </section>
      <section className="demo-section content-width section-enter" aria-labelledby="demo-title">
        <div className="demo-copy"><StatusBadge icon="secret">A PEEK INSIDE THE BOX</StatusBadge><h2 id="demo-title">THE BUTTON<span>.</span></h2><p className="demo-lead">One button.<br />Ten very different opinions.</p><p className="demo-description">Everyone sees the same counter. What they want to do with it? That’s another story.</p><p className="static-label"><span /> LOCAL DEMO · NO MULTIPLAYER</p></div>
        <ButtonDemo />
      </section>
    </main>
    <footer className="site-footer content-width"><MonochromeLogo /><p>Good friends. Questionable instructions.</p><span>THE BUTTON / 03</span></footer>
    {overlay === "settings" && <SettingsPanel connectionStatus={connection === "connected" ? "connected" : "preview"} onClose={() => setOverlay(null)} />}
    {overlay === "tutorial" && <HowToPlay onClose={() => setOverlay(null)} onRoomAction={roomAction} />}
    {(overlay === "create" || overlay === "join") && <RoomEntryModal mode={overlay} onClose={() => setOverlay(null)} />}
  </div>;
}

export function HomePage() {
  return <HomepageContent />;
}
