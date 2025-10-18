const VOTE_COOLDOWN_HOURS = 12;

export async function checkVoteStatus(
  userId: string,
): Promise<{ hasVoted: boolean; nextVote: Date; voteCount: number }> {
  const now = new Date();
  const nextVote = new Date(now.getTime() + VOTE_COOLDOWN_HOURS * 60 * 60 * 1000);

  console.log(`Vote check for user ${userId}. Next vote available at ${nextVote.toISOString()}`);

  return {
    hasVoted: true,
    nextVote,
    voteCount: 1,
  };
}

export function getVoteLink(): string {
  return `https://top.gg/bot/${process.env.CLIENT_ID}/vote`;
}
