import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { type ReactNode } from "react";
import appCss from "../styles.css?url";
import { AuthProvider } from "@/lib/auth";
import { Toaster } from "sonner";
import { GlobalErrorBoundary, GlobalErrorFallback } from "@/components/ErrorBoundary";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Beauty House — Gestão" },
      { name: "description", content: "Sistema de gestão Beauty House" },
      { property: "og:title", content: "Beauty House — Gestão" },
      { name: "twitter:title", content: "Beauty House — Gestão" },
      { property: "og:description", content: "Sistema de gestão Beauty House" },
      { name: "twitter:description", content: "Sistema de gestão Beauty House" },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/37b0eba5-6380-49ab-b8e7-d97b9cf99258/id-preview-e6229ef0--09bf12c4-5429-4ab3-967c-1b18e5048f36.lovable.app-1780356288261.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/37b0eba5-6380-49ab-b8e7-d97b9cf99258/id-preview-e6229ef0--09bf12c4-5429-4ab3-967c-1b18e5048f36.lovable.app-1780356288261.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=Nunito:wght@300;400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  errorComponent: ({ error }) => <GlobalErrorFallback error={error} />,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <GlobalErrorBoundary>
        <AuthProvider>
          <Outlet />
          <Toaster position="top-right" richColors />
        </AuthProvider>
      </GlobalErrorBoundary>
    </QueryClientProvider>
  );
}
