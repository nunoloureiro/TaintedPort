import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { CartProvider } from '@/context/CartContext';
import { WishlistProvider } from '@/context/WishlistContext';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import CoverageTracker from '@/components/CoverageTracker';

export const metadata = {
  title: 'TaintedPort - Portuguese Wine Store (Security Test App)',
  description: 'TaintedPort is a deliberately vulnerable Portuguese wine store for DAST and security testing purposes.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen bg-dark flex flex-col">
        <CoverageTracker />
        <AuthProvider>
          <CartProvider>
            <WishlistProvider>
              <Navbar />
              <main className="pt-16 flex-1">
                {children}
              </main>
              <Footer />
            </WishlistProvider>
          </CartProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
