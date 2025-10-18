import fetch from 'node-fetch';

const TOPGG_API = 'https://top.gg/api/';

interface TopGGVote {
  voted: number;
  voteCount: number;
  voteReset: number;
}

export async function checkVoteStatus(
  userId: string,
): Promise<{ hasVoted: boolean; nextVote: Date; voteCount: number }> {
  if (!process.env.TOPGG_TOKEN) {
    throw new Error('Top.gg token is not configured');
  }

  try {
    const response = await fetch(`${TOPGG_API}/users/${userId}/vote`, {
      headers: {
        Authorization: process.env.TOPGG_TOKEN,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Top.gg API error: ${response.statusText}`);
    }

    const data = (await response.json()) as TopGGVote;

    return {
      hasVoted: data.voted === 1,
      nextVote: new Date(data.voteReset * 1000),
      voteCount: data.voteCount,
    };
  } catch (error) {
    console.error('Error checking Top.gg vote status:', error);
    throw new Error('Failed to verify vote status. Please try again later.');
  }
}

export function getVoteLink(): string {
  return 'https://top.gg/bot/${process.env.CLIENT_ID}/vote';
}
