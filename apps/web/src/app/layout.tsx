import type {Metadata} from 'next';
import {Providers} from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'ticketera',
  description: 'Gestión de tickets tipo Jira',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
        />
      </head>
      <body className="min-h-screen bg-surface font-sans text-content antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
