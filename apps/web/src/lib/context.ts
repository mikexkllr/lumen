import { createContext } from 'react';

/** Kept in its own module so hot reloads of the store do not create a second context. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const AppContext = createContext<any>(null);
