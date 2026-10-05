export type Lang = 'en' | 'he';

// Every player-facing string lives here. Math expressions (operands, ×, =,
// arrows) are deliberately NOT in this table — they're language-neutral and
// always rendered left-to-right, even inside the Hebrew RTL layout, which is
// how Israeli school workbooks print them too.
const en = {
  logo: 'MULT-ROCKET',
  level: (n: number) => `Level ${n}`,
  destination: 'Destination:',
  stopAndReview: 'Stop & Review',
  reset: 'Reset',
  resetConfirm: 'Reset all progress? This clears every streak and mastered fact.',
  langToggle: 'עברית',
  langToggleTitle: 'החלפה לעברית',
  sound: 'Sound',
  music: 'Music',
  effects: 'Effects',

  fuel: 'FUEL',
  best: (n: number) => `best ${n}`,
  nailTheseToLaunch: '🔒 Nail these to launch:',
  more: (n: number) => `+${n} more`,

  zoneFast: 'BIG BOOST',
  zoneMid: 'NORMAL',
  zoneSlow: 'SMALL BOOST',
  yourAnswer: 'Your answer',
  gotItContinue: 'Got it! Continue',
  gridCaption: (x: number, y: number) => `${x} rows × ${y} columns = ${x * y}`,
  streak: (n: number) => `${n} in a row!`,
  onFire: 'ON FIRE',
  // Praise escalates with the streak: tier 0 = 1-2 in a row, 1 = 3-4, 2 = 5-9, 3 = 10+.
  praise: [
    ['Nice!', 'Yes!', 'Correct!', 'Good one!'],
    ['Awesome!', 'Boom!', 'Zoom!', 'Super!'],
    ['Rocket brain!', 'Superstar!', 'Amazing!', 'On a roll!'],
    ['UNSTOPPABLE!', 'LEGENDARY!', 'MATH MASTER!', 'INCREDIBLE!'],
  ],
  milestoneTitle: (n: number) => `${n} in a row!`,
  milestoneSubtitle: ['What a streak!', 'You are flying!', 'Nothing can stop you!', 'Hall of fame!'],

  showHint: 'Show hint',
  pressHToHide: 'Press H to hide',
  hintTimesOne: 'Anything × 1 stays the same.',
  hintTimesTen: '× 10 just adds a zero.',
  hintSmall: (x: number, y: number) => `Small numbers — picture ${x} groups of ${y} and count them.`,
  hintHalveDouble: 'Halve it, then double:',

  blastOff: 'Blast off!',
  youReached: 'You reached',
  nextStop: 'Next stop:',
  nextMission: 'Next Mission',
  holdToBoost: 'Hold to boost 🚀',

  heatmapTitle: 'Your Multiplication Map',
  heatmapSubtitle: 'Green = mastered · Red = needs more practice',
  keepPracticing: 'Keep Practicing',

  destinations: [
    'The Moon',
    'Mars',
    'The Asteroid Belt',
    'Jupiter',
    'Saturn',
    'Uranus',
    'Neptune',
    'A Comet',
    'A Space Station',
    'An Alien Planet',
    'A Distant Galaxy',
  ],
  sector: (n: number) => `Sector ${n}`,
};

export type Strings = typeof en;

const he: Strings = {
  logo: 'טיל הכפל',
  level: (n) => `שלב ${n}`,
  destination: 'יעד:',
  stopAndReview: 'עצירה וחזרה',
  reset: 'איפוס',
  resetConfirm: 'לאפס את כל ההתקדמות? כל הרצפים והתרגילים שנלמדו יימחקו.',
  langToggle: 'English',
  langToggleTitle: 'Switch to English',
  sound: 'צלילים',
  music: 'מוזיקה',
  effects: 'אפקטים',

  fuel: 'דלק',
  best: (n) => `שיא ${n}`,
  nailTheseToLaunch: '🔒 צריך לפצח את אלה כדי לשגר:',
  more: (n) => `+${n} נוספים`,

  zoneFast: 'בוסט ענק',
  zoneMid: 'רגיל',
  zoneSlow: 'בוסט קטן',
  yourAnswer: 'התשובה שלך',
  gotItContinue: 'הבנתי! ממשיכים',
  gridCaption: (x, y) => `${x} שורות × ${y} עמודות = ${x * y}`,
  streak: (n) => `${n} ברצף!`,
  onFire: 'בוער!',
  praise: [
    ['יפה!', 'כן!', 'נכון!', 'יופי!'],
    ['מדהים!', 'בום!', 'זוּם!', 'סופר!'],
    ['מוח של טיל!', 'כוכב על!', 'מטורף!', 'איזה רצף!'],
    ['בלתי ניתן לעצירה!', 'אגדי!', 'אלוף הכפל!', 'פשוט מדהים!'],
  ],
  milestoneTitle: (n) => `${n} ברצף!`,
  milestoneSubtitle: ['איזה רצף!', 'עפים על זה!', 'אי אפשר לעצור את זה!', 'להיכל התהילה!'],

  showHint: 'הצג רמז',
  pressHToHide: 'לחצו H כדי להסתיר',
  hintTimesOne: 'כל מספר × 1 נשאר אותו דבר.',
  hintTimesTen: '× 10 — פשוט מוסיפים אפס.',
  hintSmall: (x, y) => `מספרים קטנים — דמיינו ${x} קבוצות של ${y} וספרו אותן.`,
  hintHalveDouble: 'חוצים לשניים, ואז מכפילים פי 2:',

  blastOff: 'שיגור!',
  youReached: 'הגעת אל',
  nextStop: 'התחנה הבאה:',
  nextMission: 'למשימה הבאה',
  holdToBoost: 'לחצו והחזיקו לבוסט 🚀',

  heatmapTitle: 'מפת הכפל שלך',
  heatmapSubtitle: 'ירוק = שולטים · אדום = צריך עוד תרגול',
  keepPracticing: 'ממשיכים להתאמן',

  destinations: [
    'הירח',
    'מאדים',
    'חגורת האסטרואידים',
    'צדק',
    'שבתאי',
    'אורנוס',
    'נפטון',
    'שביט',
    'תחנת חלל',
    'כוכב לכת של חייזרים',
    'גלקסיה רחוקה',
  ],
  sector: (n) => `גזרה ${n}`,
};

export const STRINGS: Record<Lang, Strings> = { en, he };

export function destinationName(
  t: Strings,
  config: { destinationIndex: number; destinationSector: number },
): string {
  const base = t.destinations[config.destinationIndex];
  return config.destinationSector === 1 ? base : `${base} (${t.sector(config.destinationSector)})`;
}
