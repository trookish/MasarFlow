/**
 * R6: a fresh install must not vanish into the notification area. Hiding is an
 * opt-in the user makes in the wizard or the Control Center.
 */
export function closeBehavior(input: { closeToTray: boolean; quitting: boolean }): "quit" | "hide" {
  if (input.quitting) return "quit";
  return input.closeToTray ? "hide" : "quit";
}
