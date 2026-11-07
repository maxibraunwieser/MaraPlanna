// One file per area keeps the English and the German text side by side. The generic makes the compiler check that both languages
// have exactly the same keys.

export interface Area<K extends string> {
  en: Record<K, string>;
  de: Record<K, string>;
}

export function area<K extends string>(a: { en: { [P in K]: string }; de: { [P in K]: string } }): Area<K> {
  return a;
}
