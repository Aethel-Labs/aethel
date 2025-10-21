const VOTE_COOLDOWN_HOURS = 12;

export async function checkVoteStatus(
  _userId: string,
): Promise<{ hasVoted: boolean; nextVote: Date; voteCount: number }> {
  const now = new Date();
  const nextVote = new Date(now.getTime() + VOTE_COOLDOWN_HOURS * 60 * 60 * 1000);

  return {
    hasVoted: true,
    nextVote,
    voteCount: 1,
  };
}
