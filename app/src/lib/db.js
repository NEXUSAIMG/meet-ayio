import { PrismaClient } from '@prisma/client';

// Um cliente só por processo (o dev do Next recarrega módulos).
const global_ = globalThis;
export const db = global_.__meetAyioDb || new PrismaClient();
if (process.env.NODE_ENV !== 'production') global_.__meetAyioDb = db;
