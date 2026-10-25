import {fileURLToPath} from 'node:url';
// Resolve from the repository tool location, independent of the invoking shell.
export const repoRoot=fileURLToPath(new URL('../../',import.meta.url));
