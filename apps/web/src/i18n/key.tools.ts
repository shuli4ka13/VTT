import { keyFrom } from '@vtt/engine';

const words = process.argv.slice(2);
if (!words.length) { console.log('какой ключ выйдет из слова: npx tsx src/i18n/key.tools.ts <слово> …'); process.exit(1); }
for (const word of words) console.log(`${word} -> ${keyFrom(word)}`);
