// A popup menu placed at a point (a right-click, or under a ⋯ button) is kept inside the window: once it is drawn and
// its size known, a menu that would run past the bottom opens upward from the point, and one past the right edge
// moves left. Call from a layout effect with the menu element and the point it was opened at.
// `above`: the top of the button it hangs from, so an upward menu ends above the button, not over it.
export function fitMenu(el: HTMLElement | null, x: number, y: number, above = y, margin = 8): void {
  if (!el) return;
  const { width, height } = el.getBoundingClientRect();
  const vw = window.innerWidth, vh = window.innerHeight;
  let top = y, left = x;
  if (top + height > vh - margin) top = above - height - 4 > margin ? above - height - 4 : Math.max(margin, vh - height - margin);
  if (left + width > vw - margin) left = Math.max(margin, vw - width - margin);
  el.style.top = `${top}px`; el.style.left = `${left}px`;
}
