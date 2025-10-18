import fetch from 'node-fetch';

const TOPGG_API = 'https://top.gg/api';

interface TopGGVote {
  created_at: string;
  expires_at: string;
  weight: number;
}

export async function checkVoteStatus(
  userId: string,
): Promise<{ hasVoted: boolean; nextVote: Date; voteCount: number }> {
  if (!process.env.TOPGG_TOKEN) {
    throw new Error('Top.gg token is not configured');
  }

  try {
    const response = await fetch(`${TOPGG_API}/v1/projects/@me/votes/${userId}`, {
      headers: {
        Authorization: process.env.TOPGG_TOKEN,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Top.gg API error: ${response.statusText}`);
    }

    const responseData = await response.json();
    console.log('Top.gg API Response:', JSON.stringify(responseData, null, 2));
    
    const data = responseData as TopGGVote;
    const hasVoted = !!data?.created_at;
    
    return {
      hasVoted,
      nextVote: new Date(data.expires_at),
      voteCount: hasVoted ? data.weight : 0,
    };
  } catch (error) {
    console.error('Error checking Top.gg vote status:', error);
    throw new Error('Failed to verify vote status. Please try again later.');
  }
}

export function getVoteLink(): string {
  return `https://top.gg/bot/${process.env.CLIENT_ID}/vote`;
}
