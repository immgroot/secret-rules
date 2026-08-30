"use client";

import { useState } from "react";
import { GameIcon } from "../icons/game-icon.tsx";
import { GameButton } from "../ui/index.ts";

const VIDEO_PATH = "/videos/how-to-play.mp4";

export function VideoSection({ onOpenTutorial }: { onOpenTutorial: () => void }) {
  const [available, setAvailable] = useState(false);
  return <section className="video-section content-width section-enter" aria-labelledby="video-title"><div className="section-heading-row"><div><p className="eyebrow">SEE IT IN ACTION.</p><h2 id="video-title">ONE ROUND. ONE MINUTE.<br /><span>YOU’LL GET IT.</span></h2></div><p>Cards down.<br /><span>Stories up.</span></p></div>
    <div className="how-video" data-available={available}><video controls={available} preload="metadata" aria-label="How to play Secret Rules: The Button V2" onLoadedMetadata={() => setAvailable(true)} onError={() => setAvailable(false)}><source src={VIDEO_PATH} type="video/mp4" /><track kind="captions" label="English" src="/videos/how-to-play.vtt" srcLang="en" default /></video>{!available && <div className="how-video__poster" role="group" aria-label="How to play video preview"><span className="how-video__play" aria-hidden="true"><GameIcon name="play" size={34} /></span><strong>WATCH HOW A ROUND WORKS</strong><small>60–90 SECOND VIDEO · COMING SOON</small><p>Until the final cut arrives, play the guided version step by step.</p><GameButton size="small" onClick={onOpenTutorial}>OPEN INTERACTIVE TUTORIAL</GameButton></div>}</div>
  </section>;
}
