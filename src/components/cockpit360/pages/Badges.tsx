import { useEffect, useState } from 'react';
import { useAchievements } from '../../../game/useAchievements';
import { BadgesContent } from '../../badges/BadgesPage';

// The top right of the bank of screens on the left wall: the pilot's rank,
// the ladder up to Honored Captain and every badge (the badges page's own,
// badges/BadgesPage.tsx). The new ones are tagged while it's open, and
// they're seen once it's closed.

export function BadgesScreenPage() {
  // captured on open, so NEW tags stay up while the screen is showing
  const [unseen] = useState(() => new Set(useAchievements.getState().unseen));
  useEffect(() => () => useAchievements.getState().markAllSeen(), []);
  return (
    <div className="ck3-page ck3-badges">
      <BadgesContent unseen={unseen} />
    </div>
  );
}
