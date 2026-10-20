# Spaced review, and keeping progress safe

## Goal

1. **Mastered facts can fade.** Until now a fact was mastered for good once 80% of all its answers
   were right: a fact last seen two months ago stayed green, and one missed a lot at first stayed
   red long after the child knew it. Now mastery goes by the child's latest answers *and* by time:
   a mastered fact comes back for a check now and then, a little later each time it's remembered,
   and one left well past its check turns amber ("fading") until it's answered right again.
2. **Progress can't quietly disappear.** It lives only in the browser on one device, and Safari
   clears a website's storage when it isn't opened for 7 days (unless it's played from the Home
   Screen). The game now asks the browser to keep its storage, and a parent can save a backup file
   and restore it on any device.

## Spaced review (game/memory.ts)

A Leitner box system, the classic schedule for flash cards, which uses the spacing effect.

- **Box 0: not mastered yet.** A fact is mastered when the answer is right and at least 80% of its
  last five answers are right. This is the same 80% bar as before, now over the latest answers
  instead of all of them, so a fact the child once struggled with turns green as soon as they
  know it.
- **Boxes 1–7: mastered.** Each box says how long the fact can wait for its next check: 1 day,
  3 days, a week, 2 weeks, a month, 2 months, 4 months.
  - If the fact is answered right once its wait is over, it moves up a box.
  - A right answer before then changes nothing, because practice on the same day isn't spacing.
  - A miss starts its checks over. If the last five answers are still 80% right (one slip), it goes
    back to box 1 and stays green, and is checked the next day. If not, it goes back to box 0 and
    needs practice again.
- **Fading** means left past twice its wait, and at least a week past its check: after 8 days in
  box 1, 10 in box 2, 14, 28, 60, 120 and 240 days. A fading fact is amber on the practice map, is
  counted apart from mastered everywhere (badges still to earn, the addition stages, Crew Flight's
  navigator range, the Black Sun's progress), and comes up often until it's answered right, which
  moves it up a box again. Badges already earned and a Black Sun that has opened stay.
- **Asking:** the question picker weighs each fact by its `dueScore`, as before. A fact whose
  check is due counts at least 1.5 (a new fact counts 1, a settled one 0.2), and a fading one at
  least 2.5, so the checks come up within a session or so.
- Days are calendar days on the device, so "tomorrow" means after midnight, not 24 hours later.

### Stored per fact (`FactStat`)

- `last`: the last five answers, `'1'` for right, oldest first.
- `box`: the box the fact is in (0 to 7).
- `since`: the day it reached its box, or was last checked on time.

The totals (`attempts`, `correct`, `wrong`, `dueScore`) are kept as before.

### Upgrading saved progress

Saved mastery from before this change has no boxes, so it's upgraded the first time it's loaded.
Each fact's answers are replayed from the answer log, which has every answer since 7 October with
its time. So the boxes come out as if reviews had always been there, and a fact last practised two
weeks ago, mastered in a single session, is fading today.

A fact with no answers in the log is handled differently. Its answers all came before the log
existed, or were trimmed from it. It keeps the old verdict (mastered at 80% of all its answers,
which goes into box 1, checked from today), with `last` made up from that share. Until a map is
upgraded (for example when storage is blocked), a fact without a box is judged the old way.

## Keeping progress safe (storage/backup.ts)

- **Persistent storage:** once there's a pilot, the game calls `navigator.storage.persist()`, so
  Chrome, Edge and Firefox won't evict its storage. Firefox asks the user once; the others decide
  silently.
- **Backup file:** the parent dashboard (behind its grown-ups gate) gets a Backup card.
  - **Save a backup** writes every one of the game's saved keys into
    `multiplication-rocket-backup-<date>.json`. On a phone or tablet it opens the share sheet
    (Save to Files, AirDrop, Mail); elsewhere it downloads the file. The device's own network ID
    for the multiplayer games is left out.
  - **Restore from a backup** reads a file and lists its pilots, each with a tick box (all ticked).
    It writes back each ticked pilot's keys: their progress in every mission, answer history,
    badges, Black Sun record and crews. It replaces that pilot if the device has them and adds
    them if it doesn't. Pilots on this device that aren't ticked are left alone. Settings
    (language, sound, answer mode) are taken from the backup only if this device has none. The
    game then reloads.
  - The card shows when the last backup was saved, whether the browser has promised to keep the
    game's storage, and on an iPad or iPhone in Safari, a tip. The tip says Safari clears a site's
    storage after 7 days without a visit, and that a game added to the Home Screen starts with
    its own, empty storage, so save a backup first and restore it there.
- **A fresh device:** the welcome screen (before any pilot exists) has a link, "Moving from
  another device? Restore a backup". It needs no gate because there's nothing on the device to
  replace.
- Which keys belong to a pilot: every saved key with the pilot's id as one of its `:`-separated
  parts, or as one of a crew's pair (`<idA>+<idB>`). Any per-pilot key added later is backed up
  without changes here.
