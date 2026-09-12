import { SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../constants.js';

/** Marks a route as exempt from the global JWT access-token guard. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
