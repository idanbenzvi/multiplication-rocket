// The preview build (VITE_PREVIEW=1, published at …/multiplication-rocket/preview/)
// is the same site to the browser as the real game, so it would share the
// children's saved pilots and progress. Here every localStorage key gets a
// "preview:" prefix instead, so a test version can never touch real progress.
//
// Imported first in main.tsx: the stores read storage as soon as they load.

export const IS_PREVIEW = import.meta.env.VITE_PREVIEW === '1';

const PREFIX = 'preview:';

if (IS_PREVIEW) {
  const proto = Storage.prototype;
  const { getItem, setItem, removeItem, key } = proto;
  const lengthOf = Object.getOwnPropertyDescriptor(proto, 'length')!.get!;

  // this build's keys, unprefixed
  const ownKeys = (store: Storage): string[] => {
    const keys: string[] = [];
    const n = lengthOf.call(store) as number;
    for (let i = 0; i < n; i++) {
      const k = key.call(store, i);
      if (k?.startsWith(PREFIX)) keys.push(k.slice(PREFIX.length));
    }
    return keys;
  };

  proto.getItem = function (k: string) {
    return getItem.call(this, PREFIX + k);
  };
  proto.setItem = function (k: string, v: string) {
    setItem.call(this, PREFIX + k, v);
  };
  proto.removeItem = function (k: string) {
    removeItem.call(this, PREFIX + k);
  };
  proto.key = function (i: number) {
    return ownKeys(this)[i] ?? null;
  };
  proto.clear = function () {
    for (const k of ownKeys(this)) removeItem.call(this, PREFIX + k);
  };
  Object.defineProperty(proto, 'length', {
    configurable: true,
    get(this: Storage) {
      return ownKeys(this).length;
    },
  });
}
