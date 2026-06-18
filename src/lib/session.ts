import { and, eq } from 'drizzle-orm';
import { players } from '@db/schema';

export async function validateSession(
  db: any,
  playerId: number,
  sessionToken?: string,
  gameId?: number
) {
  if (!sessionToken) return null;

  const [player] = await db
    .select()
    .from(players)
    .where(and(eq(players.id, playerId), eq(players.sessionToken, sessionToken)))
    .limit(1);

  if (!player) return null;
  if (gameId !== undefined && player.gameId !== gameId) return null;

  return player;
}
