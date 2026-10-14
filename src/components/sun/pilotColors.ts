// Each pilot in a Monster Sun fight has a colour: their roster chip, their
// beams at the monster, their sparks. By seat, so it's the same on every phone.
const PILOT_COLORS = ['#6ad7ff', '#ff8fd0', '#7dff9a', '#ffd77a', '#c49bff', '#ff9d4a'];

export function pilotColor(seat: number): string {
  return PILOT_COLORS[((seat % PILOT_COLORS.length) + PILOT_COLORS.length) % PILOT_COLORS.length];
}
