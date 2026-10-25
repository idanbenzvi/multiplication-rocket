import { describe, expect, it } from 'vitest';
import { guessLang } from './guessLang';

describe('guessLang', () => {
  it('is Hebrew for a device that reads Hebrew, first or not', () => {
    expect(guessLang(['he-IL'])).toBe('he');
    expect(guessLang(['he'])).toBe('he');
    expect(guessLang(['en-US', 'en', 'he'], 'Europe/London')).toBe('he');
    // (its old code, and an underscore)
    expect(guessLang(['iw-IL'])).toBe('he');
    expect(guessLang(['he_IL'])).toBe('he');
  });

  it("is Hebrew for a device in Israel, whatever it's set to read", () => {
    expect(guessLang(['en-US'], 'Asia/Jerusalem')).toBe('he');
    expect(guessLang(['en-US'], 'Asia/Tel_Aviv')).toBe('he');
    expect(guessLang(['en-IL'], 'UTC')).toBe('he');
    expect(guessLang(['ru-IL'])).toBe('he');
  });

  it('is English otherwise', () => {
    expect(guessLang(['en-US'], 'America/New_York')).toBe('en');
    expect(guessLang(['fr-FR', 'en'], 'Europe/Paris')).toBe('en');
    expect(guessLang(['zh-Hant-TW'], 'Asia/Taipei')).toBe('en');
    expect(guessLang([])).toBe('en');
    expect(guessLang([''], undefined)).toBe('en');
  });
});
