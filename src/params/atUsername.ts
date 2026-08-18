export function match(param: string): boolean {
  return /^@[a-z0-9._-]{3,40}$/u.test(param);
}
