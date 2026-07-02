import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export default function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
    const main = document.querySelector('.main-content');
    if (main) main.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
