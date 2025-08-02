import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuthStore } from '../stores/authStore';

const LoginPage = () => {
  const [searchParams] = useSearchParams();
  const { login } = useAuthStore();

  useEffect(() => {
    const token = searchParams.get('token');
    const error = searchParams.get('error');

    if (error) {
      toast.error('Authentication failed. Please try again.');
    } else if (token) {
      const userData = {
        id: searchParams.get('user_id') || '',
        username: searchParams.get('username') || '',
        discriminator: searchParams.get('discriminator') || '',
        avatar: searchParams.get('avatar'),
      };

      login(token, userData);
      toast.success('Successfully logged in!');
    }
  }, [searchParams, login]);

  const handleDiscordLogin = async () => {
    try {
      window.location.href = `${import.meta.env.VITE_FRONTEND_URL}/api/auth/discord`;
    } catch (_error) {
      toast.error('Failed to initiate Discord login');
    }
  };

  return (
    <div className="min-h-screen p-8 bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
      <main className="max-w-md mx-auto">
        <div className="text-center mb-8 pt-8">
          <img
            src="/bot_icon.png"
            alt="Aethel Bot Logo"
            width={120}
            height={120}
            className="mx-auto mb-6 pixel-art rounded-2xl w-32 h-32 object-cover"
          />
          <h1 className="text-4xl font-bold text-gray-800 dark:text-white mb-2">
            Aethel Dashboard
          </h1>
          <p className="text-gray-600 dark:text-gray-300 text-lg">
            Manage your todos and AI API keys
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 backdrop-blur-sm dark:bg-opacity-90">
          <div className="text-center space-y-6">
            <div>
              <h2 className="text-2xl font-semibold text-gray-800 dark:text-white mb-2">
                Welcome back
              </h2>
              <p className="text-gray-600 dark:text-gray-300">
                Sign in with your Discord account to continue
              </p>
            </div>

            <button
              onClick={handleDiscordLogin}
              className="w-full flex items-center justify-center px-8 py-3 border border-transparent rounded-full shadow-sm text-white bg-[#5865F2] hover:bg-[#4752c4] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#5865F2] transition-all transform hover:scale-105 font-bold shadow-lg hover:shadow-xl"
            >
              <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z" />
              </svg>
              Continue with Discord
            </button>

            <div className="text-xs text-gray-600 dark:text-gray-400 text-center">
              By signing in, you agree to our terms of service and privacy policy.
            </div>
          </div>
        </div>

        <div className="text-center mt-8">
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            Need help? Contact us on our Discord server
          </p>
        </div>
      </main>
    </div>
  );
};

export default LoginPage;
