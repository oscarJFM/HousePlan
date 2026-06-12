import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";

import AuthPage from "@/pages/auth";
import DashboardPage from "@/pages/dashboard";
import NewRoomPage from "@/pages/new-room";
import RoomDetailPage from "@/pages/room-detail";
import RoomScanPage from "@/pages/room-scan";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function Router() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-background">Loading...</div>;
  }

  return (
    <Switch>
      <Route path="/" component={user ? DashboardPage : AuthPage} />
      <Route path="/dashboard" component={user ? DashboardPage : AuthPage} />
      <Route path="/rooms/new" component={user ? NewRoomPage : AuthPage} />
      <Route path="/rooms/:id" component={user ? RoomDetailPage : AuthPage} />
      <Route path="/rooms/:id/scan" component={user ? RoomScanPage : AuthPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
