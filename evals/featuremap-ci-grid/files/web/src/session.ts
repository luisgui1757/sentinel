export const SESSION_HEADER = 'x-grid-session';

export const session = (token: string) => ({ [SESSION_HEADER]: token });
