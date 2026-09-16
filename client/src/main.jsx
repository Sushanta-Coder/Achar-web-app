import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

/**
 * Entry point.
 *
 * Provider order matters and is set here rather than in App so it is visible at a
 * glance: Settings and Auth are independent, Cart and Wishlist both read Auth (they
 * merge the guest copy on sign-in), and Toast wraps everything because any of them may
 * want to report a failure.
 */
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
