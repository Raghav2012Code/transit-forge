export type Tone = '' | 'good' | 'warn' | 'bad';

export function congTone(v: number): 'good' | 'warn' | 'bad' {
  return v >= 0.85 ? 'bad' : v >= 0.7 ? 'warn' : 'good';
}

export function occTone(v: number): 'good' | 'warn' | 'bad' {
  return v >= 95 ? 'bad' : v >= 85 ? 'warn' : 'good';
}
