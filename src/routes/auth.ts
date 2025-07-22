import { Router } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../utils/pgClient';
import logger from '../utils/logger';
import { authenticateToken } from '../middlewares/auth';

const router = Router();

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_REDIRECT_URI =
  process.env.DISCORD_REDIRECT_URI || 'http://localhost:8080/api/auth/discord/callback';
const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar?: string;
  email?: string;
}

router.get('/discord', (req, res) => {
  const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(DISCORD_REDIRECT_URI)}&response_type=code&scope=identify`;
  res.redirect(discordAuthUrl);
});

router.get('/discord/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    logger.error('Discord OAuth error:', error);
    return res.redirect(`${FRONTEND_URL}/login?error=oauth_error`);
  }

  if (!code) {
    logger.error('No authorization code received from Discord');
    return res.redirect(`${FRONTEND_URL}/login?error=no_code`);
  }

  try {
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID!,
        client_secret: DISCORD_CLIENT_SECRET!,
        grant_type: 'authorization_code',
        code: code as string,
        redirect_uri: DISCORD_REDIRECT_URI,
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error('Failed to exchange code for token');
    }

    const tokenData = await tokenResponse.json();

    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    if (!userResponse.ok) {
      throw new Error('Failed to fetch user information');
    }

    const discordUser: DiscordUser = await userResponse.json();

    const userQuery = 'SELECT user_id, created_at FROM users WHERE user_id = $1';
    const userResult = await pool.query(userQuery, [discordUser.id]);

    if (userResult.rows.length === 0) {
      const insertQuery =
        'INSERT INTO users (user_id, language, created_at) VALUES ($1, $2, NOW())';
      await pool.query(insertQuery, [discordUser.id, 'en']);
      logger.info(
        `New user created: ${discordUser.username}#${discordUser.discriminator} (${discordUser.id})`
      );
    }

    const jwtToken = jwt.sign(
      {
        userId: discordUser.id,
        username: discordUser.username,
        discriminator: discordUser.discriminator === '0' ? null : discordUser.discriminator,
        avatar: discordUser.avatar,
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const redirectUrl = new URL(`${FRONTEND_URL}/login`);
    redirectUrl.searchParams.set('token', jwtToken);
    redirectUrl.searchParams.set('user_id', discordUser.id);
    redirectUrl.searchParams.set('username', discordUser.username);
    if (discordUser.discriminator && discordUser.discriminator !== '0') {
      redirectUrl.searchParams.set('discriminator', discordUser.discriminator);
    }
    if (discordUser.avatar) {
      redirectUrl.searchParams.set('avatar', discordUser.avatar);
    }

    res.redirect(redirectUrl.toString());
  } catch (error) {
    logger.error('Discord OAuth callback error:', error);
    res.redirect(`${FRONTEND_URL}/login?error=auth_failed`);
  }
});

router.get('/me', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const userQuery = 'SELECT user_id, language, created_at FROM users WHERE user_id = $1';
    const userResult = await pool.query(userQuery, [userId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    res.json({
      user: {
        id: user.user_id,
        username: req.user?.username,
        discriminator: req.user?.discriminator,
        avatar: req.user?.avatar,
        language: user.language,
        createdAt: user.created_at,
      },
    });
  } catch (error) {
    logger.error('Error fetching user info:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/logout', authenticateToken, (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

export default router;
