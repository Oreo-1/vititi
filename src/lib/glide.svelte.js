// Someone else's drag reaches us as a few updates a second (one per server round trip),
// so instead of jumping, things glide from update to update. Call during component setup.
import { untrack } from 'svelte';
import { Tween } from 'svelte/motion';
import { linear } from 'svelte/easing';

/**
 * @param {() => Record<string, number>} target  the record's current numbers (reactive)
 * @param {() => boolean} instant  true when the change is our own (a local drag), which must not lag
 * @param {(to: Record<string, number>, from: Record<string, number>) => Record<string, number>} [path]
 *   adjusts the glide target, e.g. so an angle turns the short way; the exact target is set at the end
 * @returns {Tween<Record<string, number>>} read `.current` for what to draw
 */
export function glide(target, instant, path) {
  let latest = untrack(target);
  const pos = new Tween(latest);
  let last = 0;
  $effect(() => {
    const to = target();
    untrack(() => {
      // Only real changes count. Then everything showing the same record (a drawing and
      // its handles) times its glides alike, however long each has been on screen.
      if (Object.keys(to).every((k) => Object.is(to[k], latest[k]))) return;
      latest = to;
      const now = performance.now();
      const gap = now - last;
      last = now;
      // glide over about the time between updates, so the speed stays even
      const duration = instant() ? 0 : gap < 1000 ? Math.min(Math.max(gap, 50), 250) : 150;
      const via = duration && path ? path(to, pos.current) : to;
      pos.set(via, { duration, easing: linear }).then(() => {
        if (via !== to && latest === to) pos.set(to, { duration: 0 });
      });
    });
  });
  return pos;
}

/**
 * A drawing (AoE) with its corners and angle gliding; our own edits and the live preview
 * (no id) stay instant. Angles turn the short way round (350° → 10° is +20°, not −340°).
 * @param {() => any} record  the drawing record (reactive)
 * @param {(id: string) => boolean} isOwnEdit
 * @returns {{ readonly current: any }} the record with the glided numbers in place
 */
export function glideDrawing(record, isOwnEdit) {
  const pos = glide(
    () => {
      const d = record();
      return { x1: Number(d.x1), y1: Number(d.y1), x2: Number(d.x2), y2: Number(d.y2), rotation: Number(d.rotation) || 0 };
    },
    () => { const id = record().id; return !id || isOwnEdit(id); },
    (to, from) => ({ ...to, rotation: from.rotation + ((((to.rotation - from.rotation) % 360) + 540) % 360) - 180 }),
  );
  const shown = $derived({ ...record(), ...pos.current });
  return { get current() { return shown; } };
}
