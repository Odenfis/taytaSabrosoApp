export type BackdropPress = { pointerId: number; x: number; y: number; onBackdrop: boolean };
export function isBackdropClick(start: BackdropPress | null, end: BackdropPress) {
  return !!start && start.onBackdrop && end.onBackdrop && start.pointerId === end.pointerId &&
    Math.hypot(end.x - start.x, end.y - start.y) <= 5;
}
