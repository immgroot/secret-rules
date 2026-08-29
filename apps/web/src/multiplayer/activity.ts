/** Interaction hints only. No idle keepalive, mousemove, client AFK deadline, or gameplay authority. */
export function observeActivity(target: EventTarget, report: () => void, now = Date.now) {
  let previous = -Infinity;
  const onActivity = () => {
    const time = now();
    if (time - previous < 15_000) return;
    previous = time;
    report();
  };
  const events = ["pointerdown", "keydown", "input"];
  for (const event of events) target.addEventListener(event, onActivity, { capture: true, passive: true });
  return () => { for (const event of events) target.removeEventListener(event, onActivity, { capture: true }); };
}
